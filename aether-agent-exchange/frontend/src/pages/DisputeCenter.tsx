import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Flag, FileText, Scale, CheckCircle, Clock, User, Loader2, Hash, Shield } from 'lucide-react';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { getDispute, submitEvidence } from '../lib/api';
import type { Dispute } from '../lib/api';
import { errorMessage } from '../lib/errors';

export default function DisputeCenter() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidenceHash, setEvidenceHash] = useState('');
  const [evidenceDesc, setEvidenceDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadDispute = useCallback(() => {
    if (!id || !isAuthenticated) { setLoading(false); return; }
    getDispute(id)
      .then(setDispute)
      .catch((error: unknown) => setError(errorMessage(error, 'Failed to load dispute')))
      .finally(() => setLoading(false));
  }, [id, isAuthenticated]);

  useEffect(() => { loadDispute(); }, [loadDispute]);

  const handleSubmitEvidence = async () => {
    if (!id || !evidenceHash.trim() || !evidenceDesc.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);
    try {
      await submitEvidence(id, { contentHash: evidenceHash.trim(), description: evidenceDesc.trim() });
      setEvidenceHash('');
      setEvidenceDesc('');
      setSubmitSuccess(true);
      loadDispute();
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (error: unknown) {
      setSubmitError(errorMessage(error, 'Failed to submit evidence'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="animate-slide-up text-center py-24">
        <Shield className="w-16 h-16 text-aether-text-dim mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-aether-text-bright mb-3">Dispute Center</h1>
        <p className="text-aether-text-dim mb-8">Connect your wallet to view dispute details.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-slide-up max-w-4xl mx-auto">
        <div className="h-8 bg-aether-surface-2 rounded w-2/3 mb-6 animate-pulse" />
        <div className="h-4 bg-aether-surface-2 rounded w-full mb-3 animate-pulse" />
        <div className="h-4 bg-aether-surface-2 rounded w-3/4 animate-pulse" />
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="animate-slide-up text-center py-24">
        <AlertTriangle className="w-12 h-12 text-aether-amber mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-aether-text-bright mb-2">
          {error ? 'Failed to Load Dispute' : 'Dispute Not Found'}
        </h2>
        {error && <p className="text-sm text-aether-red mb-4">{error}</p>}
        <Link to="/jobs" className="text-aether-cyan hover:underline">Back to Job Board</Link>
      </div>
    );
  }

  const isResolved = dispute.status === 'RESOLVED';
  const agentPct = dispute.agentBps != null ? (dispute.agentBps / 100) : null;
  const clientPct = agentPct != null ? (100 - agentPct) : null;

  return (
    <div className="animate-slide-up max-w-4xl mx-auto">
      {/* Back */}
      <Link to={`/jobs/${dispute.jobId}`} className="inline-flex items-center gap-2 text-aether-text-dim hover:text-aether-cyan mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Job
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Flag className="w-5 h-5 text-aether-red" />
            <StatusBadge status={dispute.status} />
          </div>
          <h1 className="text-3xl font-bold text-aether-text-bright">Dispute Center</h1>
          <p className="text-sm text-aether-text-dim mt-1 font-mono">ID: {dispute.id.slice(0, 12)}...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dispute Details */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-3 flex items-center gap-2">
              <Flag className="w-5 h-5 text-aether-red" />
              Dispute Details
            </h2>
            <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
              <p className="text-aether-text leading-relaxed whitespace-pre-wrap">{dispute.reason}</p>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-aether-text-dim flex items-center gap-1"><User className="w-3 h-3" /> Opened By</dt>
                <dd className="text-aether-text font-mono text-xs">{dispute.openedBy.slice(0, 6)}...{dispute.openedBy.slice(-4)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim flex items-center gap-1"><Clock className="w-3 h-3" /> Filed</dt>
                <dd className="text-aether-text">{new Date(dispute.createdAt).toLocaleString()}</dd>
              </div>
              {dispute.resolvedAt && (
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Resolved</dt>
                  <dd className="text-aether-text">{new Date(dispute.resolvedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Job Summary */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-aether-cyan" />
              Job Summary
            </h2>
            <div className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
              <div className="flex items-center justify-between mb-2">
                <Link to={`/jobs/${dispute.job.id}`} className="text-aether-text-bright font-semibold hover:text-aether-cyan transition-colors">
                  {dispute.job.title}
                </Link>
                <StatusBadge status={dispute.job.status} />
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-aether-text-dim">Budget</dt>
                  <dd className="text-aether-cyan font-mono">${dispute.job.budgetAmount} {dispute.job.budgetToken}</dd>
                </div>
                {dispute.job.client && (
                  <div className="flex justify-between">
                    <dt className="text-aether-text-dim">Client</dt>
                    <dd className="text-aether-text">{dispute.job.client.displayName || dispute.job.client.walletAddress.slice(0, 10) + '...'}</dd>
                  </div>
                )}
                {dispute.job.agent && (
                  <div className="flex justify-between">
                    <dt className="text-aether-text-dim">Agent</dt>
                    <dd>
                      <Link to={`/agents/${dispute.job.agent.id}`} className="text-aether-cyan hover:underline">
                        {dispute.job.agent.name}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </Card>

          {/* Evidence */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
              <Hash className="w-5 h-5 text-aether-violet" />
              Evidence ({dispute.evidence.length})
            </h2>
            {dispute.evidence.length === 0 ? (
              <p className="text-sm text-aether-text-dim text-center py-8">No evidence submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {dispute.evidence.map(ev => (
                  <div key={ev.id} className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-aether-text-dim flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {ev.submittedBy.slice(0, 6)}...{ev.submittedBy.slice(-4)}
                      </span>
                      <span className="text-xs text-aether-text-dim flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-mono text-sm text-aether-cyan break-all mb-2">{ev.contentHash}</div>
                    <p className="text-sm text-aether-text-dim">{ev.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Submit Evidence */}
          {!isResolved && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
                <Hash className="w-5 h-5 text-aether-cyan" />
                Submit Evidence
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-aether-text-dim mb-1">Content Hash</label>
                  <input
                    type="text"
                    value={evidenceHash}
                    onChange={e => setEvidenceHash(e.target.value)}
                    placeholder="IPFS CID or content hash"
                    className="w-full px-4 py-2 rounded-lg bg-aether-surface-2 border border-aether-border text-aether-text-bright placeholder-aether-text-dim focus:border-aether-cyan focus:ring-1 focus:ring-aether-cyan focus:outline-none font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-aether-text-dim mb-1">Description</label>
                  <textarea
                    value={evidenceDesc}
                    onChange={e => setEvidenceDesc(e.target.value)}
                    placeholder="Describe what this evidence shows"
                    rows={3}
                    className="w-full px-4 py-2 rounded-lg bg-aether-surface-2 border border-aether-border text-aether-text-bright placeholder-aether-text-dim focus:border-aether-cyan focus:ring-1 focus:ring-aether-cyan focus:outline-none text-sm resize-none"
                  />
                </div>
                {submitError && (
                  <p className="text-sm text-aether-red">{submitError}</p>
                )}
                {submitSuccess && (
                  <p className="text-sm text-aether-green">Evidence submitted successfully.</p>
                )}
                <button
                  onClick={handleSubmitEvidence}
                  disabled={submitting || !evidenceHash.trim() || !evidenceDesc.trim()}
                  className="w-full py-2 rounded-lg font-semibold text-sm transition-all bg-aether-cyan/20 text-aether-cyan border border-aether-cyan/30 hover:bg-aether-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Evidence'
                  )}
                </button>
              </div>
            </Card>
          )}

          {/* Arbiter Votes */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
              <Scale className="w-5 h-5 text-aether-amber" />
              Arbiter Votes ({dispute.votes.length}/3)
            </h2>
            {dispute.votes.length === 0 ? (
              <p className="text-sm text-aether-text-dim text-center py-8">No arbiter votes yet. Awaiting review.</p>
            ) : (
              <div className="space-y-3">
                {dispute.votes.map(vote => {
                  const votePct = (vote.agentBps / 100).toFixed(1);
                  return (
                    <div key={vote.id} className="p-4 rounded-lg bg-aether-surface-2 border border-aether-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-aether-text-dim flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          Arbiter {vote.arbiterWallet.slice(0, 6)}...{vote.arbiterWallet.slice(-4)}
                        </span>
                        <span className="text-xs font-mono text-aether-amber">{votePct}% to agent</span>
                      </div>
                      <p className="text-sm text-aether-text-dim">{vote.reasoning}</p>
                      <p className="text-xs text-aether-text-dim mt-2">{new Date(vote.createdAt).toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Summary */}
          <Card>
            <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Status</h2>
            <div className="text-center p-4 rounded-lg bg-aether-surface-2 mb-4">
              <StatusBadge status={dispute.status} />
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Votes Cast</dt>
                <dd className="text-aether-text font-mono">{dispute.votes.length} / 3</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-aether-text-dim">Evidence Items</dt>
                <dd className="text-aether-text font-mono">{dispute.evidence.length}</dd>
              </div>
            </dl>
          </Card>

          {/* Resolution Outcome */}
          {isResolved && agentPct != null && clientPct != null && (
            <Card glow="cyan">
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-aether-green" />
                Resolution
              </h2>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-aether-surface-2">
                  <div className="text-center mb-3">
                    <span className="text-sm text-aether-text-dim">Fund Split</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-aether-text-dim mb-1">Agent</div>
                      <div className="h-3 rounded-full bg-aether-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-aether-cyan transition-all"
                          style={{ width: `${agentPct}%` }}
                        />
                      </div>
                      <div className="text-sm font-mono text-aether-cyan mt-1">{agentPct.toFixed(1)}%</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-aether-text-dim mb-1">Client</div>
                      <div className="h-3 rounded-full bg-aether-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-aether-violet transition-all"
                          style={{ width: `${clientPct}%` }}
                        />
                      </div>
                      <div className="text-sm font-mono text-aether-violet mt-1">{clientPct.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
                {dispute.resolvedAt && (
                  <div className="text-center">
                    <span className="text-xs text-aether-text-dim">
                      Resolved {new Date(dispute.resolvedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Submissions from the job */}
          {dispute.job.submissions && dispute.job.submissions.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-aether-text-bright mb-4">Deliverables</h2>
              <div className="space-y-3">
                {dispute.job.submissions.map(sub => (
                  <div key={sub.id} className="p-3 rounded-lg bg-aether-surface-2 border border-aether-border">
                    <div className="font-mono text-xs text-aether-cyan break-all mb-1">{sub.deliverableHash}</div>
                    {sub.notes && <p className="text-xs text-aether-text-dim">{sub.notes}</p>}
                    <p className="text-xs text-aether-text-dim mt-1">{new Date(sub.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
