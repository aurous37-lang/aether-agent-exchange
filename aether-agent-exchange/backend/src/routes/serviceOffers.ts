import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { requireConsent } from '../middleware/consent';
import { validate } from '../middleware/validate';
import { createServiceOfferSchema, paginationSchema, updateServiceOfferSchema } from '../utils/validation';
import { parseJsonArrays, parseJsonArraysList, serializeArrays } from '../utils/sqlite-compat';
import { paramId } from '../utils/params';
import { auditLog } from '../services/audit';
import { wsService } from '../services/websocket';

const router = Router();

const offerInclude = {
  agent: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      walletAddress: true,
      capabilities: true,
      active: true,
      avgRating: true,
      trustScore: true,
      handlerId: true,
      handler: { select: { id: true, displayName: true } },
      _count: { select: { acceptedJobs: true, ratings: true } },
    },
  },
} satisfies Prisma.ServiceOfferInclude;

function normalizeOffer(offer: unknown) {
  return parseJsonArrays(offer as any);
}

async function requireOwnedAgent(agentId: string, handlerId: string) {
  return prisma.agent.findFirst({
    where: { id: agentId, handlerId },
    select: { id: true, name: true },
  });
}

// ─── Public Service Offer Marketplace ────────────────────────────

router.get('/', validate(paginationSchema, 'query'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = (req as any).validatedQuery;
  const { category, search } = req.query;

  const where: Prisma.ServiceOfferWhereInput = {
    status: 'ACTIVE',
    agent: { active: true },
  };
  if (category && typeof category === 'string') where.category = category;
  if (search && typeof search === 'string') {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { agent: { name: { contains: search } } },
    ];
  }

  const [offers, total] = await Promise.all([
    prisma.serviceOffer.findMany({
      where,
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.serviceOffer.count({ where }),
  ]);

  res.json({ offers: parseJsonArraysList(offers), total, page, limit, pages: Math.ceil(total / limit) });
});

router.get('/mine', requireAuth, validate(paginationSchema, 'query'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = (req as any).validatedQuery;
  const { category, status } = req.query;
  const where: Prisma.ServiceOfferWhereInput = {
    agent: { handlerId: req.auth!.userId },
  };
  if (category && typeof category === 'string') where.category = category;
  if (status && typeof status === 'string') where.status = status;

  const [offers, total] = await Promise.all([
    prisma.serviceOffer.findMany({
      where,
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.serviceOffer.count({ where }),
  ]);

  res.json({ offers: parseJsonArraysList(offers), total, page, limit, pages: Math.ceil(total / limit) });
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const offer = await prisma.serviceOffer.findUnique({
    where: { id: paramId(req) },
    include: offerInclude,
  });
  if (!offer || offer.status !== 'ACTIVE' || !offer.agent.active) {
    res.status(404).json({ error: 'Service offer not found' });
    return;
  }
  res.json(normalizeOffer(offer));
});

// ─── Handler Service Offer Management ────────────────────────────

router.post('/', requireAuth, requireConsent, validate(createServiceOfferSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await requireOwnedAgent(req.body.agentId, req.auth!.userId);
  if (!agent) {
    res.status(403).json({ error: 'Only the registered handler can create service offers for this agent' });
    return;
  }

  const offer = await prisma.serviceOffer.create({
    data: serializeArrays(req.body),
    include: offerInclude,
  });

  auditLog(req.auth!.walletAddress, 'SERVICE_OFFER_CREATED', 'SERVICE_OFFER', offer.id, {
    agentId: offer.agentId,
    category: offer.category,
    startingPrice: offer.startingPrice,
    priceToken: offer.priceToken,
  });
  wsService.broadcastAll('service-offer:created', { id: offer.id, title: offer.title, category: offer.category });
  res.status(201).json(normalizeOffer(offer));
});

router.put('/:id', requireAuth, requireConsent, validate(updateServiceOfferSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.serviceOffer.findUnique({
    where: { id: paramId(req) },
    include: { agent: { select: { handlerId: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: 'Service offer not found' });
    return;
  }
  if (existing.agent.handlerId !== req.auth!.userId) {
    res.status(403).json({ error: 'Only the registered handler can update this service offer' });
    return;
  }
  if (req.body.agentId && req.body.agentId !== existing.agentId) {
    const ownedAgent = await requireOwnedAgent(req.body.agentId, req.auth!.userId);
    if (!ownedAgent) {
      res.status(403).json({ error: 'Only the registered handler can move offers to one of their agents' });
      return;
    }
  }

  const offer = await prisma.serviceOffer.update({
    where: { id: existing.id },
    data: serializeArrays(req.body),
    include: offerInclude,
  });

  auditLog(req.auth!.walletAddress, 'SERVICE_OFFER_UPDATED', 'SERVICE_OFFER', offer.id, {
    status: offer.status,
    category: offer.category,
  });
  wsService.broadcastAll('service-offer:updated', { id: offer.id, title: offer.title, status: offer.status });
  res.json(normalizeOffer(offer));
});

router.post('/:id/request', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const offer = await prisma.serviceOffer.findUnique({
    where: { id: paramId(req) },
    include: { agent: { select: { id: true, name: true, handlerId: true, active: true } } },
  });
  if (!offer || offer.status !== 'ACTIVE' || !offer.agent.active) {
    res.status(404).json({ error: 'Active service offer not found' });
    return;
  }
  if (offer.agent.handlerId === req.auth!.userId) {
    res.status(400).json({ error: 'Handlers cannot request their own service offer' });
    return;
  }

  const job = await prisma.job.create({
    data: {
      title: offer.title,
      description: offer.description,
      category: offer.category,
      deliverables: offer.deliverables,
      budgetAmount: offer.startingPrice,
      budgetToken: offer.priceToken,
      acceptanceCriteria: offer.revisionPolicy || undefined,
      settlementRail: 'offchain',
      settlementStatus: 'PENDING',
      status: 'IN_PROGRESS',
      clientId: req.auth!.userId,
      agentId: offer.agentId,
      acceptedAt: new Date(),
    },
    include: {
      client: { select: { id: true, displayName: true, walletAddress: true } },
      agent: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  await prisma.notification.create({
    data: {
      userId: offer.agent.handlerId,
      type: 'SERVICE_OFFER_REQUESTED',
      title: 'Service offer requested',
      message: `${offer.title} was requested and opened as a private job.`,
      data: JSON.stringify({ offerId: offer.id, jobId: job.id, agentId: offer.agentId }),
    },
  });

  auditLog(req.auth!.walletAddress, 'SERVICE_OFFER_REQUESTED', 'SERVICE_OFFER', offer.id, {
    jobId: job.id,
    agentId: offer.agentId,
  });
  wsService.sendToUser(offer.agent.handlerId, 'service-offer:requested', { offerId: offer.id, jobId: job.id });
  res.status(201).json(parseJsonArrays(job));
});

export default router;
