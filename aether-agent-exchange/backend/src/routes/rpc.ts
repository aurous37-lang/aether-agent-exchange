import { Router, Request, Response } from 'express';
import { getChainByKey, type ChainConfig } from '../config/chains';

const router = Router();

const ALLOWED_EVM_METHODS = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
]);

const MAX_BATCH_SIZE = Number(process.env.RPC_PROXY_MAX_BATCH_SIZE || '10');
const MAX_BODY_BYTES = Number(process.env.RPC_PROXY_MAX_BODY_BYTES || '65536');
const CHAIN_ID_CACHE_MS = Number(process.env.RPC_PROXY_CHAIN_ID_CACHE_MS || '60000');

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type ChainIdCacheEntry = { chainId: number; expiresAt: number };
const upstreamChainIdCache = new Map<string, ChainIdCacheEntry>();

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateCall(call: unknown): { ok: true; value: JsonRpcRequest } | { ok: false; error: ReturnType<typeof jsonRpcError> } {
  if (!isPlainObject(call)) {
    return { ok: false, error: jsonRpcError(null, -32600, 'Invalid JSON-RPC request') };
  }

  const request = call as JsonRpcRequest;
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return { ok: false, error: jsonRpcError(request.id, -32600, 'Invalid JSON-RPC request') };
  }

  if (!ALLOWED_EVM_METHODS.has(request.method)) {
    return { ok: false, error: jsonRpcError(request.id, -32601, 'JSON-RPC method is not allowed') };
  }

  if (request.params !== undefined && !Array.isArray(request.params) && !isPlainObject(request.params)) {
    return { ok: false, error: jsonRpcError(request.id, -32602, 'Invalid JSON-RPC params') };
  }

  return { ok: true, value: request };
}

async function assertUpstreamChain(chain: ChainConfig, rpcUrl: string): Promise<void> {
  const cached = upstreamChainIdCache.get(rpcUrl);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.chainId !== chain.chainId) throw new Error('cached chain mismatch');
    return;
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(Number(process.env.RPC_PROXY_TIMEOUT_MS || '10000')),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'aae-chain-check', method: 'eth_chainId', params: [] }),
  });
  if (!response.ok) throw new Error(`chain check failed: ${response.status}`);
  const body = await response.json() as { result?: string };
  const chainId = typeof body.result === 'string' ? Number.parseInt(body.result, 16) : NaN;
  if (!Number.isFinite(chainId) || chainId !== chain.chainId) {
    throw new Error(`upstream chainId ${body.result || 'unknown'} does not match ${chain.key}`);
  }
  upstreamChainIdCache.set(rpcUrl, { chainId, expiresAt: Date.now() + CHAIN_ID_CACHE_MS });
}

router.post('/rpc/:chainKey', async (req: Request, res: Response): Promise<void> => {
  const chainKey = Array.isArray(req.params.chainKey) ? req.params.chainKey[0] : req.params.chainKey;
  const chain = getChainByKey(chainKey);
  if (!chain) {
    res.status(404).json({ error: 'Unsupported RPC chain' });
    return;
  }

  const rpcUrl = chain.rpcUrl;
  if (!rpcUrl) {
    res.status(503).json({ error: `${chain.name} RPC is not configured` });
    return;
  }

  const bodyText = JSON.stringify(req.body);
  if (Buffer.byteLength(bodyText, 'utf8') > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'RPC request body is too large' });
    return;
  }

  const calls = Array.isArray(req.body) ? req.body : [req.body];
  if (calls.length === 0 || calls.length > MAX_BATCH_SIZE) {
    res.status(400).json({ error: 'Invalid RPC batch size' });
    return;
  }

  const validated = calls.map(validateCall);
  const blocked = validated.find((entry) => !entry.ok);
  if (blocked && !blocked.ok) {
    res.status(200).json(Array.isArray(req.body) ? validated.map((entry) => entry.ok ? jsonRpcError(entry.value.id, -32603, 'RPC batch rejected') : entry.error) : blocked.error);
    return;
  }

  try {
    await assertUpstreamChain(chain, rpcUrl);
    const upstream = await fetch(rpcUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(Number(process.env.RPC_PROXY_TIMEOUT_MS || '10000')),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: bodyText,
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const responseText = await upstream.text();
    res.status(upstream.status);
    res.type(contentType.includes('json') ? 'application/json' : 'text/plain');
    res.send(responseText);
  } catch {
    res.status(503).json({ error: `${chain.name} RPC upstream unavailable` });
  }
});

export default router;
