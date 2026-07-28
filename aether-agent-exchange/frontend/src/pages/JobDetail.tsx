import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Clock, Users, Star, Bot, CheckCircle, AlertTriangle, Loader2, Send, ThumbsUp, Flag, Award, Shield, Code } from 'lucide-react';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { WorkspaceProviderSelector, WorkspaceStatusPanel } from '../components/ContractWorkspace';
import BaseMcpPanel from '../components/BaseMcpPanel';
import SettlementSummary from '../components/SettlementSummary';
import { BidFeeDisclosure, FinalityWarning, DisputeDisclosure, AutonomousAgentWarning } from '../components/DisclosureNotice';
import { useAuth } from '../hooks/useAuth';
import { bytes32ToUint256, useEscrow } from '../hooks/useEscrow';
import { useWebSocket } from '../hooks/useWebSocket';
import { getJob, acceptJob, createWorkspace, submitBid, submitDeliverable, approveJob, disputeJob, rateJob, getHandlerAgents, reportJob, recordSettlementReceipt } from '../lib/api';
import type { Job, Agent, ContractWorkspace, PaymentLedgerEntry, WorkspaceProvider, ReportReason } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { getJobWorkspace } from '../lib/workspace';
import { activeChain, chainsByKey, type ChainKey } from '../lib/chains';
import { CONTRACTS, getContractsForChain } from '../lib/contracts';

interface JobActionsProps {
  job: Job | null;
  user: { id: string; walletAddress: string; role: string; displayName: string | null } | null;
  myAgents: Agent[];
  agentError: string;
  selectedAgent: string;
  setSelectedAgent: (v: string) => void;
  bidAmount: string;
  setBidAmount: (v: string) => void;
  bidDuration: string;
  setBidDuration: (v: string) => void;
  bidMessage: string;
  setBidMessage: (v: string) => void;
  workspaceProvider: WorkspaceProvider;
  setWorkspaceProvider: (v: WorkspaceProvider) => void;
  gitlawbNodeUrl: string;
  setGitlawbNodeUrl: (v: string) => void;
  showBidForm: boolean;
  setShowBidForm: (v: boolean) => void;
  showSubmitForm: boolean;
  setShowSubmitForm: (v: boolean) => void;
  showDisputeForm: boolean;
  setShowDisputeForm: (v: boolean) => void;
  showRateForm: boolean;
  setShowRateForm: (v: boolean) => void;
  deliverableHash: string;
  setDeliverableHash: (v: string) => void;
  submitNotes: string;
  setSubmitNotes: (v: string) => void;
  disputeReason: string;
  setDisputeReason: (v: string) => void;
  rateScore: number;
  setRateScore: (v: number) => void;
  rateComment: string;
  setRateComment: (v: string) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
  actionError: string;
  setActionError: (v: string) => void;
  actionSuccess: string;
  setActionSuccess: (v: string) => void;
  reload: () => void;
}

function x402LaunchState(entry: PaymentLedgerEntry): { label: string; className: string } {
  if (entry.status === 'SETTLED') return { label: 'Settled', className: 'text-aether-green border-aether-green/30 bg-aether-green/10' };
  if (entry.status === 'QUOTED') return { label: 'Quote', className: 'text-aether-cyan border-aether-cyan/30 bg-aether-cyan/10' };
  if (entry.status === 'BLOCKED') return { label: 'Blocked', className: 'text-aether-amber border-aether-amber/30 bg-aether-amber/10' };
  if (entry.status === 'FAILED') return { label: 'Failed', className: 'text-aether-red border-aether-red/30 bg-aether-red/10' };
  if (entry.txHash || entry.redactedPaymentReference) return { label: 'Paid', className: 'text-aether-violet border-aether-violet/30 bg-aether-violet/10' };
  return { label: 'Approval required', className: 'text-aether-amber border-aether-amber/30 bg-aether-amber/10' };
}

function compactHash(value?: string): string {
  if (!value) return 'not recorded';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function hasValidErc8183JobId(onchainJobId?: string): boolean {
  if (!onchainJobId) return false;
  try {
    bytes32ToUint256(onchainJobId);
    return true;
  } catch {
    return false;
  }
}

function x402LedgerEntries(job: Job): PaymentLedgerEntry[] {
  return (job.paymentLedger || []).filter(entry => ['x402', 'px402', 'px402-dry-run'].includes(entry.rail));
}

const reportReasons: Array<{ value: ReportReason; label: string }> = [
  { value: 'PROHIBITED_CONTENT', label: 'Prohibited content' },
  { value: 'FRAUD', label: 'Fraud or misrepresentation' },
  { value: 'IP_VIOLATION', label: 'IP violation' },
  { value: 'PRIVACY_VIOLATION', label: 'Privacy violation' },
  { value: 'OTHER', label: 'Other policy issue' },
];

type DirectWalletRail = 'standard' | 'erc8183';
type DirectWalletNetwork = 'base' | 'base-sepolia' | 'ethereum' | 'ethereum-sepolia' | 'monad' | 'monad-testnet' | 'robinhood' | 'robinhood-testnet';
type BudgetToken = 'USDC' | 'MON' | 'ETH';

function assertDirectWalletRail(value: string): DirectWalletRail {
  if (value === 'standard' || value === 'erc8183') return value;
  throw new Error('Job settlement rail is not a direct-wallet paid rail.');
}

function assertDirectWalletNetwork(value: string): DirectWalletNetwork {
  if (['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia', 'monad', 'monad-testnet', 'robinhood', 'robinhood-testnet'].includes(value)) {
    return value as DirectWalletNetwork;
  }
  throw new Error('Job network is not supported for direct-wallet settlement receipt recording.');
}

function assertBudgetToken(value: string): BudgetToken {
  if (value === 'USDC' || value === 'MON' || value === 'ETH') return value;
  throw new Error('Job budget token is not supported for direct-wallet settlement receipt recording.');
}

function assertAddress(value: string | undefined, label: string): string {
  if (value && /^0x[a-fA-F0-9]{40}$/.test(value)) return value;
  throw new Error(`${label} is not recorded for this job.`);
}

function assertTxHash(value: string | undefined, label: string): string {
  if (value && /^0x[a-fA-F0-9]{64}$/.test(value)) return value;
  throw new Error(`${label} is not indexed yet.`);
}

function ReportJobPanel({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('FRAUD');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await reportJob(jobId, reason, description.trim());
      setSuccess('Report submitted for review.');
      setDescription('');
      setOpen(false);
    } catch (error: unknown) {
      setError(errorMessage(error, 'Report failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-lg font-semibold text-aether-text-bright">Report Job</span>
          <span className="mt-1 block text-xs text-aether-text-dim">Flag fraud, privacy, IP, or prohibited-content concerns for moderation.</span>
        </span>
        <Flag className="h-5 w-5 shrink-0 text-aether-amber" />
      </button>

      {success && <p className="mt-3 rounded-lg border border-aether-green/20 bg-aether-green/10 p-3 text-sm text-aether-green">{success}</p>}
      {error && <p className="mt-3 rounded-lg border border-aether-red/20 bg-aether-red/10 p-3 text-sm text-aether-red">{error}</p>}

      {open && (
        <div className="mt-4 space-y-3">
          <select
            value={reason}
            onChange={event => setReason(event.target.value as ReportReason)}
            className="w-full rounded-lg border border-aether-border bg-aether-bg px-3 py-2 text-sm text-aether-text focus:border-aether-cyan focus:outline-none"
          >
            {reportReasons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            rows={3}
            placeholder="Describe the policy concern. Do not include secrets, private keys, payment headers, or raw credentials."
            className="w-full resize-none rounded-lg border border-aether-border bg-aether-bg px-3 py-2 text-sm text-aether-text placeholder:text-aether-text-dim focus:border-aether-cyan focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || description.trim().length < 10}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-aether-amber px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
            Submit Report
          </button>
        </div>
      )}
    </Card>
  );
}

function EscrowLifecyclePanel({ job }: { job: Job }) {
  const lifecycle = job.escrowLifecycle;
  const state = lifecycle?.state;
  const events = lifecycle?.events || [];

  return (
    <Card>
      <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Escrow Lifecycle</h2>
      {!lifecycle?.indexerSchemaReady ? (
        <p className="text-sm text-aether-text-dim">Backend indexer schema is not active for this deployment yet.</p>
      ) : (
        <div className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-aether-text-dim">Indexed State</dt>
              <dd className="text-aether-text text-right">{state?.state || 'No indexed state yet'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-aether-text-dim">Canonical State</dt>
              <dd className="text-aether-text text-right">{lifecycle.canonicalState}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-aether-text-dim">Next Action</dt>
              <dd className="text-aether-text text-right">{lifecycle.nextAction} / {lifecycle.nextRequiredActor}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-aether-text-dim">Finality</dt>
              <dd className="text-aether-text text-right">{lifecycle.finalityStatus || state?.finalityStatus || 'pending'}{state ? ` (${lifecycle.currentConfirmations} confirmations)` : ''}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-aether-text-dim">Latest Tx</dt>
              <dd className="text-aether-text text-right font-mono">{compactHash(state?.latestTxHash)}</dd>
            </div>
          </dl>
          {lifecycle.missingEvidence.length > 0 && (
            <div className="rounded-lg border border-aether-amber/20 bg-aether-amber/10 p-3 text-xs text-aether-amber">
              {lifecycle.missingEvidence.join('; ')}
            </div>
          )}
          <div className="space-y-2">
            {events.length === 0 ? (
              <p className="text-sm text-aether-text-dim">No chain events have been indexed for this job yet.</p>
            ) : events.slice(0, 8).map(event => (
              <div key={event.id} className="rounded-lg border border-aether-border bg-aether-surface-2 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-aether-text-bright">{event.lifecycleType || event.eventName}</span>
                  <span className="text-aether-text-dim">{event.finalityStatus}</span>
                </div>
                <div className="mt-1 text-aether-text-dim">
                  {event.chainKey} block {event.blockNumber} log {event.logIndex}
                </div>
                <div className="mt-1 break-all font-mono text-aether-cyan">{compactHash(event.txHash)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function JobActions({
  job, user, myAgents, agentError, selectedAgent, setSelectedAgent,
  bidAmount, setBidAmount, bidDuration, setBidDuration, bidMessage, setBidMessage,
  workspaceProvider, setWorkspaceProvider, gitlawbNodeUrl, setGitlawbNodeUrl,
  showBidForm, setShowBidForm, showSubmitForm, setShowSubmitForm,
  showDisputeForm, setShowDisputeForm, showRateForm, setShowRateForm,
  deliverableHash, setDeliverableHash, submitNotes, setSubmitNotes,
  disputeReason, setDisputeReason, rateScore, setRateScore, rateComment, setRateComment,
  actionLoading, setActionLoading, actionError, setActionError, actionSuccess, setActionSuccess,
  reload,
}: JobActionsProps) {
  const isClient = user?.id === job?.clientId;
  const isHandler = myAgents.length > 0;
  const isAssignedHandler = isHandler && job?.agentId && myAgents.some(a => a.id === job.agentId);
  const status = job?.status || '';
  const approveLabel = job?.settlementRail === 'offchain' ? 'Approve & Record Offchain Settlement' : 'Approve Deliverable';
  const jobChainKey = job?.network && job.network in chainsByKey ? job.network as ChainKey : undefined;
  const jobChain = jobChainKey ? chainsByKey[jobChainKey] : activeChain;
  const jobContracts = jobChainKey ? getContractsForChain(jobChainKey) : CONTRACTS;
  const escrow = useEscrow(jobChain, jobContracts);
  const isEscrowRail = job?.settlementRail === 'standard' || job?.settlementRail === 'erc8183';
  const escrowVersion = (job?.escrowContractVersion === 'native-eth' || job?.escrowContractVersion === 'erc8183')
    ? job.escrowContractVersion
    : 'legacy';
  const isErc8183Escrow = escrowVersion === 'erc8183';
  const directEscrowRail = isEscrowRail && Number(job?.budgetAmount || 0) > 0;
  const lifecycle = job?.escrowLifecycle;
  const erc8183FactoryConfigured = !!jobContracts.erc8183Factory;
  const erc8183JobIdReady = hasValidErc8183JobId(job?.onchainJobId);
  const erc8183WalletReady = isErc8183Escrow && erc8183FactoryConfigured && erc8183JobIdReady;
  const erc8183UnavailableReason = !erc8183FactoryConfigured
    ? 'ERC-8183 factory address is not configured for this network.'
    : !erc8183JobIdReady
      ? 'ERC-8183 on-chain job id is not recorded yet.'
      : '';
  const acceptBidBackendEnabled = !directEscrowRail || lifecycle?.actionAvailability?.acceptBidBackend?.enabled === true;
  const startWorkOnchainEnabled = !directEscrowRail || lifecycle?.actionAvailability?.startWorkOnchain?.enabled === true;
  const submitDeliverableOnchainEnabled = !directEscrowRail || lifecycle?.actionAvailability?.submitDeliverableOnchain?.enabled === true;
  const approveReleaseOnchainEnabled = !directEscrowRail || lifecycle?.actionAvailability?.approveReleaseOnchain?.enabled === true;
  const openDisputeOnchainEnabled = !directEscrowRail || lifecycle?.actionAvailability?.openDisputeOnchain?.enabled === true;
  const canRecordIndexedDeliverable = directEscrowRail && lifecycle?.canonicalState === 'DELIVERED_ONCHAIN';
  const canRecordIndexedRelease = directEscrowRail && ['RELEASED_ONCHAIN', 'RESOLVED_ONCHAIN'].includes(lifecycle?.canonicalState || '');
  const canRecordIndexedDispute = directEscrowRail && lifecycle?.canonicalState === 'DISPUTED_ONCHAIN';
  const erc8183SubmitOnchainEnabled = directEscrowRail && isErc8183Escrow && lifecycle?.canonicalState === 'FUNDED_OPEN' && erc8183WalletReady;
  const erc8183CompleteOnchainEnabled = directEscrowRail && isErc8183Escrow && lifecycle?.canonicalState === 'DELIVERED_ONCHAIN' && erc8183WalletReady;
  const erc8183RejectOnchainEnabled = directEscrowRail && isErc8183Escrow && isClient && ['FUNDED_OPEN', 'DELIVERED_ONCHAIN'].includes(lifecycle?.canonicalState || '') && erc8183WalletReady;
  const canSubmitOnchainDeliverable = directEscrowRail && !canRecordIndexedDeliverable && (isErc8183Escrow ? erc8183SubmitOnchainEnabled : submitDeliverableOnchainEnabled);
  const canApproveReleaseOnchain = !directEscrowRail || (isErc8183Escrow ? erc8183CompleteOnchainEnabled : approveReleaseOnchainEnabled);
  const canOpenDisputeOnchain = !directEscrowRail || (isErc8183Escrow ? erc8183RejectOnchainEnabled : openDisputeOnchainEnabled);
  const canShowAcceptBid = Boolean(
    isClient &&
    !job?.agentId &&
    job?.bids &&
    job.bids.length > 0 &&
    (status === 'OPEN' || (directEscrowRail && status === 'FUNDED'))
  );
  const canShowApproveAction = Boolean(
    isClient &&
    (
      status === 'PENDING_REVIEW' ||
      (
        directEscrowRail &&
        ['FUNDED', 'IN_PROGRESS', 'PENDING_REVIEW'].includes(status) &&
        (canApproveReleaseOnchain || canRecordIndexedRelease)
      )
    )
  );
  const acceptBidList = canShowAcceptBid ? job?.bids || [] : [];
  const showDisputeAction = isErc8183Escrow
    ? isClient && directEscrowRail && ['FUNDED', 'PENDING_REVIEW'].includes(status) && ['FUNDED_OPEN', 'DELIVERED_ONCHAIN'].includes(lifecycle?.canonicalState || '')
    : (isClient || isAssignedHandler) && (['IN_PROGRESS', 'PENDING_REVIEW'].includes(status) || (directEscrowRail && canRecordIndexedDispute && status === 'DISPUTED'));

  async function handleAction(fn: () => Promise<void>, successMsg: string) {
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      await fn();
      setActionSuccess(successMsg);
      reload();
      setShowBidForm(false);
      setShowSubmitForm(false);
      setShowDisputeForm(false);
      setShowRateForm(false);
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Action failed'));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Actions</h2>

      {agentError && (
        <div className="mb-4 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
          {agentError}
        </div>
      )}
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-4 p-3 rounded-lg bg-aether-green/10 border border-aether-green/20 text-sm text-aether-green">
          {actionSuccess}
        </div>
      )}
      {escrow.error && (
        <div className="mb-4 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
          {escrow.error.message}
        </div>
      )}

      <div className="space-y-3">
        {/* Handler: Place a bid (OPEN jobs) */}
        {isHandler && status === 'OPEN' && (
          <>
            <button
              onClick={() => setShowBidForm(!showBidForm)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-aether-cyan to-aether-violet text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Send className="w-4 h-4" />
              Place a Bid
            </button>

            {showBidForm && (
              <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border space-y-3">
                {myAgents.length >= 1 && (
                  <select
                    value={selectedAgent}
                    onChange={e => setSelectedAgent(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm appearance-none focus:outline-none focus:border-aether-cyan"
                  >
                    <option value="">Select agent...</option>
                    {myAgents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                )}
                <input
                  type="number"
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  placeholder={`Bid amount (${job?.budgetToken})`}
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan"
                />
                <select
                  value={bidDuration}
                  onChange={e => setBidDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm appearance-none focus:outline-none focus:border-aether-cyan"
                >
                  <option>1-2 hours</option>
                  <option>2-4 hours</option>
                  <option>1-2 days</option>
                  <option>3-5 days</option>
                  <option>1-2 weeks</option>
                </select>
                <textarea
                  value={bidMessage}
                  onChange={e => setBidMessage(e.target.value)}
                  placeholder="Why is your agent the best fit?"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan resize-none"
                />
                <BidFeeDisclosure />
                <button
                  onClick={() => handleAction(async () => {
                    const agentId = selectedAgent || myAgents[0]?.id;
                    if (!agentId) throw new Error('No agent selected');
                    await submitBid(job!.id, {
                      agentId,
                      amount: parseFloat(bidAmount),
                      estimatedDuration: bidDuration,
                      message: bidMessage || undefined,
                    });
                  }, 'Bid placed successfully!')}
                  disabled={actionLoading || !bidAmount}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-aether-cyan text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Bid
                </button>
              </div>
            )}
          </>
        )}

        {/* Client: Accept a bid (open jobs, or funded direct-wallet jobs) */}
        {canShowAcceptBid && (
          <div className="space-y-2">
            <p className="text-sm text-aether-text-dim">
              {directEscrowRail
                ? 'Accept a bid to assign the funded escrow job. The agent starts escrow work on-chain next.'
                : 'Accept a bid to start the job:'}
            </p>
            <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
              <WorkspaceProviderSelector
                selected={workspaceProvider}
                onSelect={setWorkspaceProvider}
                gitlawbNodeUrl={gitlawbNodeUrl}
                onGitlawbNodeUrlChange={setGitlawbNodeUrl}
              />
            </div>
            {acceptBidList.some(b => b.agent?.autonomousAccept) && (
              <AutonomousAgentWarning />
            )}
            {directEscrowRail && !acceptBidBackendEnabled && (
              <p className="rounded-lg border border-aether-amber/20 bg-aether-amber/10 p-3 text-xs text-aether-amber">
                Fund escrow and wait for indexed finality before accepting a bid.
              </p>
            )}
            {acceptBidList.map(bid => (
              <button
                key={bid.id}
                onClick={() => handleAction(async () => {
                  if (!bid.agent?.id && !bid.agentId) throw new Error('No agent on bid');
                  await acceptJob(job!.id, bid.agentId || bid.agent!.id, {
                    workspaceProvider,
                    ...(workspaceProvider === 'gitlawb' && gitlawbNodeUrl.trim()
                      ? { workspaceNodeUrl: gitlawbNodeUrl.trim() }
                      : {}),
                  });
                }, `Accepted ${bid.agent?.name || 'agent'}!`)}
                disabled={actionLoading || !acceptBidBackendEnabled}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-aether-border hover:border-aether-green bg-aether-surface-2 transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-aether-green" />
                  <span className="text-sm text-aether-text">{bid.agent?.name || 'Agent'}</span>
                </div>
                <span className="text-sm font-mono text-aether-cyan">${bid.amount}</span>
              </button>
            ))}
          </div>
        )}

        {/* Assigned handler: start funded escrow work */}
        {isAssignedHandler && status === 'FUNDED' && isEscrowRail && !isErc8183Escrow && job?.escrowAddress && (
          <button
            onClick={() => handleAction(async () => {
              if (!startWorkOnchainEnabled) throw new Error('Escrow work start is waiting on indexed funded escrow evidence.');
              const contractAgentId = job.agent?.agentId || myAgents.find(a => a.id === job.agentId)?.agentId;
              if (!contractAgentId) throw new Error('Agent contract id is not available for escrow start.');
              const txHash = await escrow.startEscrowWork(
                job.escrowAddress as `0x${string}`,
                contractAgentId,
                escrowVersion,
              );
              if (!txHash) throw new Error('Escrow start transaction did not complete.');
            }, 'Escrow work transaction submitted; wait for indexed finality before submitting deliverables.')}
            disabled={actionLoading || escrow.isLoading || !startWorkOnchainEnabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-aether-cyan text-aether-cyan font-medium hover:bg-aether-cyan/10 transition-all disabled:opacity-50"
          >
            {escrow.currentStep === 'Starting escrow work...' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {escrow.currentStep === 'Starting escrow work...' ? escrow.currentStep : 'Start Escrow Work'}
          </button>
        )}

        {isAssignedHandler && status === 'FUNDED' && directEscrowRail && isErc8183Escrow && !erc8183SubmitOnchainEnabled && (
          <p className="rounded-lg border border-aether-amber/20 bg-aether-amber/10 p-3 text-xs text-aether-amber">
            {erc8183UnavailableReason || 'ERC-8183 deliverable submission becomes available after backend bid acceptance and finalized funded job evidence.'}
          </p>
        )}

        {/* Assigned handler: submit deliverable */}
        {isAssignedHandler && (status === 'IN_PROGRESS' || canSubmitOnchainDeliverable || (canRecordIndexedDeliverable && status === 'PENDING_REVIEW')) && (
          <>
            <button
              onClick={() => setShowSubmitForm(!showSubmitForm)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-aether-green to-aether-cyan text-white font-medium hover:opacity-90 transition-opacity"
            >
              <CheckCircle className="w-4 h-4" />
              Submit Deliverable
            </button>

            {showSubmitForm && (
              <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border space-y-3">
                <input
                  type="text"
                  value={deliverableHash}
                  onChange={e => setDeliverableHash(e.target.value)}
                  placeholder="Deliverable hash (IPFS CID, commit SHA, etc.)"
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text font-mono text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan"
                />
                <textarea
                  value={submitNotes}
                  onChange={e => setSubmitNotes(e.target.value)}
                  placeholder="Notes about the deliverable..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan resize-none"
                />
                <button
                  onClick={() => handleAction(async () => {
                    if (!deliverableHash.trim()) throw new Error('Deliverable hash required');
                    if (directEscrowRail && !canRecordIndexedDeliverable) {
                      if (isErc8183Escrow) {
                        if (!canSubmitOnchainDeliverable) {
                          throw new Error(erc8183UnavailableReason || 'ERC-8183 deliverable submission requires backend bid acceptance and finalized funded job evidence.');
                        }
                        const txHash = await escrow.submitEscrowDeliverable(
                          (job?.escrowAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`,
                          deliverableHash.trim(),
                          escrowVersion,
                          job?.onchainJobId,
                        );
                        if (!txHash) throw new Error('ERC-8183 deliverable transaction did not complete.');
                        return;
                      }
                      if (!job?.escrowAddress) throw new Error('Escrow address is not recorded for this job.');
                      if (!submitDeliverableOnchainEnabled) {
                        throw new Error('Deliverable submission is waiting on finalized on-chain work-start evidence.');
                      }
                      const txHash = await escrow.submitEscrowDeliverable(
                        job.escrowAddress as `0x${string}`,
                        deliverableHash.trim(),
                        escrowVersion,
                        job.onchainJobId,
                      );
                      if (!txHash) throw new Error('Escrow deliverable transaction did not complete.');
                      return;
                    }
                    await submitDeliverable(job!.id, {
                      deliverableHash: deliverableHash.trim(),
                      notes: submitNotes || undefined,
                    });
                  }, directEscrowRail && !canRecordIndexedDeliverable
                    ? 'Deliverable transaction submitted; wait for indexed finality before recording submission.'
                    : 'Deliverable submitted!')}
                  disabled={actionLoading || !deliverableHash.trim() || (directEscrowRail && !canRecordIndexedDeliverable && !canSubmitOnchainDeliverable)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-aether-green text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {directEscrowRail && !canRecordIndexedDeliverable ? 'Submit On-Chain Deliverable' : 'Record Deliverable'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Client: approve or release deliverable */}
        {canShowApproveAction && (
          <>
            <FinalityWarning />
            <button
              onClick={() => handleAction(async () => {
                if (directEscrowRail && !canRecordIndexedRelease) {
                  if (isErc8183Escrow) {
                    if (!canApproveReleaseOnchain) {
                      throw new Error(erc8183UnavailableReason || 'ERC-8183 completion requires finalized deliverable evidence.');
                    }
                    const txHash = await escrow.approveAndRelease(
                      (job?.escrowAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`,
                      escrowVersion,
                      job?.onchainJobId,
                    );
                    if (!txHash) throw new Error('ERC-8183 completion transaction did not complete.');
                    return;
                  }
                  if (!job?.escrowAddress) throw new Error('Escrow address is not recorded for this job.');
                  if (!approveReleaseOnchainEnabled) throw new Error('Release is waiting on finalized indexed deliverable evidence.');
                  const txHash = await escrow.approveAndRelease(job.escrowAddress as `0x${string}`, escrowVersion, job.onchainJobId);
                  if (!txHash) throw new Error('Escrow release transaction did not complete.');
                  return;
                }
                if (directEscrowRail && canRecordIndexedRelease) {
                  if (!job) throw new Error('Job is not loaded.');
                  const releaseTxHash = assertTxHash(job.escrowLifecycle?.state?.latestTxHash, 'Finalized release transaction hash');
                  const escrowAddress = assertAddress(job.escrowAddress, 'Escrow address');
                  const receipt = await recordSettlementReceipt(job.id, {
                    receipt: `evm-release:${releaseTxHash}`,
                    rail: assertDirectWalletRail(job.settlementRail),
                    amount: job.budgetAmount,
                    tokenSymbol: assertBudgetToken(job.budgetToken),
                    ...(job.tokenAddress ? { tokenAddress: job.tokenAddress } : {}),
                    ...(job.onchainJobId ? { onchainJobId: job.onchainJobId } : {}),
                    escrowAddress,
                    txHash: releaseTxHash,
                    chainId: job.chainId,
                    network: assertDirectWalletNetwork(job.network),
                    status: 'SETTLED',
                    redactedReference: releaseTxHash,
                    escrowContractVersion: escrowVersion,
                    condition: 'release',
                  });
                  await approveJob(job.id, {
                    txHash: releaseTxHash,
                    receiptHash: receipt.receiptHash,
                    ledgerId: receipt.id,
                  });
                  return;
                }
                await approveJob(job!.id);
              }, directEscrowRail && !canRecordIndexedRelease
                ? 'Release transaction submitted; wait for indexed finality before completion.'
                : 'Job approved; settlement state updated.')}
              disabled={actionLoading || escrow.isLoading || (directEscrowRail && !canRecordIndexedRelease && !canApproveReleaseOnchain)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-aether-green to-aether-cyan text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {(actionLoading || escrow.isLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              {escrow.currentStep || (directEscrowRail && !canRecordIndexedRelease ? (isErc8183Escrow ? 'Complete ERC-8183 Job' : 'Release Escrow On-Chain') : approveLabel)}
            </button>
          </>
        )}

        {/* Direct/offchain dispute */}
        {showDisputeAction && (
          <>
            <button
              onClick={() => setShowDisputeForm(!showDisputeForm)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-aether-red text-aether-red font-medium hover:bg-aether-red/10 transition-all"
            >
              <Flag className="w-4 h-4" />
              {isErc8183Escrow ? 'Reject ERC-8183 Job' : 'Dispute'}
            </button>

            {showDisputeForm && (
              <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border space-y-3">
                <textarea
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  placeholder={isErc8183Escrow ? 'Reason for rejection...' : 'Describe the issue with the deliverable...'}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-red resize-none"
                />
                {!isErc8183Escrow && <DisputeDisclosure />}
                <button
                  onClick={() => handleAction(async () => {
                    if (!disputeReason.trim()) throw new Error('Reason required');
                    if (directEscrowRail && !canRecordIndexedDispute) {
                      if (isErc8183Escrow) {
                        if (!canOpenDisputeOnchain) throw new Error(erc8183UnavailableReason || 'ERC-8183 rejection requires finalized funded or submitted job evidence.');
                        const txHash = await escrow.openEscrowDispute(
                          (job?.escrowAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`,
                          disputeReason.trim(),
                          escrowVersion,
                          job?.onchainJobId,
                        );
                        if (!txHash) throw new Error('ERC-8183 reject transaction did not complete.');
                        return;
                      }
                      if (!job?.escrowAddress) throw new Error('Escrow address is not recorded for this job.');
                      if (!canOpenDisputeOnchain) throw new Error('Dispute is waiting on finalized indexed in-progress or pending-review escrow evidence.');
                      const txHash = await escrow.openEscrowDispute(
                        job.escrowAddress as `0x${string}`,
                        disputeReason.trim(),
                        escrowVersion,
                      );
                      if (!txHash) throw new Error('Escrow dispute transaction did not complete.');
                      return;
                    }
                    await disputeJob(job!.id, disputeReason.trim());
                  }, directEscrowRail && !canRecordIndexedDispute
                    ? (isErc8183Escrow
                      ? 'Reject transaction submitted; wait for indexed finality.'
                      : 'Dispute transaction submitted; wait for indexed finality before recording dispute.')
                    : 'Dispute filed.')}
                  disabled={actionLoading || !disputeReason.trim() || (directEscrowRail && !canRecordIndexedDispute && !canOpenDisputeOnchain)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-aether-red text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                  {directEscrowRail && !canRecordIndexedDispute
                    ? (isErc8183Escrow ? 'Reject On-Chain' : 'Open On-Chain Dispute')
                    : 'Record Dispute'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Client: Rate (COMPLETED) */}
        {isClient && status === 'COMPLETED' && !(job?.ratings && job.ratings.length > 0) && (
          <>
            <button
              onClick={() => setShowRateForm(!showRateForm)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-aether-amber to-aether-magenta text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Award className="w-4 h-4" />
              Rate Agent
            </button>

            {showRateForm && (
              <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border space-y-3">
                <div>
                  <label className="text-xs text-aether-text-dim mb-1 block">Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRateScore(s)}
                        className="p-1"
                      >
                        <Star className={`w-6 h-6 ${s <= rateScore ? 'text-aether-amber fill-current' : 'text-aether-text-dim'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={rateComment}
                  onChange={e => setRateComment(e.target.value)}
                  placeholder="Leave a comment (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-amber resize-none"
                />
                <button
                  onClick={() => handleAction(async () => {
                    await rateJob(job!.id, rateScore, rateComment || undefined);
                  }, 'Rating submitted!')}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-aether-amber text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  Submit Rating
                </button>
              </div>
            )}
          </>
        )}

        {/* No actions available */}
        {!isClient && !isHandler && (
          <p className="text-sm text-aether-text-dim text-center py-2">
            Connect a wallet with registered agents to interact with this job.
          </p>
        )}

        {(isClient || isHandler) && !['OPEN', 'FUNDED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'DISPUTED'].includes(status) && (
          <p className="text-sm text-aether-text-dim text-center py-2">
            No actions available for this job status.
          </p>
        )}
      </div>
    </Card>
  );
}

function workspaceLink(workspace: ContractWorkspace | null): string {
  return workspace?.repoUrl || workspace?.repositoryUrl || workspace?.cloneUrl || workspace?.gitlawbCloneUrl || '';
}

function githubCollaboratorsToParticipants(value: string) {
  return value
    .split(/[\s,]+/)
    .map(login => login.trim().replace(/^@/, ''))
    .filter(Boolean)
    .slice(0, 20)
    .map(login => ({ login, permission: 'push' as const, role: 'collaborator' }));
}

function WorkspaceCreationPanel({
  provider,
  setProvider,
  githubCollaborators,
  setGithubCollaborators,
  gitlawbNodeUrl,
  setGitlawbNodeUrl,
  retryingFailedWorkspace,
  loading,
  error,
  success,
  createdWorkspace,
  onCreate,
}: {
  provider: WorkspaceProvider;
  setProvider: (provider: WorkspaceProvider) => void;
  githubCollaborators: string;
  setGithubCollaborators: (value: string) => void;
  gitlawbNodeUrl: string;
  setGitlawbNodeUrl: (url: string) => void;
  retryingFailedWorkspace?: boolean;
  loading: boolean;
  error: string;
  success: string;
  createdWorkspace: ContractWorkspace | null;
  onCreate: () => void;
}) {
  const createdLink = workspaceLink(createdWorkspace);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-aether-text-bright mb-2">{retryingFailedWorkspace ? 'Retry Workspace' : 'Create Workspace'}</h2>
      <p className="text-xs text-aether-text-dim mb-4">
        Choose one workspace platform for collaboration evidence. AAE job state and escrow settlement stay separate.
      </p>

      <div className="space-y-3">
        {(['github', 'gitlawb'] as WorkspaceProvider[]).map(option => {
          const active = provider === option;
          const Icon = option === 'github' ? Code : Shield;
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                active ? 'border-aether-cyan bg-aether-cyan/10' : 'border-aether-border bg-aether-surface-2 hover:border-aether-cyan/60'
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => setProvider(option)}
                className="mt-1 h-4 w-4 rounded border-aether-border bg-aether-bg text-aether-cyan focus:ring-aether-cyan"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-aether-text-bright">
                  <Icon className={`h-4 w-4 ${option === 'github' ? 'text-aether-cyan' : 'text-aether-violet'}`} />
                  {option === 'github' ? 'GitHub' : 'GitLawb'}
                </span>
                <span className="mt-1 block text-xs text-aether-text-dim">
                  {option === 'github'
                    ? 'Create a GitHub workspace repo reference for review and evidence.'
                    : 'Create a GitLawb workspace reference with public-node metadata.'}
                </span>
              </span>
            </label>
          );
        })}

        {provider === 'github' && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-aether-text-dim">GitHub collaborators</label>
            <input
              type="text"
              value={githubCollaborators}
              onChange={e => setGithubCollaborators(e.target.value)}
              placeholder="username or comma-separated usernames"
              className="w-full rounded-lg border border-aether-border bg-aether-bg px-3 py-2 text-sm text-aether-text placeholder:text-aether-text-dim focus:border-aether-cyan focus:outline-none"
            />
          </div>
        )}

        {provider === 'gitlawb' && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-aether-text-dim">Public GitLawb node URL</label>
            <input
              type="url"
              value={gitlawbNodeUrl}
              onChange={e => setGitlawbNodeUrl(e.target.value)}
              placeholder="https://node.gitlawb.com"
              className="w-full rounded-lg border border-aether-border bg-aether-bg px-3 py-2 text-sm text-aether-text placeholder:text-aether-text-dim focus:border-aether-cyan focus:outline-none"
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-aether-red/20 bg-aether-red/10 p-3 text-sm text-aether-red">{error}</div>
        )}
        {success && (
          <div className="rounded-lg border border-aether-green/20 bg-aether-green/10 p-3 text-sm text-aether-green">
            {success}
            {createdLink && (
              <a href={createdLink} target="_blank" rel="noreferrer" className="mt-2 block break-all text-aether-cyan hover:underline">
                {createdLink}
              </a>
            )}
          </div>
        )}

        <button
          onClick={onCreate}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-aether-cyan px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          {retryingFailedWorkspace ? 'Retry Workspace' : 'Create Workspace'}
        </button>
      </div>
    </Card>
  );
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [agentError, setAgentError] = useState('');

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Bid form
  const [showBidForm, setShowBidForm] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [bidDuration, setBidDuration] = useState('1-2 days');
  const [bidMessage, setBidMessage] = useState('');
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [workspaceProvider, setWorkspaceProvider] = useState<WorkspaceProvider>('github');
  const [githubCollaborators, setGithubCollaborators] = useState('');
  const [gitlawbNodeUrl, setGitlawbNodeUrl] = useState('');
  const [workspaceCreateLoading, setWorkspaceCreateLoading] = useState(false);
  const [workspaceCreateError, setWorkspaceCreateError] = useState('');
  const [workspaceCreateSuccess, setWorkspaceCreateSuccess] = useState('');
  const [createdWorkspace, setCreatedWorkspace] = useState<ContractWorkspace | null>(null);

  // Submit form
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [deliverableHash, setDeliverableHash] = useState('');
  const [submitNotes, setSubmitNotes] = useState('');

  // Dispute form
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  // Rate form
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateScore, setRateScore] = useState(5);
  const [rateComment, setRateComment] = useState('');

  const reload = useCallback(() => {
    if (!id) return;
    getJob(id).then(setJob).catch((error: unknown) => {
      setLoadError(errorMessage(error, 'Failed to reload job'));
    });
  }, [id]);

  // Subscribe to real-time updates for this job via WebSocket.
  // On any event (bid placed, status change, submission, etc.) just re-fetch.
  const wsChannels = id ? [`job:${id}`] : [];
  const handleWsMessage = useCallback(() => {
    reload();
  }, [reload]);
  useWebSocket(wsChannels, handleWsMessage);

  useEffect(() => {
    if (!id) return;
    getJob(id)
      .then(setJob)
      .catch((error: unknown) => {
        setLoadError(errorMessage(error, 'Failed to load job'));
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (isAuthenticated) {
      getHandlerAgents().then(setMyAgents).catch((error: unknown) => {
        setAgentError(errorMessage(error, 'Failed to load your agents'));
      });
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="animate-slide-up max-w-4xl mx-auto">
        <div className="h-8 bg-aether-surface-2 rounded w-2/3 mb-6 animate-pulse" />
        <div className="h-4 bg-aether-surface-2 rounded w-full mb-3 animate-pulse" />
        <div className="h-4 bg-aether-surface-2 rounded w-3/4 animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="animate-slide-up text-center py-24">
        <AlertTriangle className="w-12 h-12 text-aether-amber mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-aether-text-bright mb-2">{loadError ? 'Failed to Load Job' : 'Job Not Found'}</h2>
        {loadError && <p className="text-sm text-aether-red mb-4">{loadError}</p>}
        <Link to="/jobs" className="text-aether-cyan hover:underline">Back to Job Board</Link>
      </div>
    );
  }

  const categoryLabel = job.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const latestQuote = job.paymentLedger?.find(entry => entry.rail.includes('px402') && entry.redactedReference);
  const x402Evidence = x402LedgerEntries(job);
  const x402GateSatisfied = x402Evidence.some(entry => entry.status === 'SETTLED' && entry.rail === job.settlementRail);
  const workspace = getJobWorkspace(job);
  const currentJob = job;
  const isClient = user?.id === job.clientId;
  const isEscrowRail = job.settlementRail === 'standard' || job.settlementRail === 'erc8183';
  const directEscrowRail = isEscrowRail && Number(job.budgetAmount || 0) > 0;
  const acceptBidBackendEnabled = !directEscrowRail || job.escrowLifecycle?.actionAvailability?.acceptBidBackend?.enabled === true;
  const canAcceptBidFromBids = Boolean(
    isClient &&
    !job.agentId &&
    job.bids &&
    job.bids.length > 0 &&
    (job.status === 'OPEN' || (directEscrowRail && job.status === 'FUNDED'))
  );
  const canCreateWorkspace = Boolean(
    isClient &&
    job.agentId &&
    job.acceptedAt &&
    (!workspace || workspace.status === 'FAILED') &&
    ['FUNDED', 'IN_PROGRESS', 'PENDING_REVIEW', 'DISPUTED'].includes(job.status)
  );
  const retryingFailedWorkspace = workspace?.status === 'FAILED';

  async function handleCreateWorkspace() {
    setWorkspaceCreateLoading(true);
    setWorkspaceCreateError('');
    setWorkspaceCreateSuccess('');
    setCreatedWorkspace(null);
    try {
      const created = await createWorkspace(currentJob.id, {
        provider: workspaceProvider,
        ...(workspaceProvider === 'github'
          ? { participants: githubCollaboratorsToParticipants(githubCollaborators) }
          : {}),
        ...(workspaceProvider === 'gitlawb' && gitlawbNodeUrl.trim()
          ? { nodeUrl: gitlawbNodeUrl.trim() }
          : {}),
      });
      setCreatedWorkspace(created);
      setWorkspaceCreateSuccess(`${workspaceProvider === 'gitlawb' ? 'GitLawb' : 'GitHub'} workspace ${retryingFailedWorkspace ? 'retried' : 'created'}.`);
      reload();
    } catch (error: unknown) {
      setWorkspaceCreateError(errorMessage(error, 'Workspace creation failed'));
    } finally {
      setWorkspaceCreateLoading(false);
    }
  }

  async function handleAcceptBidFromBids(bid: NonNullable<Job['bids']>[number]) {
    const agentId = bid.agentId || bid.agent?.id;
    if (!agentId) {
      setActionError('No agent on bid');
      return;
    }

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      await acceptJob(currentJob.id, agentId, {
        workspaceProvider,
        ...(workspaceProvider === 'gitlawb' && gitlawbNodeUrl.trim()
          ? { workspaceNodeUrl: gitlawbNodeUrl.trim() }
          : {}),
      });
      setActionSuccess(`Accepted ${bid.agent?.name || 'agent'}!`);
      reload();
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Accept bid failed'));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="animate-slide-up max-w-4xl mx-auto">
      {/* Back */}
      <Link to="/jobs" className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Job Board
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-mono text-aether-violet bg-aether-violet/10 px-2 py-0.5 rounded">{categoryLabel}</span>
            <StatusBadge status={job.status} />
          </div>
          <h1 className="text-3xl font-bold text-aether-text-bright">{job.title}</h1>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-aether-cyan font-mono flex items-center gap-1">
            <DollarSign className="w-6 h-6" />
            {job.budgetAmount} {job.budgetToken}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Description</h2>
            <p className="text-aether-text-dim leading-relaxed whitespace-pre-wrap">{job.description}</p>
          </Card>

          {job.deliverables && job.deliverables.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Deliverables</h2>
              <ul className="space-y-2">
                {job.deliverables.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-aether-text-dim">
                    <CheckCircle className="w-4 h-4 text-aether-green mt-0.5 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {job.acceptanceCriteria && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Acceptance Criteria</h2>
              <p className="text-aether-text-dim">{job.acceptanceCriteria}</p>
            </Card>
          )}

          {/* Bids */}
          {job.bids && job.bids.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-aether-cyan" />
                Bids ({job.bids.length})
              </h2>
              <div className="space-y-4">
                {(actionError || actionSuccess) && (
                  <div className={`p-3 rounded-lg border text-sm ${actionError ? 'bg-aether-red/10 border-aether-red/20 text-aether-red' : 'bg-aether-green/10 border-aether-green/20 text-aether-green'}`}>
                    {actionError || actionSuccess}
                  </div>
                )}
                {canAcceptBidFromBids && directEscrowRail && !acceptBidBackendEnabled && (
                  <p className="rounded-lg border border-aether-amber/20 bg-aether-amber/10 p-3 text-xs text-aether-amber">
                    Fund escrow and wait for indexed finality before accepting a bid.
                  </p>
                )}
                {job.bids.map(bid => (
                  <div key={bid.id} className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {bid.agent?.avatarUrl ? (
                          <img src={bid.agent.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <Link to={`/agents/${bid.agent?.id}`} className="font-semibold text-aether-text-bright hover:text-aether-cyan transition-colors">
                          {bid.agent?.name || 'Unknown Agent'}
                        </Link>
                        {bid.agent?.avgRating !== undefined && (
                          <span className="flex items-center gap-1 text-sm text-aether-amber">
                            <Star className="w-3 h-3 fill-current" />
                            {bid.agent.avgRating.toFixed(1)}
                          </span>
                        )}
                        {bid.agent?.trustScore != null && (() => {
                          const pct = Math.round(bid.agent.trustScore * 100);
                          const color = bid.agent.trustScore > 0.7 ? 'text-aether-cyan' : bid.agent.trustScore >= 0.4 ? 'text-aether-amber' : 'text-aether-red';
                          return (
                            <span className={`flex items-center gap-0.5 text-sm ${color}`}>
                              <Shield className="w-3 h-3" />
                              {pct}%
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-lg font-bold text-aether-cyan font-mono">${bid.amount}</div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-aether-text-dim mb-2">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {bid.estimatedDuration}</span>
                    </div>
                    {bid.message && <p className="text-sm text-aether-text-dim">{bid.message}</p>}
                    {canAcceptBidFromBids && (
                      <button
                        onClick={() => handleAcceptBidFromBids(bid)}
                        disabled={actionLoading || !acceptBidBackendEnabled}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-aether-green px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:w-auto"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                        Accept Bid
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Submissions */}
          {job.submissions && job.submissions.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Submissions</h2>
              <div className="space-y-3">
                {job.submissions.map(sub => (
                  <div key={sub.id} className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
                    <div className="font-mono text-sm text-aether-cyan break-all mb-2">{sub.deliverableHash}</div>
                    {sub.notes && <p className="text-sm text-aether-text-dim">{sub.notes}</p>}
                    <p className="text-xs text-aether-text-dim mt-2">{new Date(sub.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Client</dt>
                <dd className="text-aether-text font-medium">{job.client?.displayName || job.client?.walletAddress?.slice(0, 10) + '...'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Status</dt>
                <dd><StatusBadge status={job.status} /></dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-aether-text-dim">Network</dt>
                <dd className="text-aether-text text-right">{job.network ? `${job.network} #${job.chainId || 'unknown'}` : 'not recorded'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-aether-text-dim">Settlement</dt>
                <dd className="text-right">
                  <SettlementSummary
                    rail={job.settlementRail}
                    status={job.settlementStatus}
                    network={job.network}
                    chainId={job.chainId}
                    paymentLedger={job.paymentLedger}
                    compact
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-aether-text-dim">Escrow</dt>
                <dd className="text-aether-text text-right">{job.escrowContractVersion || 'legacy'}{job.escrowAddress ? ` ${job.escrowAddress.slice(0, 6)}...${job.escrowAddress.slice(-4)}` : ' pending'}</dd>
              </div>
              {latestQuote && (
                <div className="flex justify-between gap-3">
                  <dt className="text-aether-text-dim">Probe Quote</dt>
                  <dd className="text-aether-text text-right">{latestQuote.rail} {latestQuote.redactedReference}</dd>
                </div>
              )}
              {job.agent && (
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim">Agent</dt>
                  <dd>
                    <Link to={`/agents/${job.agent.id}`} className="text-aether-cyan hover:underline">
                      {job.agent.name}
                    </Link>
                  </dd>
                </div>
              )}
              {job.deadline && (
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim">Deadline</dt>
                  <dd className="text-aether-text">{new Date(job.deadline).toLocaleDateString()}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Posted</dt>
                <dd className="text-aether-text">{new Date(job.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Review Period</dt>
                <dd className="text-aether-text">{Math.round(job.reviewPeriod / 86400)} days</dd>
              </div>
            </dl>
            <div className="mt-4">
              <SettlementSummary
                rail={job.settlementRail}
                status={job.settlementStatus}
                network={job.network}
                chainId={job.chainId}
                paymentLedger={job.paymentLedger}
              />
            </div>
          </Card>

          <EscrowLifecyclePanel job={job} />

          {canCreateWorkspace ? (
            <WorkspaceCreationPanel
              provider={workspaceProvider}
              setProvider={setWorkspaceProvider}
              githubCollaborators={githubCollaborators}
              setGithubCollaborators={setGithubCollaborators}
              gitlawbNodeUrl={gitlawbNodeUrl}
              setGitlawbNodeUrl={setGitlawbNodeUrl}
              retryingFailedWorkspace={retryingFailedWorkspace}
              loading={workspaceCreateLoading}
              error={workspaceCreateError}
              success={workspaceCreateSuccess}
              createdWorkspace={createdWorkspace}
              onCreate={handleCreateWorkspace}
            />
          ) : (
            <WorkspaceStatusPanel workspace={workspace} jobId={job.id} onSnapshotRequested={reload} />
          )}

          <BaseMcpPanel job={job} onJobReload={reload} />

          {(['x402', 'px402'].includes(job.settlementRail) || x402Evidence.length > 0) && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4">x402 Rail</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-aether-text-dim">Ledger Gate</span>
                  <span className={x402GateSatisfied ? 'text-aether-green' : 'text-aether-amber'}>
                    {x402GateSatisfied ? 'satisfied' : 'requires settled receipt'}
                  </span>
                </div>
                {x402Evidence.length === 0 ? (
                  <p className="text-sm text-aether-text-dim">No redacted x402 or px402 payment evidence is attached.</p>
                ) : (
                  x402Evidence.slice(0, 4).map(entry => {
                    const state = x402LaunchState(entry);
                    return (
                      <div key={entry.id} className="p-3 rounded-lg bg-aether-surface-2 border border-aether-border space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-aether-text">{entry.rail}</span>
                          <span className={`text-xs px-2 py-0.5 rounded border ${state.className}`}>{state.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <span className="text-aether-text-dim">Network</span>
                          <span className="text-aether-text text-right">{entry.network || job.network} #{entry.chainId || job.chainId}</span>
                          <span className="text-aether-text-dim">Amount</span>
                          <span className="text-aether-text text-right">{entry.amount || job.budgetAmount} {entry.tokenSymbol || entry.token || job.budgetToken}</span>
                          <span className="text-aether-text-dim">Endpoint</span>
                          <span className="text-aether-text text-right font-mono">{compactHash(entry.endpoint || entry.redactedPaymentReference)}</span>
                          <span className="text-aether-text-dim">Receipt</span>
                          <span className="text-aether-text text-right font-mono">{compactHash(entry.receiptHash || entry.redactedReferenceHash)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          )}

          {/* Ratings */}
          {job.ratings && job.ratings.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Ratings</h2>
              <div className="space-y-3">
                {job.ratings.map(r => (
                  <div key={r.id}>
                    <div className="flex items-center gap-1 text-aether-amber mb-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < r.score ? 'fill-current' : 'opacity-30'}`} />
                      ))}
                    </div>
                    {r.comment && <p className="text-sm text-aether-text-dim">{r.comment}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ─── Actions ─────────────────────────────────────── */}
          {isAuthenticated && (
            <>
              <JobActions
                job={job}
                user={user}
                myAgents={myAgents}
                agentError={agentError}
                selectedAgent={selectedAgent}
                setSelectedAgent={setSelectedAgent}
                bidAmount={bidAmount}
                setBidAmount={setBidAmount}
                bidDuration={bidDuration}
                setBidDuration={setBidDuration}
                bidMessage={bidMessage}
                setBidMessage={setBidMessage}
                workspaceProvider={workspaceProvider}
                setWorkspaceProvider={setWorkspaceProvider}
                gitlawbNodeUrl={gitlawbNodeUrl}
                setGitlawbNodeUrl={setGitlawbNodeUrl}
                showBidForm={showBidForm}
                setShowBidForm={setShowBidForm}
                showSubmitForm={showSubmitForm}
                setShowSubmitForm={setShowSubmitForm}
                showDisputeForm={showDisputeForm}
                setShowDisputeForm={setShowDisputeForm}
                showRateForm={showRateForm}
                setShowRateForm={setShowRateForm}
                deliverableHash={deliverableHash}
                setDeliverableHash={setDeliverableHash}
                submitNotes={submitNotes}
                setSubmitNotes={setSubmitNotes}
                disputeReason={disputeReason}
                setDisputeReason={setDisputeReason}
                rateScore={rateScore}
                setRateScore={setRateScore}
                rateComment={rateComment}
                setRateComment={setRateComment}
                actionLoading={actionLoading}
                setActionLoading={setActionLoading}
                actionError={actionError}
                setActionError={setActionError}
                actionSuccess={actionSuccess}
                setActionSuccess={setActionSuccess}
                reload={reload}
              />
              <ReportJobPanel jobId={job.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
