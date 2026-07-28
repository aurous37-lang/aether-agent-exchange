import { Router, Response } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { requireConsent } from '../middleware/consent';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';
import { probePx402Quote } from '../services/px402';
import {
  authorizeX402SellerResourceAccess,
  buildX402SellerRequirement,
  executeApprovedX402BuyerPayment,
  prepareX402BuyerIntent,
  verifyAndRecordX402SettlementReceipt,
} from '../services/x402';
import { SettlementError } from '../services/settlement';
import { Px402DryRunError, runPx402DryRun } from '../services/px402DryRun';
import { auditLog } from '../services/audit';
import {
  px402DryRunSchema,
  x402BuyerIntentSchema,
  x402SellerResourceParamsSchema,
  x402SettlementReceiptSchema,
} from '../utils/validation';

const router = Router();
const BASE_SEPOLIA_NETWORK = 'base-sepolia';
const BASE_SEPOLIA_CHAIN_ID = 84532;

const probeQuoteSchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(['GET', 'HEAD']).default('GET'),
});

router.post('/probe-quote', requireAuth, requireConsent, validate(probeQuoteSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quote = await probePx402Quote(req.body);
    auditLog(req.auth!.walletAddress, 'PX402_DRY_RUN_QUOTE', 'PX402', quote.receiptHash, {
      endpoint: quote.endpoint,
      network: quote.network,
      chainId: quote.chainId,
      amount: quote.amount,
    });
    res.json(quote);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'px402 probe failed' });
  }
});

router.post('/dry-run', requireAuth, requireConsent, validate(px402DryRunSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { url, method, headers, body, agentId, jobId, paymentPrivacyMode } = req.body;
    let endpoint = url;
    let probeAgentId = agentId;
    let jobForLedger: {
      id: string;
      clientId: string;
      agentId: string | null;
      network: string | null;
      chainId: number | null;
      agent?: {
        id: string;
        handlerId: string;
        walletAddress: string;
        paymentPrivacyMode: string;
        x402EndpointUrl: string | null;
      } | null;
    } | null = null;

    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          agent: {
            select: {
              id: true,
              handlerId: true,
              walletAddress: true,
              paymentPrivacyMode: true,
              x402EndpointUrl: true,
            },
          },
        },
      });
      if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

      const wallet = req.auth!.walletAddress.toLowerCase();
      const isClient = job.clientId === req.auth!.userId;
      const isAssignedHandler = Boolean(job.agent && (
        job.agent.handlerId === req.auth!.userId ||
        job.agent.walletAddress.toLowerCase() === wallet
      ));
      if (!isClient && !isAssignedHandler) {
        res.status(403).json({ error: 'Not authorized for this job px402 dry-run' });
        return;
      }

      if (job.network !== BASE_SEPOLIA_NETWORK || job.chainId !== BASE_SEPOLIA_CHAIN_ID) {
        res.status(409).json({ error: 'px402 job dry-run requires Base Sepolia chainId 84532' });
        return;
      }

      if (probeAgentId && job.agentId && probeAgentId !== job.agentId) {
        res.status(409).json({ error: 'agentId does not match the assigned job agent' });
        return;
      }

      probeAgentId = probeAgentId || job.agentId || undefined;
      endpoint = endpoint || job.agent?.x402EndpointUrl || undefined;
      jobForLedger = job;
    }

    if (probeAgentId) {
      const jobAgent = jobForLedger?.agent;
      const agent = jobAgent?.id === probeAgentId
        ? jobAgent
        : await prisma.agent.findUnique({
          where: { id: probeAgentId },
          select: {
            id: true,
            handlerId: true,
            walletAddress: true,
            paymentPrivacyMode: true,
            x402EndpointUrl: true,
          },
        });
      if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

      const agentMode = paymentPrivacyMode || agent.paymentPrivacyMode;
      if (agentMode === 'standard') {
        res.status(409).json({ error: 'Agent is configured for standard escrow, not x402/px402 probes' });
        return;
      }

      endpoint = endpoint || agent.x402EndpointUrl || undefined;
    }

    if (!endpoint) { res.status(400).json({ error: 'url is required when agent has no x402 endpoint configured' }); return; }

    const dryRun = await runPx402DryRun({ url: endpoint, method, headers, body });
    const receipt = dryRun.plan.redactedReceipt;
    const receiptHash = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
    const redactedReference = dryRun.plan.lifecycle.redactedReferences.receiptReference;

    const ledger = await prisma.paymentLedger.create({
      data: {
        jobId: jobForLedger?.id,
        receipt: 'redacted-px402-dry-run',
        rail: 'px402-dry-run',
        mode: 'probe',
        amount: receipt.amount || '0',
        token: receipt.currency || undefined,
        tokenSymbol: receipt.currency || undefined,
        wallet: req.auth!.walletAddress.toLowerCase(),
        walletAddress: req.auth!.walletAddress.toLowerCase(),
        endpoint: receipt.endpoint,
        receiptHash,
        chainId: receipt.chainId || undefined,
        network: receipt.network || undefined,
        status: dryRun.plan.rail === 'unsupported' ? 'BLOCKED' : 'QUOTED',
        redactedReference,
        redactedReferenceHash: dryRun.plan.lifecycle.redactedReferences.receiptReferenceHash,
        redactedReferenceType: 'base-mcp-x402-dry-run-receipt',
        redactedPaymentReference: receipt.redactedQuoteReference,
      },
    });

    auditLog(req.auth!.walletAddress, 'PX402_DRY_RUN_QUOTED', 'PAYMENT_LEDGER', ledger.id, {
      ledgerId: ledger.id,
      rail: 'px402-dry-run',
      railCandidate: dryRun.plan.rail,
      jobId: jobForLedger?.id,
      endpointHash: receipt.endpointHash,
      baseMcpStatus: dryRun.plan.lifecycle.status.mcpStatus,
      rawPaymentHeaderStored: false,
      automaticPaymentHeaders: false,
      paidRetries: false,
    });

    res.json({
      ledgerId: ledger.id,
      jobId: jobForLedger?.id,
      quote: receipt,
      requirements: dryRun.requirements,
      lifecycle: dryRun.plan.lifecycle,
      policy: {
        mode: dryRun.policy.mode,
        allowedNetworks: dryRun.policy.allowedNetworks,
        maxProbeUsd: dryRun.policy.maxProbeUsd,
        allowPlainX402Fallback: dryRun.policy.allowPlainX402Fallback,
      },
      executeDisabled: true,
      automaticPaymentHeaders: false,
      paidRetries: false,
      requiredApprovals: dryRun.plan.requiredApprovals,
    });
  } catch (error: any) {
    if (error instanceof Px402DryRunError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error.message || 'px402 dry-run failed' });
  }
});

router.post('/x402/settlement-receipts', requireAuth, requireConsent, validate(x402SettlementReceiptSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.body.jobId } });
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    if (job.clientId !== req.auth!.userId) { res.status(403).json({ error: 'Not the client' }); return; }
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SELF_ATTESTED_SETTLEMENT_RECEIPTS !== 'true') {
      res.status(503).json({ error: 'Manual x402 receipt ingestion is disabled in production' });
      return;
    }

    const ledger = await verifyAndRecordX402SettlementReceipt(job.id, req.body);
    await prisma.job.update({
      where: { id: job.id },
      data: { settlementStatus: 'SETTLED' },
    });

    auditLog(req.auth!.walletAddress, 'X402_SETTLEMENT_RECEIPT_RECORDED', 'PAYMENT_LEDGER', ledger.id, {
      jobId: job.id,
      rail: ledger.rail,
      network: ledger.network,
      chainId: ledger.chainId,
      receiptHash: ledger.receiptHash,
      rawPaymentHeaderStored: false,
      rawSignatureStored: false,
    });

    res.status(201).json({
      id: ledger.id,
      jobId: job.id,
      rail: ledger.rail,
      status: ledger.status,
      receiptHash: ledger.receiptHash,
      txHash: ledger.txHash,
      settlementStatus: 'SETTLED',
    });
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message || 'x402 settlement receipt failed' });
  }
});

router.get('/x402/seller/resources/:resourceId', validate(x402SellerResourceParamsSchema, 'params'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requirement = buildX402SellerRequirement(String(req.params.resourceId));
    res.status(402).json({
      x402Version: 1,
      accepts: [requirement],
      paymentRequired: requirement,
      rawPaymentHeaderStored: false,
      nextAction: 'submit an x402 payment through an approved wallet/client path; AAE stores only redacted settlement evidence',
    });
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message || 'x402 seller requirement failed' });
  }
});

router.get('/x402/seller/resources/:resourceId/access', validate(x402SellerResourceParamsSchema, 'params'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await authorizeX402SellerResourceAccess(
      String(req.params.resourceId),
      typeof req.query.ledgerId === 'string' ? req.query.ledgerId : undefined,
    );
    res.json({
      ...access,
      resource: {
        id: access.resourceId,
        status: 'available',
        redacted: true,
      },
      rawPaymentHeaderStored: false,
    });
  } catch (error: any) {
    if (error instanceof SettlementError && error.statusCode === 402) {
      try {
        const requirement = buildX402SellerRequirement(String(req.params.resourceId));
        res.status(402).json({
          x402Version: 1,
          accepts: [requirement],
          paymentRequired: requirement,
          rawPaymentHeaderStored: false,
        });
        return;
      } catch {
        // Fall through to the original error if requirements cannot be built.
      }
    }
    res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message || 'x402 seller access failed' });
  }
});

router.post('/x402/buyer/intents', requireAuth, requireConsent, validate(x402BuyerIntentSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.body.jobId) {
      const job = await prisma.job.findUnique({ where: { id: req.body.jobId }, include: { agent: true } });
      if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
      const wallet = req.auth!.walletAddress.toLowerCase();
      const isClient = job.clientId === req.auth!.userId;
      const isAssignedHandler = Boolean(job.agent && (
        job.agent.handlerId === req.auth!.userId ||
        job.agent.walletAddress.toLowerCase() === wallet
      ));
      if (!isClient && !isAssignedHandler) {
        res.status(403).json({ error: 'Not authorized for this job x402 buyer intent' });
        return;
      }
    }

    const intent = await prepareX402BuyerIntent({
      ...req.body,
      walletAddress: req.auth!.walletAddress,
    });

    auditLog(req.auth!.walletAddress, 'X402_BUYER_INTENT_PREPARED', 'PAYMENT_LEDGER', intent.ledgerId, {
      jobId: intent.jobId,
      state: intent.state,
      network: intent.requirements.network,
      chainId: intent.requirements.chainId,
      amount: intent.requirements.amount,
      amountAtomic: intent.requirements.amountAtomic,
      rawPaymentHeaderStored: false,
      automaticPaymentHeaders: false,
      executeDisabled: true,
    });

    res.status(201).json({
      ...intent,
      automaticPaymentHeaders: false,
      rawPaymentHeaderStored: false,
      paymentExecution: 'disabled',
    });
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message || 'x402 buyer intent failed' });
  }
});

router.post('/x402/buyer/intents/:id/execute', requireAuth, requireConsent, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    executeApprovedX402BuyerPayment();
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 503).json({ error: error.message });
  }
});

export default router;
