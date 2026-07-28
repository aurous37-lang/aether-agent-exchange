import prisma from '../lib/prisma';
import { wsService } from './websocket';
import { assertJobCanComplete, SettlementError } from './settlement';
import { reconcileDueWorkspaces } from './workspaces';

const DIRECT_WALLET_ESCROW_RAILS = new Set(['standard', 'erc8183']);

/**
 * Expire OPEN jobs whose deadline has passed.
 * Updates status to CANCELLED and broadcasts the change.
 */
async function expireOpenJobs(): Promise<void> {
  try {
    const now = new Date();

    const expiredJobs = await prisma.job.findMany({
      where: {
        status: { in: ['OPEN', 'FUNDED'] },
        deadline: { not: null, lt: now },
      },
    });

    for (const job of expiredJobs) {
      const directWalletEscrow = DIRECT_WALLET_ESCROW_RAILS.has(job.settlementRail || '') && Number(job.budgetAmount) > 0;
      if (directWalletEscrow) {
        if (job.expiredAt && job.settlementStatus === 'ACCEPTANCE_EXPIRED') continue;

        await prisma.job.update({
          where: { id: job.id },
          data: {
            expiredAt: job.expiredAt || job.deadline,
            settlementStatus: 'ACCEPTANCE_EXPIRED',
          },
        });

        wsService.broadcast(`job:${job.id}`, 'job:refund-available', {
          id: job.id,
          reason: 'acceptance_deadline_expired',
          refundAvailable: true,
        });

        await prisma.notification.create({
          data: {
            userId: job.clientId,
            type: 'JOB_EXPIRED',
            title: 'Escrow Acceptance Deadline Expired',
            message: `Your job "${job.title}" reached its direct wallet escrow acceptance deadline. Backend state will remain open until an indexed on-chain cancel or refund event finalizes the refund state.`,
            data: JSON.stringify({ jobId: job.id }),
          },
        });
        wsService.sendToUser(job.clientId, 'notification', {
          type: 'JOB_EXPIRED',
          jobId: job.id,
        });

        console.log(`[Scheduler] Direct-wallet job ${job.id} reached acceptance expiry; waiting for indexed refund/cancel event`);
        continue;
      }

      if (job.status !== 'OPEN') continue;

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'CANCELLED',
          expiredAt: job.expiredAt || job.deadline,
        },
      });

      wsService.broadcast(`job:${job.id}`, 'job:cancelled', {
        id: job.id,
        reason: 'deadline_expired',
        refundAvailable: directWalletEscrow,
      });

      // Notify the client
      await prisma.notification.create({
        data: {
          userId: job.clientId,
          type: 'JOB_EXPIRED',
          title: 'Job Expired',
          message: `Your job "${job.title}" was automatically cancelled because the deadline passed with no accepted bid.`,
          data: JSON.stringify({ jobId: job.id }),
        },
      });
      wsService.sendToUser(job.clientId, 'notification', {
        type: 'JOB_EXPIRED',
        jobId: job.id,
      });

      console.log(`[Scheduler] Expired OPEN job ${job.id} ("${job.title}") — deadline passed`);
    }

    if (expiredJobs.length > 0) {
      console.log(`[Scheduler] Expired ${expiredJobs.length} open job(s)`);
    }
  } catch (err) {
    console.error('[Scheduler] Error expiring open jobs:', err);
  }
}

/**
 * Auto-release PENDING_REVIEW jobs whose review period has elapsed.
 * reviewPeriod is stored in seconds. The review window starts at acceptedAt
 * (or the job's updatedAt as fallback). When the window expires, status
 * moves to COMPLETED. In production this would also trigger on-chain
 * auto-release via the escrow contract.
 */
async function autoReleaseReviewJobs(): Promise<void> {
  try {
    const now = new Date();

    const pendingJobs = await prisma.job.findMany({
      where: {
        status: 'PENDING_REVIEW',
      },
      include: {
        agent: true,
        submissions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    for (const job of pendingJobs) {
      // The review window starts when work is actually submitted, not when the bid was accepted.
      const reviewStart = job.submissions[0]?.createdAt ?? job.updatedAt;
      const reviewDeadline = new Date(reviewStart.getTime() + job.reviewPeriod * 1000);

      if (now < reviewDeadline) continue;

      const directWalletEscrow = DIRECT_WALLET_ESCROW_RAILS.has(job.settlementRail || '') && Number(job.budgetAmount) > 0;
      if (directWalletEscrow) {
        if (job.expiredAt && job.settlementStatus === 'AUTO_RELEASE_AVAILABLE') continue;

        await prisma.job.update({
          where: { id: job.id },
          data: {
            settlementStatus: 'AUTO_RELEASE_AVAILABLE',
            expiredAt: reviewDeadline,
          },
        });

        wsService.broadcast(`job:${job.id}`, 'job:auto-release-available', {
          id: job.id,
          reason: 'review_period_expired',
        });

        await prisma.notification.create({
          data: {
            userId: job.clientId,
            type: 'JOB_AUTO_RELEASE_AVAILABLE',
            title: 'Escrow Auto-Release Available',
            message: `Job "${job.title}" reached its review deadline. Use the on-chain escrow auto-release path; backend completion waits for indexed release evidence.`,
            data: JSON.stringify({ jobId: job.id }),
          },
        });
        wsService.sendToUser(job.clientId, 'notification', {
          type: 'JOB_AUTO_RELEASE_AVAILABLE',
          jobId: job.id,
        });

        if (job.agent) {
          await prisma.notification.create({
            data: {
              userId: job.agent.handlerId,
              type: 'JOB_AUTO_RELEASE_AVAILABLE',
              title: 'Escrow Auto-Release Available',
              message: `Job "${job.title}" reached its review deadline. Completion waits for indexed on-chain release evidence.`,
              data: JSON.stringify({ jobId: job.id }),
            },
          });
          wsService.sendToUser(job.agent.handlerId, 'notification', {
            type: 'JOB_AUTO_RELEASE_AVAILABLE',
            jobId: job.id,
          });
        }

        console.log(`[Scheduler] Direct-wallet job ${job.id} reached review expiry; waiting for indexed auto-release event`);
        continue;
      }

      let settlementReceipt;
      try {
        settlementReceipt = await assertJobCanComplete(job);
      } catch (error: any) {
        if (error instanceof SettlementError) {
          await prisma.job.update({
            where: { id: job.id },
            data: { settlementStatus: 'RECEIPT_REQUIRED', expiredAt: reviewDeadline },
          });
          console.warn(`[Scheduler] Pending-review job ${job.id} reached auto-release deadline but settlement receipt is not valid: ${error.message}`);
          continue;
        }
        throw error;
      }

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          settlementStatus: 'SETTLED',
          evaluatorWallet: settlementReceipt?.walletAddress || settlementReceipt?.wallet || null,
          completedByEvaluatorAt: new Date(),
          expiredAt: reviewDeadline,
        },
      });

      wsService.broadcast(`job:${job.id}`, 'job:auto-released', {
        id: job.id,
        reason: 'review_period_expired',
      });

      // Notify the client
      await prisma.notification.create({
        data: {
          userId: job.clientId,
          type: 'JOB_AUTO_RELEASED',
          title: 'Job Auto-Released',
          message: `Job "${job.title}" was automatically completed because the review period expired without action.`,
          data: JSON.stringify({ jobId: job.id }),
        },
      });
      wsService.sendToUser(job.clientId, 'notification', {
        type: 'JOB_AUTO_RELEASED',
        jobId: job.id,
      });

      // Notify the handler if an agent is assigned
      if (job.agent) {
        await prisma.notification.create({
          data: {
            userId: job.agent.handlerId,
            type: 'JOB_AUTO_RELEASED',
            title: 'Job Auto-Released',
            message: `Job "${job.title}" was automatically completed — payment released. (In production, on-chain escrow would disburse funds.)`,
            data: JSON.stringify({ jobId: job.id }),
          },
        });
        wsService.sendToUser(job.agent.handlerId, 'notification', {
          type: 'JOB_AUTO_RELEASED',
          jobId: job.id,
        });
      }

      console.log(`[Scheduler] Auto-released PENDING_REVIEW job ${job.id} ("${job.title}") — review period expired`);
    }

    const released = pendingJobs.filter((j) => {
      const reviewStart = j.submissions[0]?.createdAt ?? j.updatedAt;
      return now >= new Date(reviewStart.getTime() + j.reviewPeriod * 1000);
    });

    if (released.length > 0) {
      console.log(`[Scheduler] Auto-released ${released.length} pending-review job(s)`);
    }
  } catch (err) {
    console.error('[Scheduler] Error auto-releasing review jobs:', err);
  }
}

/**
 * Start the background job scheduler.
 * Runs expireOpenJobs and autoReleaseReviewJobs on a fixed interval.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 60 seconds)
 */
export function startScheduler(intervalMs = 60_000): void {
  let running = false;
  // Run once immediately on startup, then on interval
  const run = async () => {
    if (running) {
      console.warn('[Scheduler] Previous run still active; skipping overlapping poll.');
      return;
    }
    running = true;
    try {
      await expireOpenJobs();
      await autoReleaseReviewJobs();
      await reconcileDueWorkspaces();
    } finally {
      running = false;
    }
  };

  run(); // initial sweep

  setInterval(run, intervalMs);
  console.log(`[Scheduler] Background job scheduler started — polling every ${intervalMs / 1000}s`);
}
