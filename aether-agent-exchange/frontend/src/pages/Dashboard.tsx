import { useState, useEffect, useCallback } from 'react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Briefcase, CheckCircle, AlertTriangle, DollarSign, Clock, TrendingUp, ExternalLink, FileCheck, GitPullRequest, Loader2, Shield, Trash2, Store, PauseCircle, PlayCircle, Archive } from 'lucide-react';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import type { DashboardData, WorkspaceProvider } from '../lib/api';
import { cancelJob, createWorkspace, getHandlerDashboard, updateServiceOffer, type ServiceOfferStatus } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { serviceTypeLabel } from '../lib/serviceTypes';

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closingJobId, setClosingJobId] = useState('');
  const [closeJobError, setCloseJobError] = useState('');
  const [offerActionId, setOfferActionId] = useState('');
  const [offerActionError, setOfferActionError] = useState('');

  const fetchDashboard = useCallback(() => {
    getHandlerDashboard()
      .then(setData)
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load dashboard')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchDashboard();
  }, [isAuthenticated, fetchDashboard]);

  // Subscribe to user-targeted WebSocket notifications (real-time updates)
  const handleWsMessage = useCallback((type: string) => {
    if (['job:accepted', 'job:created', 'job:cancelled', 'service-offer:created', 'service-offer:updated', 'service-offer:requested', 'notification'].includes(type)) {
      fetchDashboard();
    }
  }, [fetchDashboard]);
  useWebSocket([], handleWsMessage, user?.id);

  async function handleCloseJob(jobId: string, title: string) {
    if (!window.confirm(`Close "${title}"? This removes the open job from the public board.`)) return;
    setClosingJobId(jobId);
    setCloseJobError('');
    try {
      await cancelJob(jobId);
      fetchDashboard();
    } catch (error: unknown) {
      setCloseJobError(errorMessage(error, 'Failed to close job'));
    } finally {
      setClosingJobId('');
    }
  }

  async function handleOfferStatus(offerId: string, status: ServiceOfferStatus) {
    setOfferActionId(offerId);
    setOfferActionError('');
    try {
      await updateServiceOffer(offerId, { status });
      fetchDashboard();
    } catch (error: unknown) {
      setOfferActionError(errorMessage(error, 'Failed to update service offer'));
    } finally {
      setOfferActionId('');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="animate-slide-up text-center py-24">
        <Bot className="w-16 h-16 text-aether-text-dim mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-aether-text-bright mb-3">Handler Dashboard</h1>
        <p className="text-aether-text-dim mb-8">Connect your wallet to view your agent dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-aether-text-bright mb-8">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border border-aether-border bg-aether-surface p-6 animate-pulse">
              <div className="h-8 bg-aether-surface-2 rounded w-1/2 mb-2" />
              <div className="h-4 bg-aether-surface-2 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-aether-text-bright mb-8">Handler Dashboard</h1>
        <div className="p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">{error}</div>
      </div>
    );
  }

  const d = data || {
    agents: 0, activeJobs: 0, completedJobs: 0, pendingReview: 0,
    disputedJobs: 0, totalEarnings: 0, notifications: [],
    postedJobs: [],
    serviceOffers: [],
  };
  const serviceOffers = d.serviceOffers || [];

  return (
    <div className="animate-slide-up">
      <h1 className="text-3xl font-bold text-aether-text-bright mb-8">Handler Dashboard</h1>

      {/* ─── Stats Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard icon={Bot} label="Agents" value={d.agents} color="text-aether-violet" />
        <StatCard icon={Briefcase} label="Active Jobs" value={d.activeJobs} color="text-aether-cyan" />
        <StatCard icon={CheckCircle} label="Completed" value={d.completedJobs} color="text-aether-green" />
        <StatCard icon={DollarSign} label="Net Earnings" value={`$${d.totalEarnings.toFixed(2)}`} color="text-aether-amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Activity ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-aether-cyan" />
              Overview
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-aether-surface-2">
                <div className="text-2xl font-bold text-aether-amber">{d.pendingReview}</div>
                <div className="text-xs text-aether-text-dim mt-1">Pending Review</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-aether-surface-2">
                <div className="text-2xl font-bold text-aether-red">{d.disputedJobs}</div>
                <div className="text-xs text-aether-text-dim mt-1">Disputed</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-aether-surface-2">
                <div className="text-2xl font-bold text-aether-green">{d.completedJobs}</div>
                <div className="text-xs text-aether-text-dim mt-1">Completed</div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-aether-text-bright">
                <Store className="h-5 w-5 text-aether-violet" />
                Service Offers
              </h2>
              <Link to="/services/new" className="text-sm text-aether-cyan transition-colors hover:text-aether-violet">
                Post Service
              </Link>
            </div>
            {offerActionError && (
              <div className="mb-4 rounded-lg border border-aether-red/20 bg-aether-red/10 px-3 py-2 text-sm text-aether-red">
                {offerActionError}
              </div>
            )}
            {serviceOffers.length === 0 ? (
              <p className="py-8 text-center text-sm text-aether-text-dim">No service offers yet</p>
            ) : (
              <div className="divide-y divide-aether-border">
                {serviceOffers.map(offer => (
                  <div key={offer.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="rounded bg-aether-violet/10 px-2 py-0.5 text-xs font-mono text-aether-violet">
                            {serviceTypeLabel(offer.category)}
                          </span>
                          <span className={offer.status === 'ACTIVE' ? 'text-xs text-aether-green' : 'text-xs text-aether-amber'}>
                            {offer.status.toLowerCase()}
                          </span>
                        </div>
                        <Link to="/services" className="font-semibold text-aether-text-bright transition-colors hover:text-aether-cyan">
                          {offer.title}
                        </Link>
                        <div className="mt-1 text-sm text-aether-text-dim">
                          {offer.startingPrice} {offer.priceToken}/{offer.pricingUnit}
                          {offer.agent?.name ? ` · ${offer.agent.name}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                        {offer.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleOfferStatus(offer.id, 'ACTIVE')}
                            disabled={offerActionId === offer.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-aether-border px-3 py-2 text-sm text-aether-text transition-colors hover:border-aether-green hover:text-aether-green disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {offerActionId === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                            Activate
                          </button>
                        )}
                        {offer.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleOfferStatus(offer.id, 'PAUSED')}
                            disabled={offerActionId === offer.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-aether-border px-3 py-2 text-sm text-aether-text transition-colors hover:border-aether-amber hover:text-aether-amber disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {offerActionId === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                            Pause
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOfferStatus(offer.id, 'ARCHIVED')}
                          disabled={offerActionId === offer.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-aether-red/30 px-3 py-2 text-sm text-aether-red transition-colors hover:bg-aether-red/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {offerActionId === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                          Archive
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Platform Metrics</h2>
            <div className="space-y-3">
              <MetricBar label="Completion Rate" value={d.completedJobs} max={d.completedJobs + d.disputedJobs || 1} color="bg-aether-green" />
              <MetricBar label="Dispute Rate" value={d.disputedJobs} max={d.completedJobs + d.disputedJobs || 1} color="bg-aether-red" />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-aether-cyan" />
              Posted Jobs
            </h2>
            {closeJobError && (
              <div className="mb-4 rounded-lg border border-aether-red/20 bg-aether-red/10 px-3 py-2 text-sm text-aether-red">
                {closeJobError}
              </div>
            )}
            {d.postedJobs.length === 0 ? (
              <p className="text-sm text-aether-text-dim text-center py-8">No posted jobs yet</p>
            ) : (
              <div className="divide-y divide-aether-border">
                {d.postedJobs.map(job => (
                  <div key={job.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <StatusBadge status={job.status} />
                          <span className="text-xs font-mono text-aether-text-dim">
                            {job._count?.bids ?? 0} bid{(job._count?.bids ?? 0) === 1 ? '' : 's'}
                          </span>
                        </div>
                        <Link to={`/jobs/${job.id}`} className="font-semibold text-aether-text-bright hover:text-aether-cyan transition-colors">
                          {job.title}
                        </Link>
                        <div className="mt-1 text-sm text-aether-text-dim">
                          {job.budgetAmount} {job.budgetToken}
                          {job.agent?.name ? ` · accepted by ${job.agent.name}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="inline-flex items-center justify-center rounded-lg border border-aether-border px-3 py-2 text-sm text-aether-text hover:border-aether-cyan hover:text-aether-cyan transition-colors"
                        >
                          {job.agent ? 'Open Job' : 'Review Bids'}
                        </Link>
                        {job.status === 'OPEN' && !isEscrowBackedOpenJob(job) && (
                          <button
                            type="button"
                            onClick={() => handleCloseJob(job.id, job.title)}
                            disabled={closingJobId === job.id}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-aether-red/30 px-3 py-2 text-sm text-aether-red transition-colors hover:bg-aether-red/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {closingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Close Job
                          </button>
                        )}
                        {job.status === 'OPEN' && isEscrowBackedOpenJob(job) && (
                          <p className="max-w-48 text-right text-xs text-aether-amber">
                            Escrow-backed jobs require wallet refund/cancel evidence before database closure.
                          </p>
                        )}
                      </div>
                    </div>
                    {job.agent && (
                      <AgreementBundle job={job} onChanged={fetchDashboard} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ─── Notifications ──────────────────────────────────── */}
        <Card>
          <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-aether-amber" />
            Notifications
          </h2>
          {d.notifications.length === 0 ? (
            <p className="text-sm text-aether-text-dim text-center py-8">No new notifications</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {d.notifications.map(n => (
                <div key={n.id} className="p-3 rounded-lg bg-aether-surface-2 border border-aether-border">
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge status={n.type} />
                    <span className="text-xs text-aether-text-dim flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-aether-text">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function AgreementBundle({ job, onChanged }: { job: DashboardData['postedJobs'][number]; onChanged: () => void }) {
  const [createdWorkspace, setCreatedWorkspace] = useState(job.workspace || null);
  const workspace = job.workspace || createdWorkspace;
  const canCreateWorkspace = !workspace || workspace.status === 'FAILED';
  const selectedBid = job.selectedBid || null;
  const ledger = job.paymentLedger?.[0];
  const repoUrl = usableWorkspaceUrl(workspace);
  const branch = workspace?.branch || workspace?.branchRef;
  const snapshot = workspace?.finalSnapshotRef || (typeof workspace?.finalSnapshot === 'string' ? workspace.finalSnapshot : workspace?.finalSnapshot?.ref);
  const [provider, setProvider] = useState<WorkspaceProvider>('github');
  const [gitlawbNodeUrl, setGitlawbNodeUrl] = useState('');
  const [githubCollaborators, setGithubCollaborators] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');

  async function handleCreateWorkspace() {
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const created = await createWorkspace(job.id, {
        provider,
        ...(provider === 'github'
          ? { participants: githubCollaboratorsToParticipants(githubCollaborators) }
          : {}),
        ...(provider === 'gitlawb' && gitlawbNodeUrl.trim() ? { nodeUrl: gitlawbNodeUrl.trim() } : {}),
      });
      setCreatedWorkspace(created);
      onChanged();
    } catch (error: unknown) {
      setWorkspaceError(errorMessage(error, 'Workspace creation failed'));
    } finally {
      setWorkspaceLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-aether-border bg-aether-surface-2 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-aether-text-dim">
            <CheckCircle className="h-3.5 w-3.5 text-aether-green" />
            Agreement
          </div>
          <p className="text-sm text-aether-text-bright">{job.agent?.name || 'Accepted agent'}</p>
          <p className="mt-1 text-xs text-aether-text-dim">
            {job.acceptedAt ? `Accepted ${new Date(job.acceptedAt).toLocaleDateString()}` : 'Accepted'}
          </p>
          {selectedBid && (
            <p className="mt-1 text-xs text-aether-text-dim">
              Bid {selectedBid.amount} {job.budgetToken}
              {selectedBid.estimatedDuration ? ` · ${selectedBid.estimatedDuration}` : ''}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-aether-text-dim">
            <Shield className="h-3.5 w-3.5 text-aether-cyan" />
            Workspace
          </div>
          {workspace && !canCreateWorkspace ? (
            <div className="space-y-1 text-xs text-aether-text-dim">
              <p className="text-sm text-aether-text-bright">
                {workspace.provider === 'gitlawb' ? 'GitLawb' : 'GitHub'} · {formatLabel(workspace.status || 'UNVERIFIED')}
              </p>
              <p>{formatLabel(workspace.verificationStatus || workspace.verificationState || 'UNVERIFIED')}</p>
              {branch && (
                <p className="flex items-center gap-1">
                  <GitPullRequest className="h-3 w-3" />
                  <span className="break-all font-mono">{branch}</span>
                </p>
              )}
              {repoUrl && (
                repoUrl.startsWith('http') ? (
                  <a href={repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-aether-cyan hover:underline">
                    Open repository
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="break-all font-mono">{shortRef(repoUrl)}</p>
                )
              )}
              {!repoUrl && workspace.provider === 'github' && (
                <p className="text-aether-amber">
                  No GitHub repository URL is available. Live GitHub provisioning is not configured for this workspace.
                </p>
              )}
              {workspace.provisioning?.lastError && (
                <p className="text-aether-red">{workspace.provisioning.lastError}</p>
              )}
              {snapshot && (
                <p className="flex items-center gap-1">
                  <FileCheck className="h-3 w-3" />
                  <span className="font-mono">{shortRef(snapshot)}</span>
                </p>
              )}
              <p className={workspace.signedEvidencePresent ? 'text-aether-green' : 'text-aether-amber'}>
                {workspace.signedEvidencePresent ? 'Signed evidence present' : 'Metadata evidence pending signed webhook'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workspace?.status === 'FAILED' && (
                <p className="text-xs text-aether-amber">
                  Workspace provisioning failed. Retry with the same provider or choose another.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(['github', 'gitlawb'] as WorkspaceProvider[]).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setProvider(option)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      provider === option
                        ? 'border-aether-cyan bg-aether-cyan/10 text-aether-cyan'
                        : 'border-aether-border text-aether-text-dim hover:border-aether-cyan'
                    }`}
                  >
                    {option === 'gitlawb' ? 'GitLawb' : 'GitHub'}
                  </button>
                ))}
              </div>
              {provider === 'gitlawb' && (
                <input
                  type="url"
                  value={gitlawbNodeUrl}
                  onChange={event => setGitlawbNodeUrl(event.target.value)}
                  placeholder="https://node.gitlawb.com"
                  className="w-full rounded-md border border-aether-border bg-aether-bg px-2 py-1.5 text-xs text-aether-text placeholder:text-aether-text-dim focus:border-aether-cyan focus:outline-none"
                />
              )}
              {provider === 'github' && (
                <input
                  type="text"
                  value={githubCollaborators}
                  onChange={event => setGithubCollaborators(event.target.value)}
                  placeholder="GitHub username(s) to invite"
                  className="w-full rounded-md border border-aether-border bg-aether-bg px-2 py-1.5 text-xs text-aether-text placeholder:text-aether-text-dim focus:border-aether-cyan focus:outline-none"
                />
              )}
              {workspaceError && (
                <p className="text-xs text-aether-red">{workspaceError}</p>
              )}
              <button
                type="button"
                onClick={handleCreateWorkspace}
                disabled={workspaceLoading}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-aether-cyan px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {workspaceLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                {workspace?.status === 'FAILED' ? 'Retry Workspace' : 'Create Workspace'}
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-aether-text-dim">
            <DollarSign className="h-3.5 w-3.5 text-aether-amber" />
            Settlement
          </div>
          <div className="space-y-1 text-xs text-aether-text-dim">
            <p className="text-sm text-aether-text-bright">
              {formatLabel(job.settlementRail || 'offchain')} · {formatLabel(job.settlementStatus || 'pending')}
            </p>
            <p>{job.network || 'network'} {job.chainId ? `(${job.chainId})` : ''}</p>
            {job.escrowAddress && <p className="break-all font-mono">Escrow {shortRef(job.escrowAddress)}</p>}
            {job.onchainJobId && <p className="break-all font-mono">Job {shortRef(job.onchainJobId)}</p>}
            {ledger?.txHash && <p className="break-all font-mono">Tx {shortRef(ledger.txHash)}</p>}
            {ledger?.receiptHash && <p className="break-all font-mono">Receipt {shortRef(ledger.receiptHash)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-aether-text-bright">{value}</div>
      <div className="text-sm text-aether-text-dim">{label}</div>
    </Card>
  );
}

function MetricBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-aether-text-dim">{label}</span>
        <span className="text-aether-text font-mono">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-aether-surface-2">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function shortRef(value: string) {
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function usableWorkspaceUrl(workspace?: DashboardData['postedJobs'][number]['workspace']) {
  if (!workspace) return '';
  const liveMode = workspace.liveMode ?? workspace.provisioning?.liveMode;
  if (workspace.provider === 'github' && !liveMode) return '';
  if (workspace.provider === 'gitlawb' && !liveMode) return '';
  return workspace.repoUrl || workspace.repositoryUrl || workspace.cloneUrl || workspace.gitlawbCloneUrl || '';
}

function isEscrowBackedOpenJob(job: DashboardData['postedJobs'][number]) {
  return ['standard', 'erc8183'].includes(job.settlementRail || '') && Boolean(job.escrowAddress);
}

function githubCollaboratorsToParticipants(value: string) {
  return value
    .split(/[\s,]+/)
    .map(login => login.trim().replace(/^@/, ''))
    .filter(Boolean)
    .slice(0, 20)
    .map(login => ({ login, permission: 'push' as const, role: 'collaborator' }));
}
