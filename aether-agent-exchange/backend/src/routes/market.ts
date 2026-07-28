import { Router, Response } from 'express';

const router = Router();

type SpotCache = {
  pair: string;
  amount: string;
  base: string;
  currency: string;
  fetchedAt: string;
  expiresAt: number;
  source: string;
};

const spotCache = new Map<string, SpotCache>();

const SUPPORTED_PAIRS = new Set(['ETH-USD', 'MON-USD', 'USDC-USD']);

function cachedPayload(cache: SpotCache, cached: boolean) {
  return {
    pair: cache.pair,
    base: cache.base,
    currency: cache.currency,
    amount: cache.amount,
    fetchedAt: cache.fetchedAt,
    cached,
    source: cache.source,
  };
}

async function coinbaseSpot(pair: string): Promise<SpotCache> {
  const response = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Coinbase spot request failed: ${response.status}`);
  const body = await response.json() as { data?: { base?: string; currency?: string; amount?: string } };
  const amount = body.data?.amount;
  const parsed = Number(amount);
  if (!amount || !Number.isFinite(parsed) || parsed <= 0) throw new Error(`Coinbase spot response missing ${pair} amount`);

  return {
    pair,
    amount,
    base: body.data?.base || pair.split('-')[0],
    currency: body.data?.currency || 'USD',
    fetchedAt: new Date().toISOString(),
    expiresAt: Date.now() + 60_000,
    source: 'coinbase',
  };
}

async function monUsdSpot(): Promise<SpotCache> {
  const configuredAmount = process.env.MON_USD_SPOT_PRICE;
  const parsedAmount = Number(configuredAmount);
  if (configuredAmount && Number.isFinite(parsedAmount) && parsedAmount > 0) {
    return {
      pair: 'MON-USD',
      amount: configuredAmount,
      base: 'MON',
      currency: 'USD',
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60_000,
      source: 'env:MON_USD_SPOT_PRICE',
    };
  }

  const configuredUrl = process.env.MON_USD_SPOT_URL;
  if (configuredUrl) {
    const response = await fetch(configuredUrl, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`MON spot request failed: ${response.status}`);
    const body = await response.json() as { amount?: string | number; data?: { amount?: string | number } };
    const amount = String(body.amount ?? body.data?.amount ?? '');
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('MON spot response missing amount');
    return {
      pair: 'MON-USD',
      amount,
      base: 'MON',
      currency: 'USD',
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60_000,
      source: 'configured:MON_USD_SPOT_URL',
    };
  }

  throw new Error('MON/USD spot price is not configured');
}

async function fetchSpot(pair: string): Promise<SpotCache> {
  if (pair === 'USDC-USD') {
    return {
      pair,
      amount: '1',
      base: 'USDC',
      currency: 'USD',
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60_000,
      source: 'static-usdc-par',
    };
  }
  if (pair === 'MON-USD') return monUsdSpot();
  return coinbaseSpot(pair);
}

router.get('/market/spot/:pair', async (req, res: Response): Promise<void> => {
  const pair = String(req.params.pair || '').toUpperCase();
  if (!SUPPORTED_PAIRS.has(pair)) {
    res.status(404).json({ error: 'Unsupported spot pair' });
    return;
  }

  const now = Date.now();
  const cached = spotCache.get(pair);
  if (cached && cached.expiresAt > now) {
    res.json(cachedPayload(cached, true));
    return;
  }

  try {
    const spot = await fetchSpot(pair);
    spotCache.set(pair, spot);
    res.json(cachedPayload(spot, false));
  } catch {
    res.status(503).json({ error: `${pair} spot price unavailable` });
  }
});

export default router;
