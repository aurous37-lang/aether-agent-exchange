import { useState, useEffect, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, CheckCircle, Bot, AlertTriangle, Zap, Shield, Trash2, Loader2, ExternalLink, GitPullRequest, Hash, FileText } from 'lucide-react';
import Card from '../components/Card';
import SettlementSummary from '../components/SettlementSummary';
import { useAuth } from '../hooks/useAuth';
import { getAgent, deleteAgent } from '../lib/api';
import type { Agent, AgentJobHistoryEntry, ContractWorkspace, PaymentLedgerEntry } from '../lib/api';
import { errorMessage } from '../lib/errors';

interface AgentDetail extends Omit<Agent, 'ratings'> {
  acceptedJobs?: AgentJobHistoryEntry[];
  ratings?: Array<{
    score: number;
    comment?: string;
    createdAt: string;
  }>;
}

type ProfileTab = 'overview' | 'history' | 'reviews';

function formatLabel(value?: string): string {
  if (!value) return 'Not recorded';
  return value.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function compactHash(value?: string): string {
  if (!value) return 'not recorded';
  if (value.length <= 26) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function safeHref(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^(https?:\/\/|gitlawb:\/\/)/i.test(value)) return value;
  return undefined;
}

function workspaceRepoHref(workspace?: ContractWorkspace | null): string | undefined {
  return safeHref(workspace?.repoUrl || workspace?.repositoryUrl || workspace?.cloneUrl || workspace?.gitlawbCloneUrl);
}

function workspacePrHref(workspace?: ContractWorkspace | null): string | undefined {
  const prRef = workspace?.pullRequestUrl || workspace?.prUrl || workspace?.pullRequestRef || workspace?.prRef;
  const explicit = safeHref(prRef);
  if (explicit) return explicit;
  const repoHref = workspaceRepoHref(workspace);
  const prNumber = workspace?.pullRequestNumber || workspace?.prNumber;
  if (repoHref?.startsWith('https://github.com/') && prNumber) return `${repoHref.replace(/\/$/, '')}/pull/${prNumber}`;
  return undefined;
}

function workspacePrLabel(workspace?: ContractWorkspace | null): string | undefined {
  if (!workspace) return undefined;
  return workspace.pullRequestRef || workspace.prRef || (workspace.pullRequestNumber || workspace.prNumber ? `#${workspace.pullRequestNumber || workspace.prNumber}` : undefined);
}

function finalEvidenceHash(workspace?: ContractWorkspace | null): string | undefined {
  if (!workspace) return undefined;
  if (workspace.finalSnapshotRef) return workspace.finalSnapshotRef;
  if (typeof workspace.finalSnapshot === 'string') return workspace.finalSnapshot;
  if (workspace.finalSnapshot && typeof workspace.finalSnapshot === 'object') {
    return workspace.finalSnapshot.ref || workspace.finalSnapshot.commitSha || workspace.finalSnapshot.commitHash || workspace.finalSnapshot.treeCid || workspace.finalSnapshot.refCertificateCid;
  }
  return workspace.evidenceSnapshots?.[0]?.evidenceHash;
}

function receiptReference(entry: PaymentLedgerEntry): string {
  return entry.redactedReference || entry.redactedReferenceType || entry.redactedPaymentReference || entry.receiptHash || entry.redactedReferenceHash || entry.txHash || 'receipt recorded';
}

function ExternalEvidenceLink({ href, label, icon }: { href: string; label: string; icon?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-aether-cyan hover:underline break-all">
      {icon}
      {label}
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

function statusTone(status?: string): string {
  if (status === 'COMPLETED' || status === 'RESOLVED') return 'text-aether-green border-aether-green/30 bg-aether-green/10';
  if (status === 'DISPUTED' || status === 'CANCELLED') return 'text-aether-red border-aether-red/30 bg-aether-red/10';
  if (status === 'IN_PROGRESS' || status === 'PENDING_REVIEW') return 'text-aether-cyan border-aether-cyan/30 bg-aether-cyan/10';
  return 'text-aether-amber border-aether-amber/30 bg-aether-amber/10';
}

function receiptTone(status?: string): string {
  if (/^(SETTLED|CONFIRMED)$/i.test(status || '')) return 'text-aether-green';
  if (/^(FAILED|REJECTED|BLOCKED)$/i.test(status || '')) return 'text-aether-red';
  return 'text-aether-amber';
}

function JobHistoryList({ jobs }: { jobs: AgentJobHistoryEntry[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-aether-text-bright">Job History</h2>
        <span className="text-xs text-aether-text-dim">{jobs.length} shown</span>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-aether-text-dim">No accepted or completed jobs are public for this agent yet.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => {
            const workspace = job.workspace;
            const providerLabel = workspace?.provider === 'gitlawb' ? 'GitLawb' : workspace?.provider === 'github' ? 'GitHub' : 'Workspace';
            const repoHref = workspaceRepoHref(workspace);
            const prHref = workspacePrHref(workspace);
            const prLabel = workspacePrLabel(workspace);
            const evidenceHash = finalEvidenceHash(workspace);
            const receipts = job.paymentLedger || [];

            return (
              <div key={job.id} className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Link to={`/jobs/${job.id}`} className="font-semibold text-aether-text-bright hover:text-aether-cyan transition-colors">
                        {job.title}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded border ${statusTone(job.status)}`}>{formatLabel(job.status)}</span>
                    </div>
                    <div className="text-xs text-aether-text-dim">
                      {formatLabel(job.category)} &middot; accepted {job.acceptedAt ? new Date(job.acceptedAt).toLocaleDateString() : new Date(job.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-aether-cyan font-mono font-semibold whitespace-nowrap">
                    {job.budgetAmount} {job.budgetToken}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-aether-text-dim">Job detail</span>
                      <Link to={`/jobs/${job.id}`} className="text-aether-cyan hover:underline">Open job</Link>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-aether-text-dim">Settlement</span>
                      <SettlementSummary
                        rail={job.settlementRail}
                        status={job.settlementStatus}
                        network={job.network}
                        chainId={job.chainId}
                        paymentLedger={job.paymentLedger}
                        compact
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-aether-text-dim">Network</span>
                      <span className="text-aether-text text-right">{job.network || 'not recorded'}{job.chainId ? ` #${job.chainId}` : ''}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-aether-text-dim">{providerLabel}</span>
                      <span className="text-aether-text text-right">{workspace ? formatLabel(workspace.status || workspace.verificationStatus) : 'Not linked'}</span>
                    </div>
                    {repoHref && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-aether-text-dim">Repo</span>
                        <div className="text-right">
                          <ExternalEvidenceLink href={repoHref} label={repoHref.startsWith('gitlawb://') ? compactHash(repoHref) : 'Open repo'} icon={<Hash className="w-3 h-3 shrink-0" />} />
                        </div>
                      </div>
                    )}
                    {(prHref || prLabel) && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-aether-text-dim">PR/ref</span>
                        <div className="text-right">
                          {prHref ? (
                            <ExternalEvidenceLink href={prHref} label={prLabel || 'Open PR'} icon={<GitPullRequest className="w-3 h-3 shrink-0" />} />
                          ) : (
                            <span className="font-mono text-xs text-aether-text">{compactHash(prLabel)}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {workspace && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {workspace.repoDid && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-aether-text-dim">Repo DID</span>
                        <span className="font-mono text-aether-text text-right">{compactHash(workspace.repoDid)}</span>
                      </div>
                    )}
                    {(workspace.commitSha || workspace.commitHash) && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-aether-text-dim">Commit</span>
                        <span className="font-mono text-aether-text text-right">{compactHash(workspace.commitSha || workspace.commitHash)}</span>
                      </div>
                    )}
                    {workspace.treeCid && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-aether-text-dim">Tree CID</span>
                        <span className="font-mono text-aether-text text-right">{compactHash(workspace.treeCid)}</span>
                      </div>
                    )}
                    {workspace.refCertificateCid && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-aether-text-dim">Ref cert</span>
                        <span className="font-mono text-aether-text text-right">{compactHash(workspace.refCertificateCid)}</span>
                      </div>
                    )}
                    {evidenceHash && (
                      <div className="flex items-center justify-between gap-3 md:col-span-2">
                        <span className="inline-flex items-center gap-1 text-aether-text-dim"><Hash className="w-3 h-3" /> Evidence</span>
                        <span className="font-mono text-aether-text text-right">{compactHash(evidenceHash)}</span>
                      </div>
                    )}
                  </div>
                )}

                {receipts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-aether-text-dim">Receipts</div>
                    {receipts.slice(0, 3).map(entry => {
                      const href = safeHref(entry.redactedReference);
                      return (
                        <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-md border border-aether-border bg-aether-bg px-3 py-2 text-xs">
                          <span className={`inline-flex items-center gap-1 ${receiptTone(entry.status)}`}>
                            <FileText className="w-3 h-3" />
                            {entry.rail} {formatLabel(entry.status)}
                          </span>
                          {href ? (
                            <ExternalEvidenceLink href={href} label="Open receipt" />
                          ) : (
                            <span className="font-mono text-aether-text-dim">{compactHash(receiptReference(entry))}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  useEffect(() => {
    if (!id) return;
    getAgent(id)
      .then(setAgent)
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load agent')))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="animate-slide-up max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-aether-surface-2" />
          <div className="h-6 bg-aether-surface-2 rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-slide-up max-w-4xl mx-auto">
        <Link to="/agents" className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </Link>
        <div className="p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">{error}</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="animate-slide-up text-center py-24">
        <AlertTriangle className="w-12 h-12 text-aether-amber mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-aether-text-bright mb-2">Agent Not Found</h2>
        <Link to="/agents" className="text-aether-cyan hover:underline">Back to Agent Registry</Link>
      </div>
    );
  }

  const avgScore = agent.ratings && agent.ratings.length > 0
    ? agent.ratings.reduce((s, r) => s + r.score, 0) / agent.ratings.length
    : agent.avgRating;
  const jobHistory = agent.acceptedJobs || [];
  const reviews = agent.ratings || [];
  const profileTabs: Array<{ id: ProfileTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'Job History', count: jobHistory.length },
    { id: 'reviews', label: 'Reviews', count: reviews.length },
  ];

  return (
    <div className="animate-slide-up max-w-4xl mx-auto">
      <Link to="/agents" className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5 mb-8">
        {agent.avatarUrl ? (
          <img src={agent.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-aether-border" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-aether-cyan to-aether-violet flex items-center justify-center shrink-0">
            <Bot className="w-8 h-8 text-white" />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-aether-text-bright">{agent.name}</h1>
            {agent.active && <CheckCircle className="w-5 h-5 text-aether-green" />}
            {agent.autonomousAccept && (
              <span className="flex items-center gap-1 text-xs text-aether-cyan bg-aether-cyan/10 px-2 py-0.5 rounded">
                <Zap className="w-3 h-3" /> Autonomous
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-aether-amber">
              <Star className="w-4 h-4 fill-current" />
              {avgScore.toFixed(1)}
            </span>
            {agent.trustScore != null && (() => {
              const pct = Math.round(agent.trustScore * 100);
              const color = agent.trustScore > 0.7 ? 'text-aether-cyan' : agent.trustScore >= 0.4 ? 'text-aether-amber' : 'text-aether-red';
              return (
                <span className={`flex items-center gap-1 ${color}`}>
                  <Shield className="w-4 h-4" />
                  {pct}% Trust
                </span>
              );
            })()}
            <span className="text-aether-text-dim">
              {agent._count?.acceptedJobs ?? 0} jobs accepted
            </span>
            <span className="text-aether-text-dim">
              {agent._count?.ratings ?? 0} ratings
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-wrap gap-2 border-b border-aether-border">
            {profileTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-aether-cyan text-aether-cyan' : 'border-transparent text-aether-text-dim hover:text-aether-text'}`}
              >
                {tab.label}
                {tab.count !== undefined && <span className="ml-2 text-xs text-aether-text-dim">{tab.count}</span>}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <>
              <Card>
                <h2 className="text-lg font-semibold text-aether-text-bright mb-3">About</h2>
                <p className="text-aether-text-dim leading-relaxed">{agent.description}</p>
              </Card>

              <Card>
                <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Capabilities</h2>
                <div className="flex flex-wrap gap-2">
                  {agent.capabilities.map(cap => (
                    <span key={cap} className="text-sm px-3 py-1 rounded-lg bg-aether-surface-2 text-aether-text border border-aether-border">
                      {cap}
                    </span>
                  ))}
                </div>
              </Card>

              {agent.models && agent.models.length > 0 && (
                <Card>
                  <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Models</h2>
                  <div className="flex flex-wrap gap-2">
                    {agent.models.map(m => (
                      <span key={m} className="text-sm px-3 py-1 rounded-lg bg-aether-violet/10 text-aether-violet border border-aether-violet/20 font-mono">
                        {m}
                      </span>
                    ))}
                  </div>
                </Card>
              )}

              {agent.modelDetailsRedacted && (
                <Card>
                  <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Models</h2>
                  <p className="text-aether-text-dim leading-relaxed">
                    This handler keeps model and runtime details private. Marketplace reputation, completed work, and settlement records remain visible.
                  </p>
                </Card>
              )}

              {(agent.configDetailsRedacted || agent.publicConfigSummary) && (
                <Card>
                  <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Configuration Disclosure</h2>
                  {agent.publicConfigSummary ? (
                    <p className="text-aether-text-dim leading-relaxed">{agent.publicConfigSummary}</p>
                  ) : (
                    <p className="text-aether-text-dim leading-relaxed">
                      Proprietary setup details are not publicly disclosed.
                    </p>
                  )}
                </Card>
              )}
            </>
          )}

          {activeTab === 'history' && <JobHistoryList jobs={jobHistory} />}

          {activeTab === 'reviews' && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Reviews</h2>
              {reviews.length === 0 ? (
                <p className="text-sm text-aether-text-dim">No public reviews yet.</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((r, i) => (
                    <div key={i} className="p-3 rounded-lg bg-aether-surface-2 border border-aether-border">
                      <div className="flex items-center gap-1 text-aether-amber mb-2">
                        {Array.from({ length: 5 }, (_, j) => (
                          <Star key={j} className={`w-4 h-4 ${j < r.score ? 'fill-current' : 'opacity-30'}`} />
                        ))}
                        <span className="text-xs text-aether-text-dim ml-2">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      {r.comment && <p className="text-sm text-aether-text-dim">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Info</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Handler</dt>
                <dd className="text-aether-text">{agent.handler?.displayName || 'Anonymous'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Availability</dt>
                <dd className="text-aether-text">{agent.availability}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Response Time</dt>
                <dd className="text-aether-text">{agent.responseTime}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Payment Privacy</dt>
                <dd className="text-aether-text text-right">{agent.paymentPrivacyMode.replace(/-/g, ' ')}</dd>
              </div>
              {agent.px402Supported && (
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim">px402</dt>
                  <dd className="text-aether-green text-right">dry-run supported</dd>
                </div>
              )}
              {agent.probePriceUsd && (
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim">Probe Quote</dt>
                  <dd className="text-aether-text text-right">${agent.probePriceUsd}</dd>
                </div>
              )}
              {agent.probeMethod && agent.x402EndpointUrl && (
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim">Probe Method</dt>
                  <dd className="text-aether-text text-right">{agent.probeMethod}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">API Calls</dt>
                <dd className="text-aether-text text-right">{agent.apiCallDisclosureMode}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Wallet</dt>
                <dd className="text-aether-text font-mono text-xs">{agent.walletAddress.slice(0, 8)}...{agent.walletAddress.slice(-6)}</dd>
              </div>
              {agent.trustScore != null && (() => {
                const pct = Math.round(agent.trustScore * 100);
                const color = agent.trustScore > 0.7 ? 'text-aether-cyan' : agent.trustScore >= 0.4 ? 'text-aether-amber' : 'text-aether-red';
                return (
                  <div className="flex justify-between items-center">
                    <dt className="text-aether-text-dim">Trust Score</dt>
                    <dd className={`flex items-center gap-1 font-medium ${color}`}>
                      <Shield className="w-3.5 h-3.5" />
                      {pct}%
                    </dd>
                  </div>
                );
              })()}
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Since</dt>
                <dd className="text-aether-text">{new Date(agent.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </Card>

          {/* Delete Agent — handler only */}
          {user && agent.handler && user.id === agent.handler.id && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-3">Manage Agent</h2>
              {deleteError && (
                <div className="mb-3 p-3 rounded-lg bg-aether-red/10 border border-aether-red/20 text-sm text-aether-red">
                  {deleteError}
                </div>
              )}
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-aether-red text-aether-red font-medium hover:bg-aether-red/10 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Agent
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-aether-red">This will permanently delete this agent and all associated bids, ratings, and API keys. This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setDeleting(true);
                        setDeleteError('');
                        try {
                          await deleteAgent(agent.id);
                          navigate('/agents');
                        } catch (error: unknown) {
                          setDeleteError(errorMessage(error, 'Failed to delete agent'));
                          setConfirmDelete(false);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      disabled={deleting}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-aether-red text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-4 py-2 rounded-lg border border-aether-border text-aether-text-dim text-sm hover:bg-aether-surface-2 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
