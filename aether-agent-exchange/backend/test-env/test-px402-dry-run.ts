#!/usr/bin/env npx tsx

import http from 'http';
import assert from 'assert';
import {
  canUsePx402,
  Px402Policy,
  resolveAllowlistedEndpoint,
  runPx402DryRun,
  validateNoPaymentHeaders,
} from '../src/services/px402DryRun';
import { deposit, makePayment, setNote, wrapFetch } from '../src/services/prxvtLiveSdk';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  OK ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`    ${err.message}`);
  }
}

async function withMockServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  fn: (url: string) => Promise<void>,
) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    await fn(`http://127.0.0.1:${address.port}/probe`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function policyFor(url: string, overrides: Partial<Px402Policy> = {}): Px402Policy {
  return {
    mode: 'dry-run',
    allowedNetworks: ['base-sepolia'],
    maxProbeUsd: '0.25',
    allowPlainX402Fallback: false,
    endpointAllowlist: [new URL(url).origin],
    ...overrides,
  };
}

async function main() {
  console.log('\npx402 dry-run tests\n');

  await test('parses valid x402 HTTP 402 challenge and redacts raw header', async () => {
    await withMockServer((_req, res) => {
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Payment-Required', JSON.stringify({ scheme: 'exact', network: 'base-sepolia' }));
      res.end(JSON.stringify({
        accepts: [{
          scheme: 'exact',
          network: 'base-sepolia',
          maxAmountRequired: '10000',
          currency: 'USDC',
          payTo: '0x1111111111111111111111111111111111111111',
          maxTimeoutSeconds: 60,
        }],
      }));
    }, async url => {
      const result = await runPx402DryRun({ url, policy: policyFor(url) });
      assert.equal(result.requirements.status, 402);
      assert.equal(result.requirements.amount, '0.01');
      assert.equal(result.requirements.rawHeaderPresent, true);
      assert.equal(result.requirements.redaction, 'raw-payment-header-omitted');
      assert.equal(result.plan.redactedReceipt.rawPaymentHeaderStored, false);
      assert.equal(result.plan.redactedReceipt.railCandidate, 'px402');
      assert(!JSON.stringify(result).includes('Payment-Required'));
    });
  });

  await test('rejects unsupported network', async () => {
    await withMockServer((_req, res) => {
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        accepts: [{
          network: 'polygon',
          maxAmountRequired: '10000',
          currency: 'USDC',
          payTo: '0x1111111111111111111111111111111111111111',
        }],
      }));
    }, async url => {
      const result = await runPx402DryRun({ url, policy: policyFor(url) });
      assert.equal(result.plan.redactedReceipt.railCandidate, 'unsupported');
      assert(result.plan.redactedReceipt.policyReasons.some(reason => reason.includes('unsupported network')));
    });
  });

  await test('rejects amount above cap', async () => {
    await withMockServer((_req, res) => {
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        accepts: [{
          network: 'base-sepolia',
          maxAmountRequired: '1000000',
          currency: 'USDC',
          payTo: '0x1111111111111111111111111111111111111111',
        }],
      }));
    }, async url => {
      const result = await runPx402DryRun({ url, policy: policyFor(url, { maxProbeUsd: '0.25' }) });
      assert.equal(result.plan.redactedReceipt.railCandidate, 'unsupported');
      assert(result.plan.redactedReceipt.policyReasons.some(reason => reason.includes('exceeds dry-run cap')));
    });
  });

  await test('rejects Base Sepolia challenge with wrong chainId', async () => {
    await withMockServer((_req, res) => {
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        accepts: [{
          network: 'base-sepolia',
          chainId: 8453,
          maxAmountRequired: '10000',
          currency: 'USDC',
          payTo: '0x1111111111111111111111111111111111111111',
        }],
      }));
    }, async url => {
      const result = await runPx402DryRun({ url, policy: policyFor(url) });
      assert.equal(result.plan.redactedReceipt.railCandidate, 'unsupported');
      assert(result.plan.redactedReceipt.policyReasons.some(reason => reason.includes('chainId')));
    });
  });

  await test('parses Base mainnet x402 challenge when explicitly allowlisted', async () => {
    await withMockServer((_req, res) => {
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        accepts: [{
          network: 'base',
          chainId: 8453,
          maxAmountRequired: '25000',
          currency: 'USDC',
          payTo: '0x1111111111111111111111111111111111111111',
        }],
      }));
    }, async url => {
      const result = await runPx402DryRun({
        url,
        policy: policyFor(url, { allowedNetworks: ['base', 'base-sepolia'], maxProbeUsd: '0.25' }),
      });
      assert.equal(result.requirements.network, 'base');
      assert.equal(result.requirements.chainId, 8453);
      assert.equal(result.plan.redactedReceipt.railCandidate, 'px402');
    });
  });

  await test('rejects non-allowlisted endpoint before fetching', async () => {
    await withMockServer(() => {
      throw new Error('server should not be called');
    }, async url => {
      await assert.rejects(
        () => runPx402DryRun({ url, policy: policyFor(url, { endpointAllowlist: ['https://example.invalid'] }) }),
        /not allowlisted/,
      );
    });
  });

  await test('requires an exact allowlisted origin and bounded path prefix', () => {
    const allowed = resolveAllowlistedEndpoint(
      'https://payments.example/probe/quote',
      ['https://payments.example/probe'],
    );
    assert.equal(allowed.toString(), 'https://payments.example/probe/quote');

    assert.throws(
      () => resolveAllowlistedEndpoint(
        'https://payments.example.evil.invalid/probe/quote',
        ['https://payments.example/probe'],
      ),
      /not allowlisted/,
    );
    assert.throws(
      () => resolveAllowlistedEndpoint(
        'https://payments.example/probe-bypass',
        ['https://payments.example/probe'],
      ),
      /not allowlisted/,
    );
  });

  await test('rejects endpoint credentials and fragments', () => {
    assert.throws(
      () => resolveAllowlistedEndpoint(
        'https://user:secret@payments.example/probe',
        ['https://payments.example'],
      ),
      /without credentials/,
    );
    assert.throws(
      () => resolveAllowlistedEndpoint(
        'https://payments.example/probe#internal',
        ['https://payments.example'],
      ),
      /without credentials/,
    );
  });

  await test('rejects caller-supplied payment and authorization headers', () => {
    assert.throws(() => validateNoPaymentHeaders({ Authorization: 'Bearer secret' }), /not allowed/);
    assert.throws(() => validateNoPaymentHeaders({ 'X-Payment': 'secret' }), /not allowed/);
    assert.doesNotThrow(() => validateNoPaymentHeaders({ 'X-Client-Trace': 'dry-run' }));
  });

  await test('does not retry with payment after receiving a 402', async () => {
    let requests = 0;
    await withMockServer((req, res) => {
      requests++;
      assert.equal(req.headers.authorization, undefined);
      assert.equal(req.headers['x-payment'], undefined);
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        accepts: [{
          network: 'base-sepolia',
          maxAmountRequired: '10000',
          currency: 'USDC',
          payTo: '0x1111111111111111111111111111111111111111',
        }],
      }));
    }, async url => {
      await runPx402DryRun({ url, policy: policyFor(url) });
      assert.equal(requests, 1);
    });
  });

  await test('does not follow redirects from an allowlisted endpoint', async () => {
    let requests = 0;
    await withMockServer((_req, res) => {
      requests++;
      res.statusCode = 302;
      res.setHeader('Location', 'http://127.0.0.1/internal');
      res.end();
    }, async url => {
      await assert.rejects(
        () => runPx402DryRun({ url, policy: policyFor(url) }),
        /did not return x402 payment requirements/,
      );
      assert.equal(requests, 1);
    });
  });

  await test('rejects oversized probe responses', async () => {
    await withMockServer((_req, res) => {
      res.statusCode = 402;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ padding: 'x'.repeat(300_000) }));
    }, async url => {
      await assert.rejects(
        () => runPx402DryRun({ url, policy: policyFor(url) }),
        /size limit/,
      );
    });
  });

  await test('live PRXVT SDK stubs remain disabled', async () => {
    await assert.rejects(() => deposit(), /disabled/);
    await assert.rejects(() => makePayment(), /disabled/);
    assert.throws(() => setNote(), /disabled/);
    assert.throws(() => wrapFetch(), /disabled/);
  });

  await test('canUsePx402 fails closed for malformed challenge', () => {
    const decision = canUsePx402({
      endpoint: 'https://example.invalid/probe',
      method: 'GET',
      status: 402,
      currency: 'USDC',
      amount: '0.01',
      rawHeaderPresent: false,
      redaction: 'raw-payment-header-omitted',
    }, {
      mode: 'dry-run',
      allowedNetworks: ['base-sepolia'],
      maxProbeUsd: '0.25',
      allowPlainX402Fallback: false,
      endpointAllowlist: ['https://example.invalid'],
    });
    assert.equal(decision.ok, false);
    assert(decision.reasons.length >= 2);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
