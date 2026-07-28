import { Router, Request, Response } from 'express';
import { generateNonce, SiweMessage } from 'siwe';
import { getAddress } from 'viem';
import prisma from '../lib/prisma';
import { generateToken, requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { auditLog } from '../services/audit';
import { getActiveChain, CHAINS, publicContractAddressesForChain } from '../config/chains';
import {
  storeNonce as redisStoreNonce,
  getNonce as redisGetNonce,
  deleteNonce as redisDeleteNonce,
  getRedisClient,
} from '../services/redis';

const POLICY_VERSION = process.env.POLICY_VERSION || '2026-03-23';

const router = Router();

// In-memory nonce store (fallback when Redis is not configured)
const nonceStore = new Map<string, { nonce: string; expires: number }>();

const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

function originFromEnv(): URL | null {
  const configured = process.env.SIWE_ORIGIN || process.env.PUBLIC_WEB_ORIGIN || process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
  if (!configured) return null;
  try {
    return new URL(configured);
  } catch {
    return null;
  }
}

function requestOrigin(req: Request): URL | null {
  const origin = req.get('origin');
  if (!origin) return null;
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function siweOrigin(req: Request): URL {
  return originFromEnv() || requestOrigin(req) || new URL('http://localhost:5173');
}

function createSiweMessage(walletAddress: string, nonce: string, req: Request): string {
  const origin = siweOrigin(req);
  const activeChain = getActiveChain();
  return new SiweMessage({
    domain: origin.host,
    address: getAddress(walletAddress),
    statement: 'Sign in to Aether Agent Exchange.',
    uri: origin.origin,
    version: '1',
    chainId: activeChain.chainId,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + NONCE_EXPIRY_MS).toISOString(),
  }).prepareMessage();
}

function isPlausibleEvmSignature(signature: unknown): boolean {
  if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(signature)) return false;
  const r = BigInt(`0x${signature.slice(2, 66)}`);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = Number.parseInt(signature.slice(130, 132), 16);
  return r > 0n && r < SECP256K1_N && s > 0n && s < SECP256K1_N && (v === 27 || v === 28 || v === 0 || v === 1);
}

/**
 * Check if Redis is available for nonce storage.
 * Falls back to in-memory Map when REDIS_URL is not set.
 */
async function isRedisAvailable(): Promise<boolean> {
  const client = await getRedisClient();
  return client !== null;
}

router.post('/nonce', async (req: Request, res: Response): Promise<void> => {
  const { walletAddress } = req.body;
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    res.status(400).json({ error: 'Valid wallet address required' });
    return;
  }

  const nonce = generateNonce();
  const normalized = walletAddress.toLowerCase();

  // Store nonce in Redis if available, otherwise use in-memory Map
  if (await isRedisAvailable()) {
    await redisStoreNonce(normalized, nonce, NONCE_EXPIRY_MS);
  } else {
    nonceStore.set(normalized, { nonce, expires: Date.now() + NONCE_EXPIRY_MS });
  }

  res.json({
    nonce,
    message: createSiweMessage(walletAddress, nonce, req),
  });
});

router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  const { walletAddress, message, signature } = req.body;
  if (!walletAddress || !message || !signature) {
    res.status(400).json({ error: 'walletAddress, message, and signature required' });
    return;
  }
  if (!isPlausibleEvmSignature(signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const normalized = walletAddress.toLowerCase() as `0x${string}`;

  // Retrieve nonce from Redis if available, otherwise from in-memory Map
  let stored: { nonce: string; expires: number } | null | undefined;
  const useRedis = await isRedisAvailable();
  if (useRedis) {
    stored = await redisGetNonce(normalized);
  } else {
    stored = nonceStore.get(normalized) || null;
  }

  if (!stored || Date.now() > stored.expires) {
    res.status(401).json({ error: 'Nonce expired or not found. Request a new one.' });
    return;
  }

  try {
    const siwe = new SiweMessage(message);
    const origin = siweOrigin(req);
    const activeChain = getActiveChain();
    const validAddress = siwe.address.toLowerCase() === normalized;
    const validChain = siwe.chainId === activeChain.chainId;
    const validUri = (() => {
      try {
        return new URL(siwe.uri).origin === origin.origin;
      } catch {
        return false;
      }
    })();
    const result = await siwe.verify(
      { signature, domain: origin.host, nonce: stored.nonce },
      { suppressExceptions: true }
    );

    if (!result.success || !validAddress || !validChain || !validUri) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Signature verification failed' });
    return;
  }

  // Consume nonce (delete from whichever store was used)
  if (useRedis) {
    await redisDeleteNonce(normalized);
  } else {
    nonceStore.delete(normalized);
  }

  // Upsert user
  const user = await prisma.user.upsert({
    where: { walletAddress: normalized },
    update: {},
    create: { walletAddress: normalized },
  });

  const token = generateToken({
    userId: user.id,
    walletAddress: user.walletAddress,
    role: user.role,
  });

  // Set httpOnly cookie (primary auth mechanism — not accessible to XSS)
  res.cookie('aether_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24h, matching JWT expiry
    path: '/',
  });

  res.json({
    token,
    user: {
      id: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
      displayName: user.displayName,
      termsAccepted: !!user.termsAcceptedAt,
      policyVersion: user.policyVersion,
    },
  });
});

// ─── Accept Terms (Granular Consent) ──────────────────────────────
// Records user consent per type (terms, privacy, risk, disclosure).
// Body: { consentTypes: ['terms', 'privacy', 'risk', 'disclosure'] }
// All four are required for full consent. Partial acceptance is tracked.

const VALID_CONSENT_TYPES = ['terms', 'privacy', 'risk', 'disclosure'] as const;

router.post('/accept-terms', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { consentTypes } = req.body as { consentTypes?: string[] };
  const types = consentTypes?.filter(t => VALID_CONSENT_TYPES.includes(t as any)) || ['terms', 'privacy', 'risk', 'disclosure'];

  // Upsert each consent record
  const results = await Promise.all(
    types.map(consentType =>
      prisma.userConsent.upsert({
        where: {
          userId_consentType_policyVersion: {
            userId: req.auth!.userId,
            consentType,
            policyVersion: POLICY_VERSION,
          },
        },
        update: { acceptedAt: new Date() },
        create: {
          userId: req.auth!.userId,
          consentType,
          policyVersion: POLICY_VERSION,
        },
      })
    )
  );

  // Also update the legacy fields for backwards compat
  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { termsAcceptedAt: new Date(), policyVersion: POLICY_VERSION },
  });

  auditLog(req.auth!.walletAddress, 'TERMS_ACCEPTED', 'USER', req.auth!.userId, {
    policyVersion: POLICY_VERSION,
    consentTypes: types,
  });

  res.json({
    accepted: results.map(r => ({ type: r.consentType, version: r.policyVersion, at: r.acceptedAt })),
    policyVersion: POLICY_VERSION,
  });
});

// ─── Consent Status ───────────────────────────────────────────────
// Returns granular consent state — which types are accepted for the current version.

router.get('/consent-status', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const consents = await prisma.userConsent.findMany({
    where: { userId: req.auth!.userId, policyVersion: POLICY_VERSION },
  });

  const acceptedTypes = consents.map(c => c.consentType);
  const allAccepted = VALID_CONSENT_TYPES.every(t => acceptedTypes.includes(t));

  res.json({
    currentVersion: POLICY_VERSION,
    consents: consents.map(c => ({ type: c.consentType, acceptedAt: c.acceptedAt })),
    acceptedTypes,
    allAccepted,
    missing: VALID_CONSENT_TYPES.filter(t => !acceptedTypes.includes(t)),
  });
});

// ─── Platform Info ────────────────────────────────────────────────
// Public endpoint — returns policy version, fee, and supported tokens.

router.get('/platform-info', async (_req: Request, res: Response): Promise<void> => {
  const feeBps = parseInt(process.env.PLATFORM_FEE_BPS || '170', 10);
  const activeChain = getActiveChain();
  const contractAddressesByChain = Object.fromEntries(
    Object.values(CHAINS).map((chain) => [chain.key, publicContractAddressesForChain(chain.key)])
  );
  res.json({
    policyVersion: POLICY_VERSION,
    platformFeeBps: feeBps,
    platformFeePercent: `${(feeBps / 100).toFixed(1)}%`,
    supportedTokens: activeChain.supportedTokens,
    networkKey: activeChain.key,
    chainId: activeChain.chainId,
    network: {
      name: activeChain.name,
      key: activeChain.key,
      chainId: activeChain.chainId,
      caip2Network: activeChain.caip2Network,
      nativeCurrency: activeChain.nativeCurrency,
      explorerUrl: activeChain.explorerUrl,
      settlementRails: activeChain.settlementRails,
      confirmationDepth: activeChain.confirmationDepth,
      reorgDepth: activeChain.reorgDepth,
      rpcConfigured: !!activeChain.rpcUrl,
    },
    chains: Object.values(CHAINS).map((chain) => ({
      key: chain.key,
      name: chain.name,
      chainId: chain.chainId,
      caip2Network: chain.caip2Network,
      nativeCurrency: chain.nativeCurrency,
      explorerUrl: chain.explorerUrl,
      settlementRails: chain.settlementRails,
      confirmationDepth: chain.confirmationDepth,
      reorgDepth: chain.reorgDepth,
      rpcConfigured: !!chain.rpcUrl,
    })),
    contractAddresses: publicContractAddressesForChain(activeChain.key),
    contractAddressesByChain,
  });
});

export default router;
