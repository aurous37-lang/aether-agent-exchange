import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileCheck, Loader2, RefreshCw, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import Card from './Card';
import { dryRunPx402Quote, getBaseMcpRequest, getBaseMcpStatus, getBaseMcpToolCatalog } from '../lib/api';
import type {
  Job,
  McpApprovalStatus,
  McpFeatureFlags,
  McpPreparedRequest,
  McpProviderMetadata,
  McpRequestPollResponse,
  McpRequestRecord,
  McpReceiptSummary,
  McpToolCategory,
  McpToolDiscoverySnapshot,
  PaymentLedgerEntry,
  Px402DryRunResponse,
} from '../lib/api';
import { errorMessage } from '../lib/errors';

type RequestLike = McpPreparedRequest | McpRequestRecord;
type ReceiptLike = McpReceiptSummary | PaymentLedgerEntry;

const categoryOrder: McpToolCategory[] = ['read', 'write', 'x402', 'discovered'];

const approvalCopy: Record<McpApprovalStatus, { label: string; tone: string }> = {
  'no-session': { label: 'No Session', tone: 'text-aether-text-dim bg-aether-surface-2' },
  'pending-approval': { label: 'Pending Approval', tone: 'text-aether-amber bg-aether-amber/10' },
  approved: { label: 'Approved', tone: 'text-aether-cyan bg-aether-cyan/10' },
  failed: { label: 'Failed', tone: 'text-aether-red bg-aether-red/10' },
  'receipt-confirmed': { label: 'Receipt Confirmed', tone: 'text-aether-green bg-aether-green/10' },
};

export default function BaseMcpPanel({ job, onJobReload }: { job: Job; onJobReload?: () => void }) {
  const [status, setStatus] = useState<McpProviderMetadata | null>(job.baseMcp?.provider || job.mcp?.provider || null);
  const [catalog, setCatalog] = useState<McpToolDiscoverySnapshot | null>(job.baseMcp?.catalog || job.baseMcp?.discovery || job.mcp?.catalog || job.mcp?.discovery || null);
  const [routeError, setRouteError] = useState('');
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<Record<string, McpRequestPollResponse>>({});
  const [pollError, setPollError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteResult, setQuoteResult] = useState<Px402DryRunResponse | null>(null);

  const requests = useMemo(() => mergeRequests(job, polls), [job, polls]);
  const requestIdKey = useMemo(() => requests.map(requestIdOf).filter(Boolean).join('|'), [requests]);
  const receipts = useMemo(() => collectReceipts(job), [job]);
  const hasConfirmedReceipt = receipts.some(isConfirmedReceipt);
  const flags = status?.featureFlags || catalogFlags(catalog);
  const connectionStatus = catalog?.status || job.baseMcp?.status || job.mcp?.status || 'unknown';
  const latestQuote = receipts.find(receipt => {
    const ref = `${receiptRail(receipt)} ${receipt.redactedReference || ''} ${receipt.redactedReferenceType || ''} ${receiptPaymentReference(receipt) || ''}`.toLowerCase();
    return ref.includes('px402') || ref.includes('x402');
  });

  async function handleDryRunQuote() {
    setQuoteLoading(true);
    setQuoteError('');
    try {
      const response = await dryRunPx402Quote({
        jobId: job.id,
        ...(job.agentId ? { agentId: job.agentId } : {}),
        method: job.agent?.probeMethod || 'GET',
        ...(job.agent?.paymentPrivacyMode && job.agent.paymentPrivacyMode !== 'standard'
          ? { paymentPrivacyMode: job.agent.paymentPrivacyMode }
          : {}),
      });
      setQuoteResult(response);
      onJobReload?.();
    } catch (error: unknown) {
      setQuoteError(errorMessage(error, 'px402 dry-run quote failed'));
    } finally {
      setQuoteLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRouteError('');
    Promise.allSettled([getBaseMcpStatus(), getBaseMcpToolCatalog()])
      .then(([statusResult, catalogResult]) => {
        if (cancelled) return;
        if (statusResult.status === 'fulfilled') {
          const payload = statusResult.value;
          const provider = payload.provider || payload.metadata;
          if (provider) setStatus(provider);
          setCatalog(current => payload.snapshot || payload.discovery || current);
          setRouteWarnings(current => [...current, ...(payload.warnings || [])]);
        }
        if (catalogResult.status === 'fulfilled') {
          setCatalog(catalogResult.value);
          if (catalogResult.value.provider) setStatus(catalogResult.value.provider);
          setRouteWarnings(current => [...current, ...(catalogResult.value.warnings || [])]);
        }
        if (statusResult.status === 'rejected' && catalogResult.status === 'rejected') {
          setRouteError('Payment-probe route data is not available; showing job-local rail evidence.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requestIds = requestIdKey ? requestIdKey.split('|') : [];
    if (requestIds.length === 0) return;
    let cancelled = false;

    async function poll() {
      const results = await Promise.allSettled(requestIds.map(id => getBaseMcpRequest(id)));
      if (cancelled) return;
      const next: Record<string, McpRequestPollResponse> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[requestIds[index]] = result.value;
      });
      if (Object.keys(next).length > 0) {
        setPolls(current => ({ ...current, ...next }));
        setPollError('');
      } else {
        setPollError('Request polling endpoint unavailable for the listed MCP request ids.');
      }
    }

    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [requestIdKey]);

  const warningItems = buildWarnings(job, flags, catalog, routeWarnings);
  const rows = buildApprovalRows(requests, receipts, hasConfirmedReceipt);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-aether-text-bright flex items-center gap-2">
            <Shield className="w-5 h-5 text-aether-cyan" />
            Payment Probe Audit
          </h2>
          <p className="text-xs text-aether-text-dim mt-1">Dry-run quotes, policy checks, and redacted evidence only; no payment header or wallet payment is sent.</p>
        </div>
        <StatusPill value={connectionStatus} loading={loading} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <Metric label="Network" value={job.network ? `${job.network} #${job.chainId || 'unknown'}` : `${status?.activeChain.network || 'not recorded'} #${status?.activeChain.chainId || 'unknown'}`} />
        <Metric label="Gas" value={status?.activeChain.nativeGasToken || 'ETH'} />
        <Metric label="Endpoint" value={status?.endpoint || catalog?.endpoint || 'mcp.base.org'} mono />
        <Metric label="Redaction" value={catalog?.redaction || 'payment material omitted'} />
      </div>

      {routeError && (
        <Notice tone="amber" icon={AlertTriangle}>
          {routeError}
        </Notice>
      )}

      <div className="space-y-3">
        <PolicyWarnings items={warningItems} />
        <QuoteAction
          job={job}
          flags={flags}
          latestQuote={latestQuote}
          quoteResult={quoteResult}
          quoteError={quoteError}
          quoteLoading={quoteLoading}
          onRun={handleDryRunQuote}
        />
        <ToolCatalog catalog={catalog} />
        <ApprovalList rows={rows} polling={Boolean(requests.length)} pollError={pollError} />
        <ReceiptList receipts={receipts} />
      </div>
    </Card>
  );
}

function PolicyWarnings({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-aether-amber/20 bg-aether-amber/5 p-3 space-y-1.5">
      {items.map(item => (
        <div key={item} className="flex items-start gap-2 text-xs text-aether-amber">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function ToolCatalog({ catalog }: { catalog: McpToolDiscoverySnapshot | null }) {
  const counts = catalog?.counts || { discovered: 0, read: 0, write: 0, x402: 0 };
  const tools = catalog?.tools || [];
  return (
    <div className="rounded-lg border border-aether-border bg-aether-surface-2 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-medium text-aether-text">Tool Catalog</p>
        <span className="text-[11px] text-aether-text-dim">{catalog?.source || 'local'} / {Object.values(counts).reduce((sum, count) => sum + count, 0)} tools</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {categoryOrder.map(category => (
          <div key={category} className="rounded-md border border-aether-border bg-aether-bg px-2 py-1.5">
            <p className="text-[10px] uppercase text-aether-text-dim">{formatLabel(category)}</p>
            <p className="font-mono text-sm text-aether-text-bright">{counts[category] || 0}</p>
          </div>
        ))}
      </div>
      {tools.length > 0 ? (
        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {tools.slice(0, 8).map(tool => (
            <div key={`${tool.name}-${tool.category}`} className="flex items-start justify-between gap-2 rounded-md border border-aether-border/70 bg-aether-bg px-2 py-1.5">
              <div className="min-w-0">
                <p className="text-xs text-aether-text truncate">{tool.title || tool.name}</p>
                <p className="text-[11px] text-aether-text-dim truncate">{tool.redactedReference || tool.description || 'schema hashes only'}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <TinyPill value={tool.category} />
                {(tool.requiresWrite || tool.requiresX402 || tool.requiresMainnet) && <TinyPill value="guarded" tone="amber" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-aether-text-dim">No provider tool catalog is attached to this job yet.</p>
      )}
    </div>
  );
}

function QuoteAction({
  job,
  flags,
  latestQuote,
  quoteResult,
  quoteError,
  quoteLoading,
  onRun,
}: {
  job: Job;
  flags?: McpFeatureFlags | null;
  latestQuote?: ReceiptLike;
  quoteResult: Px402DryRunResponse | null;
  quoteError: string;
  quoteLoading: boolean;
  onRun: () => void;
}) {
  const disabledReason = quoteReadinessIssue(job);
  const candidate = quoteResult?.quote.railCandidate || (receiptRail(latestQuote) === 'px402-dry-run' ? 'recorded' : 'none');
  const approvalEnabled = Boolean(flags?.x402ExecutionEnabled && quoteResult?.quote.railCandidate && quoteResult.quote.railCandidate !== 'unsupported');
  const approvalText = approvalEnabled ? 'Base App approval policy passed for this quote.' : 'Base App approval not enabled';
  const latestReference = quoteResult?.quote.redactedReceiptReference || receiptReference(latestQuote) || receiptPaymentReference(latestQuote);

  return (
    <div className="rounded-lg border border-aether-border bg-aether-surface-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-aether-text">Private Payment Dry-Run Quote</p>
          <p className="mt-1 text-[11px] text-aether-text-dim">{approvalText}</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={quoteLoading || Boolean(disabledReason)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-aether-cyan px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {quoteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Quote
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <TinyPill value={`candidate:${candidate}`} tone={candidate === 'unsupported' ? 'red' : candidate === 'none' ? 'neutral' : 'cyan'} />
        <TinyPill value={job.agent?.px402Supported ? 'px402-supported' : 'dry-run-only'} tone={job.agent?.px402Supported ? 'green' : 'amber'} />
        <TinyPill value={job.agent?.paymentPrivacyMode || 'agent-mode-unknown'} />
      </div>
      {latestReference && (
        <p className="mt-2 truncate font-mono text-[11px] text-aether-text-dim">{latestReference}</p>
      )}
      {quoteResult?.quote.policyReasons && quoteResult.quote.policyReasons.length > 0 && (
        <p className="mt-2 text-[11px] text-aether-amber">{quoteResult.quote.policyReasons.join('; ')}</p>
      )}
      {(disabledReason || quoteError) && (
        <p className="mt-2 text-[11px] text-aether-amber">{disabledReason || quoteError}</p>
      )}
    </div>
  );
}

function ApprovalList({ rows, polling, pollError }: { rows: ApprovalRow[]; polling: boolean; pollError: string }) {
  return (
    <div className="rounded-lg border border-aether-border bg-aether-surface-2 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-medium text-aether-text">Approval Requests</p>
        <span className="inline-flex items-center gap-1 text-[11px] text-aether-text-dim">
          {polling ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          {polling ? 'Polling' : 'No active session'}
        </span>
      </div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="rounded-md border border-aether-border bg-aether-bg px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-aether-text truncate">{row.toolName}</p>
                <p className="text-[11px] text-aether-text-dim font-mono truncate">{row.reference}</p>
              </div>
              <ApprovalPill status={row.status} />
            </div>
            <p className="mt-1 text-[11px] text-aether-text-dim">{row.detail}</p>
          </div>
        ))}
      </div>
      {pollError && <p className="mt-2 text-[11px] text-aether-amber">{pollError}</p>}
    </div>
  );
}

function ReceiptList({ receipts }: { receipts: ReceiptLike[] }) {
  return (
    <div className="rounded-lg border border-aether-border bg-aether-surface-2 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-medium text-aether-text">Redacted Receipts</p>
        <FileCheck className="w-3.5 h-3.5 text-aether-cyan" />
      </div>
      {receipts.length > 0 ? (
        <div className="space-y-2">
          {receipts.map((receipt, index) => (
            <div key={`${receiptId(receipt)}-${index}`} className="rounded-md border border-aether-border bg-aether-bg px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-aether-text truncate">{receipt.redactedReference || receipt.redactedReferenceType || 'redacted receipt reference'}</p>
                  <p className="text-[11px] text-aether-text-dim font-mono truncate">{shorten(receipt.receiptHash || receipt.redactedReferenceHash || receiptId(receipt))}</p>
                </div>
                <TinyPill value={receipt.status || 'RECORDED'} tone={isConfirmedReceipt(receipt) ? 'green' : isFailedReceipt(receipt) ? 'red' : 'cyan'} />
              </div>
              {'endpoint' in receipt && receipt.endpoint && (
                <p className="mt-1 text-[11px] text-aether-text-dim truncate">{receipt.endpoint}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-aether-text-dim">No redacted payment-probe receipt is attached to this job.</p>
      )}
    </div>
  );
}

function Notice({ children, tone, icon: Icon }: { children: string; tone: 'amber' | 'red'; icon: typeof AlertTriangle }) {
  const toneClass = tone === 'red' ? 'border-aether-red/20 bg-aether-red/5 text-aether-red' : 'border-aether-amber/20 bg-aether-amber/5 text-aether-amber';
  return (
    <div className={clsx('mb-3 rounded-lg border p-3 text-xs flex items-start gap-2', toneClass)}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-aether-border bg-aether-surface-2 p-2 min-w-0">
      <p className="text-[10px] uppercase text-aether-text-dim">{label}</p>
      <p className={clsx('text-xs text-aether-text truncate', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

function StatusPill({ value, loading }: { value: string; loading: boolean }) {
  const normalized = String(value || 'unknown').toLowerCase();
  const Icon = loading ? Loader2 : normalized === 'available' ? CheckCircle : normalized === 'blocked' || normalized === 'unavailable' ? AlertTriangle : Clock;
  const tone = normalized === 'available'
    ? 'text-aether-green bg-aether-green/10'
    : normalized === 'blocked' || normalized === 'unavailable'
      ? 'text-aether-red bg-aether-red/10'
      : 'text-aether-amber bg-aether-amber/10';
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', tone)}>
      <Icon className={clsx('w-3 h-3', loading && 'animate-spin')} />
      {loading ? 'Loading' : formatLabel(value)}
    </span>
  );
}

function ApprovalPill({ status }: { status: McpApprovalStatus }) {
  const copy = approvalCopy[status];
  const Icon = status === 'receipt-confirmed' || status === 'approved' ? CheckCircle : status === 'failed' ? AlertTriangle : Clock;
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', copy.tone)}>
      <Icon className="w-3 h-3" />
      {copy.label}
    </span>
  );
}

function TinyPill({ value, tone = 'neutral' }: { value: string; tone?: 'neutral' | 'amber' | 'green' | 'red' | 'cyan' }) {
  const toneClass = {
    neutral: 'text-aether-text-dim bg-aether-surface-2',
    amber: 'text-aether-amber bg-aether-amber/10',
    green: 'text-aether-green bg-aether-green/10',
    red: 'text-aether-red bg-aether-red/10',
    cyan: 'text-aether-cyan bg-aether-cyan/10',
  }[tone];
  return <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-medium', toneClass)}>{formatLabel(value)}</span>;
}

interface ApprovalRow {
  id: string;
  toolName: string;
  reference: string;
  status: McpApprovalStatus;
  detail: string;
}

function mergeRequests(job: Job, polls: Record<string, McpRequestPollResponse>): RequestLike[] {
  const mcp = job.baseMcp || job.mcp;
  const raw = [
    ...(mcp?.requests || []),
    ...(mcp?.approvalRequests || []),
    ...(job.mcpRequests || []),
  ].filter(Boolean);

  const byId = new Map<string, RequestLike>();
  raw.forEach(request => {
    const id = requestIdOf(request) || referenceOf(request) || JSON.stringify(request);
    byId.set(id, request);
  });
  Object.values(polls).forEach(poll => {
    const id = poll.requestId;
    byId.set(id, { ...(byId.get(id) || {}), ...(poll.record || {}), requestId: id, state: poll.state });
  });
  return Array.from(byId.values());
}

function collectReceipts(job: Job): ReceiptLike[] {
  const mcp = job.baseMcp || job.mcp;
  const mcpReceipts = mcp?.receipts || [];
  const ledgerReceipts = (job.paymentLedger || []).filter(entry => {
    const ref = `${entry.rail || ''} ${entry.redactedReference || ''} ${entry.redactedReferenceType || ''} ${entry.redactedPaymentReference || ''}`.toLowerCase();
    return ref.includes('base-mcp') || ref.includes('px402') || ref.includes('mcp:');
  });
  return [...mcpReceipts, ...ledgerReceipts];
}

function buildApprovalRows(requests: RequestLike[], receipts: ReceiptLike[], hasConfirmedReceipt: boolean): ApprovalRow[] {
  if (requests.length === 0 && receipts.length === 0) {
    return [{
      id: 'no-session',
      toolName: 'No payment-probe session',
      reference: 'approval-required-before-live-use',
      status: 'no-session',
      detail: 'No provider request is attached to this job. Live wallet approval and x402 execution remain disabled.',
    }];
  }

  const requestRows = requests.map(request => {
    const requestId = requestIdOf(request) || referenceOf(request) || 'mcp-request';
    const state = String(request.state || request.status || '').toLowerCase();
    const status = stateToApprovalStatus(state, hasConfirmedReceipt);
    return {
      id: requestId,
      toolName: String(request.toolName || request.action || 'Payment-probe request'),
      reference: referenceOf(request) || requestId,
      status,
      detail: detailForStatus(status, request.nextAction || request.status || state),
    };
  });

  const receiptOnlyRows = receipts
    .filter(receipt => !requests.some(request => requestIdOf(request) && requestIdOf(request) === receiptRequestId(receipt)))
    .map((receipt, index) => {
      const status: McpApprovalStatus = isConfirmedReceipt(receipt) ? 'receipt-confirmed' : isFailedReceipt(receipt) ? 'failed' : 'pending-approval';
      return {
        id: `${receiptId(receipt)}-${index}`,
        toolName: 'Payment-probe receipt',
        reference: receipt.redactedReference || receipt.redactedReferenceType || receiptId(receipt),
        status,
        detail: detailForStatus(status, receipt.status || 'RECORDED'),
      };
    });

  return [...requestRows, ...receiptOnlyRows];
}

function stateToApprovalStatus(state: string, hasConfirmedReceipt: boolean): McpApprovalStatus {
  if (hasConfirmedReceipt) return 'receipt-confirmed';
  if (/(failed|rejected|blocked|unavailable|error)/.test(state)) return 'failed';
  if (/(approved|recorded|confirmed|settled|success|available)/.test(state)) return 'approved';
  if (/(prepared|polling|submitted|pending|quoted)/.test(state)) return 'pending-approval';
  return 'no-session';
}

function detailForStatus(status: McpApprovalStatus, source: string) {
  if (status === 'receipt-confirmed') return 'A redacted receipt reference is recorded; paid-chain completion still depends on PaymentLedger settlement gates.';
  if (status === 'approved') return 'Provider request was recorded, but AAE approval and settlement gates still control completion.';
  if (status === 'failed') return `Request failed or was blocked by policy: ${source}`;
  if (status === 'pending-approval') return 'Wallet or operator approval is required before any live tool write or x402 step.';
  return 'No payment-probe approval session exists for this job.';
}

function buildWarnings(job: Job, flags?: McpFeatureFlags | null, catalog?: McpToolDiscoverySnapshot | null, routeWarnings: string[] = []): string[] {
  const warnings = [
    ...routeWarnings,
    'Payment-probe tooling follows provider policy and may be unavailable for this job.',
    'Wallet delegation, signing, automatic payment headers, and paid x402 retries require explicit provider support.',
    'Any paid-chain completion still requires a settled PaymentLedger receipt before job approval can complete.',
  ];
  if ((job.network && job.network !== 'base-sepolia') || (job.chainId && job.chainId !== 84532)) {
    warnings.unshift(`This job is ${job.network} #${job.chainId}; x402/payment-probe tooling is separate from direct-wallet escrow and may be unavailable for this network.`);
  }
  if (flags && !flags.catalogReadEnabled) warnings.push('MCP catalog/read access is disabled by policy.');
  if (flags && !flags.writesEnabled) warnings.push('MCP write preparation is disabled by policy.');
  if (flags && !flags.x402ExecutionEnabled) warnings.push('MCP x402 execution is disabled; dry-run or redacted receipt references only.');
  if (flags && flags.mainnetEnabled) warnings.push('Mainnet flag appears enabled; verify this is an operator-approved environment before proceeding.');
  if (catalog?.tools.some(tool => tool.requiresMainnet)) warnings.push('Catalog contains tools marked mainnet-only; verify the job network before use.');
  return Array.from(new Set(warnings));
}

function quoteReadinessIssue(job: Job): string {
  if (job.network !== 'base-sepolia' || job.chainId !== 84532) {
    return 'x402/px402 quotes are not available for this job network.';
  }
  if (!job.agentId) {
    return 'Assign an agent before running a job-linked quote.';
  }
  if (job.agent?.paymentPrivacyMode === 'standard') {
    return 'Assigned agent is not configured for x402/px402 probes.';
  }
  return '';
}

function catalogFlags(catalog: McpToolDiscoverySnapshot | null): McpFeatureFlags | null {
  if (!catalog) return null;
  return {
    catalogReadEnabled: catalog.status !== 'blocked',
    liveDiscoveryEnabled: catalog.source === 'provider-catalog',
    writesEnabled: false,
    x402ExecutionEnabled: false,
    mainnetEnabled: false,
  };
}

function requestIdOf(request: RequestLike | null | undefined): string | undefined {
  return String(request?.requestId || '').trim() || undefined;
}

function referenceOf(request: RequestLike | null | undefined): string | undefined {
  return String(request?.redactedReference || request?.x402Reference || '').trim() || undefined;
}

function receiptId(receipt: ReceiptLike): string {
  return String(receiptLedgerId(receipt) || receiptRequestId(receipt) || receipt.receiptHash || receipt.redactedReferenceHash || receipt.redactedReference || 'receipt');
}

function receiptLedgerId(receipt: ReceiptLike | null | undefined): string | undefined {
  return receipt && 'id' in receipt ? receipt.id : undefined;
}

function receiptRequestId(receipt: ReceiptLike | null | undefined): string | undefined {
  return receipt && 'requestId' in receipt ? receipt.requestId : undefined;
}

function receiptRail(receipt: ReceiptLike | null | undefined): string {
  return receipt && 'rail' in receipt ? receipt.rail : '';
}

function receiptReference(receipt: ReceiptLike | null | undefined): string | undefined {
  return receipt?.redactedReference;
}

function receiptPaymentReference(receipt: ReceiptLike | null | undefined): string | undefined {
  return receipt && 'redactedPaymentReference' in receipt ? receipt.redactedPaymentReference : undefined;
}

function isConfirmedReceipt(receipt: ReceiptLike): boolean {
  return /^(CONFIRMED|SETTLED)$/i.test(String(receipt.status || ''));
}

function isFailedReceipt(receipt: ReceiptLike): boolean {
  return /^(FAILED|REJECTED|BLOCKED)$/i.test(String(receipt.status || ''));
}

function shorten(value: string) {
  if (value.length <= 28) return value;
  return `${value.slice(0, 12)}...${value.slice(-10)}`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
