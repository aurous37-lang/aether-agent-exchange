import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { wsService } from './services/websocket';
import { startScheduler } from './services/scheduler';
import { assertRuntimeSchemaReady, type RuntimeSchemaStatus } from './services/runtimeSchema';
import { verifyToken } from './middleware/auth';
import { requestMonitoring, getMetrics, getHealthData } from './middleware/monitoring';
import { AuthRequest } from './types';

import authRoutes from './routes/auth';
import jobRoutes from './routes/jobs';
import agentRoutes from './routes/agents';
import serviceOfferRoutes from './routes/serviceOffers';
import handlerRoutes from './routes/handler';
import disputeRoutes from './routes/disputes';
import agentApiRoutes from './routes/agent-api';
import reportRoutes from './routes/reports';
import px402Routes from './routes/px402';
import mcpRoutes from './routes/mcp';
import workspaceRoutes from './routes/workspaces';
import settlementProviderRoutes from './routes/settlementProviders';
import marketRoutes from './routes/market';
import rpcRoutes from './routes/rpc';

const app = express();
const server = createServer(app);
let runtimeSchemaStatus: RuntimeSchemaStatus | null = null;
const configuredCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

const trustProxyHops = Number.parseInt(process.env.AAE_TRUST_PROXY_HOPS || process.env.TRUST_PROXY_HOPS || '1', 10);
app.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : false);

// ─── Security Middleware ─────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: configuredCorsOrigin,
  credentials: true,  // Required for httpOnly cookie auth
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Cookie-authenticated state changes must originate from the configured UI.
// SameSite=Strict remains the first line of defense; this explicit check also
// protects deployments whose proxy or browser behavior weakens that signal.
app.use((req: express.Request, res: express.Response, next: express.NextFunction): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const hasBearerToken = req.headers.authorization?.startsWith('Bearer ') === true;
  const hasAuthCookie = typeof req.cookies?.aether_token === 'string';
  if (!hasAuthCookie || hasBearerToken) {
    next();
    return;
  }

  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(configuredCorsOrigin).origin;
  } catch {
    res.status(500).json({ error: 'CORS_ORIGIN must be an absolute origin' });
    return;
  }

  if (req.headers.origin !== allowedOrigin) {
    res.status(403).json({ error: 'Request origin is not allowed' });
    return;
  }

  next();
});

// ─── Request Monitoring ─────────────────────────────────────────
// Must be before routes so every request is instrumented.
app.use(requestMonitoring);

// ─── Identity-Aware Tiered Rate Limiting ─────────────────────────
//
// Tier 1: Unauthenticated (IP-based) — /api/auth/*
// Tier 2: Authenticated (wallet-based) — all authenticated routes
// Tier 3: Agent API (API-key-based) — /api/agent-api/*
// Tier 4: Write ops (wallet-based, stricter) — POST/PUT/DELETE on authenticated routes
// Nonce: Per-wallet — /api/auth/nonce specifically

// Env-configurable limits (set high values to disable for stress tests)
const RATE_LIMITS = {
  auth:  parseInt(process.env.RATE_LIMIT_AUTH  || '20'),
  user:  parseInt(process.env.RATE_LIMIT_USER  || '120'),
  agent: parseInt(process.env.RATE_LIMIT_AGENT || '60'),
  write: parseInt(process.env.RATE_LIMIT_WRITE || '30'),
  nonce: parseInt(process.env.RATE_LIMIT_NONCE || '10'),
  rpc:   parseInt(process.env.RATE_LIMIT_RPC   || '240'),
  api:   parseInt(process.env.RATE_LIMIT_API   || '300'),
};

// Lightweight middleware: extract wallet from JWT (if present) for rate-limit keying.
// Does NOT enforce auth — routes still use requireAuth for that.
function extractWallet(req: AuthRequest, _res: express.Response, next: express.NextFunction): void {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.aether_token;
    if (token) {
      req.auth = verifyToken(token);
    }
  } catch {
    // Token invalid/expired — ignore; auth enforcement is handled per-route
  }
  next();
}

// Tier 1: Unauthenticated — IP-based, applies to /api/auth/*
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.auth,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// Nonce endpoint: per-wallet rate limit
const nonceLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.nonce,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) =>
    (req.body as Record<string, string>)?.walletAddress?.toLowerCase() || req.ip || 'unknown',
  message: { error: 'Too many nonce requests for this wallet.' },
});

// Tier 2: Authenticated — wallet-based, applies to all authenticated routes
const userLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.user,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) =>
    (req as AuthRequest).auth?.walletAddress || req.ip || 'unknown',
  message: { error: 'Too many requests, please try again later.' },
});

// Tier 3: Agent API — API-key-based, applies to /api/agent-api/*
const agentApiLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.agent,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) =>
    (req.headers['x-agent-api-key'] as string) || req.ip || 'unknown',
  message: { error: 'Too many agent API requests, please try again later.' },
});

// Tier 4: Write operations — wallet-based, stricter, POST/PUT/DELETE only
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.write,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) =>
    (req as AuthRequest).auth?.walletAddress || req.ip || 'unknown',
  skip: (req: express.Request) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: { error: 'Too many write operations, please slow down.' },
});

const rpcLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.rpc,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) => req.ip || 'unknown',
  message: { error: 'Too many RPC requests, please slow down.' },
});

// A baseline limiter covers every API route, including public reads and any
// future router that is not yet assigned a narrower identity-aware tier.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMITS.api,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) => req.ip || 'unknown',
  message: { error: 'Too many API requests, please try again later.' },
});

app.use('/api/', apiLimiter);
// Apply Tier 1 (IP-based) to auth routes
app.use('/api/auth/', authLimiter);
// Apply nonce-specific limiter (per-wallet)
app.use('/api/auth/nonce', nonceLimiter);
// Apply Tier 3 (API-key-based) to agent API routes
app.use('/api/agent-api/', agentApiLimiter);

// Extract wallet for identity-aware limiting on authenticated routes
app.use('/api/jobs/', extractWallet);
app.use('/api/agents/', extractWallet);
app.use('/api/service-offers/', extractWallet);
app.use('/api/handler/', extractWallet);
app.use('/api/disputes/', extractWallet);
app.use('/api/px402/', extractWallet);
app.use('/api/mcp/', extractWallet);
app.use('/api/workspaces/', extractWallet);

// Apply Tier 2 (wallet-based) to authenticated routes
app.use('/api/jobs/', userLimiter);
app.use('/api/agents/', userLimiter);
app.use('/api/service-offers/', userLimiter);
app.use('/api/handler/', userLimiter);
app.use('/api/disputes/', userLimiter);
app.use('/api/px402/', userLimiter);
app.use('/api/mcp/', userLimiter);
app.use('/api/workspaces/', userLimiter);

// Apply Tier 4 (write limiter) to authenticated routes
app.use('/api/jobs/', writeLimiter);
app.use('/api/agents/', writeLimiter);
app.use('/api/service-offers/', writeLimiter);
app.use('/api/handler/', writeLimiter);
app.use('/api/disputes/', writeLimiter);
app.use('/api/px402/', writeLimiter);
app.use('/api/mcp/', writeLimiter);
app.use('/api/workspaces/', writeLimiter);

// Public read-only RPC proxy. The upstream provider URL stays server-side.
app.use('/api/rpc/', rpcLimiter);

// ─── Routes ──────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api', workspaceRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/service-offers', serviceOfferRoutes);
app.use('/api/handler', handlerRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/agent-api', agentApiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/px402', px402Routes);
app.use('/api/mcp', mcpRoutes);
app.use('/api', settlementProviderRoutes);
app.use('/api', marketRoutes);
app.use('/api', rpcRoutes);

// Health check (enhanced with uptime and request stats)
app.get('/api/health', (_req, res) => {
  res.json({
    ...getHealthData(),
    runtimeSchema: runtimeSchemaStatus,
  });
});

// Metrics endpoint — requires auth in production, open in dev
app.get('/api/metrics', (req: express.Request, res: express.Response) => {
  if (process.env.NODE_ENV === 'production') {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req as any).cookies?.aether_token;
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    try {
      const payload = verifyToken(token);
      if (payload.role !== 'ADMIN') { res.status(403).json({ error: 'Admin access required' }); return; }
    } catch {
      res.status(401).json({ error: 'Invalid token' }); return;
    }
  }
  res.json(getMetrics());
});

// ─── Error Handler ───────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── WebSocket ───────────────────────────────────────────────────

wsService.init(server);

// ─── Start ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '4000', 10);
async function startApi(): Promise<void> {
  runtimeSchemaStatus = await assertRuntimeSchemaReady('api');
  server.listen(PORT, () => {
    console.log(`[Aether] Backend API running on http://localhost:${PORT}`);
    console.log(`[Aether] WebSocket on ws://localhost:${PORT}/ws`);

    if (process.env.AAE_API_START_SCHEDULER !== 'false') {
      startScheduler();
    } else {
      console.log('[Aether] API scheduler disabled; worker process owns background jobs.');
    }
  });
}

startApi().catch((error) => {
  console.error('[Aether] Runtime schema readiness check failed:', error.message || error);
  process.exit(1);
});

export default app;
