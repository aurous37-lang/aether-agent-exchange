import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Code, Copy, ExternalLink, FileCheck, GitPullRequest, Hash, Info, RefreshCw, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import Card from './Card';
import { getWorkspaceProviders, requestWorkspaceEvidenceSnapshot } from '../lib/api';
import type { ContractWorkspace, WorkspaceProvider, WorkspaceProviderProfile } from '../lib/api';
import { errorMessage } from '../lib/errors';

const providerLabels: Record<WorkspaceProvider, string> = {
  github: 'GitHub',
  gitlawb: 'GitLawb',
};

const providerTradeoffs: Record<WorkspaceProvider, {
  lead: string;
  strengths: string[];
  tradeoffs: string[];
}> = {
  github: {
    lead: 'Centralized git hosting with mature private repos, reviews, CI, webhooks, and broad developer tooling.',
    strengths: ['Familiar repo and PR workflow', 'Strong permissions and automation support'],
    tradeoffs: ['Requires account/OAuth management', 'Platform custody and centralized policy risk'],
  },
  gitlawb: {
    lead: 'Agent-native decentralized git over public GitLawb nodes with DID identity, signed pushes, and verifiable refs.',
    strengths: ['DID-based actor identity', 'UCAN-scoped delegation and ref evidence'],
    tradeoffs: ['Alpha API/tooling risk', 'Public-node consistency and stricter key management'],
  },
};

const verificationStyles: Record<string, string> = {
  VERIFIED: 'text-aether-green bg-aether-green/10',
  PASSED: 'text-aether-green bg-aether-green/10',
  PENDING: 'text-aether-amber bg-aether-amber/10',
  VERIFYING: 'text-aether-amber bg-aether-amber/10',
  FAILED: 'text-aether-red bg-aether-red/10',
  REJECTED: 'text-aether-red bg-aether-red/10',
  STALE: 'text-aether-text-dim bg-aether-surface-2',
};

export function WorkspaceProviderSelector({
  selected,
  onSelect,
  gitlawbNodeUrl,
  onGitlawbNodeUrlChange,
}: {
  selected: WorkspaceProvider;
  onSelect: (provider: WorkspaceProvider) => void;
  gitlawbNodeUrl: string;
  onGitlawbNodeUrlChange: (url: string) => void;
}) {
  const [profiles, setProfiles] = useState<WorkspaceProviderProfile[]>([]);

  useEffect(() => {
    getWorkspaceProviders()
      .then(result => setProfiles(result.providers || []))
      .catch(() => setProfiles([]));
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-aether-text mb-1">Workspace provider</p>
        <p className="text-xs text-aether-text-dim">
          The workspace is collaboration evidence only; AAE approval, disputes, and settlement gates still control completion.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {(['github', 'gitlawb'] as WorkspaceProvider[]).map(provider => {
          const active = selected === provider;
          const Icon = provider === 'github' ? Code : Shield;
          const copy = providerTradeoffs[provider];
          const profile = profiles.find(item => item.provider === provider || item.id === provider);
          const warnings = profile?.warnings || [];
          const nodeSummary = provider === 'gitlawb' ? formatGitLawbNodeSummary(profile) : '';
          return (
            <button
              key={provider}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(provider)}
              className={clsx(
                'w-full rounded-lg border p-3 text-left transition-all',
                active
                  ? 'border-aether-cyan bg-aether-cyan/10'
                  : 'border-aether-border bg-aether-surface-2 hover:border-aether-cyan/60'
              )}
            >
              <span className="flex items-center gap-2 text-aether-text-bright font-semibold">
                <Icon className={clsx('w-4 h-4', provider === 'github' ? 'text-aether-cyan' : 'text-aether-violet')} />
                {providerLabels[provider]}
              </span>
              <span className="block mt-2 text-xs leading-relaxed text-aether-text-dim">{copy.lead}</span>
              {nodeSummary && (
                <span className="mt-2 flex items-center gap-1.5 text-xs text-aether-cyan">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  {nodeSummary}
                </span>
              )}
              <span className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="rounded-md border border-aether-green/20 bg-aether-green/5 p-2">
                  <span className="block text-[11px] uppercase tracking-wide text-aether-green mb-1">Strengths</span>
                  {copy.strengths.map(item => (
                    <span key={item} className="block text-xs text-aether-text-dim">{item}</span>
                  ))}
                </span>
                <span className="rounded-md border border-aether-amber/20 bg-aether-amber/5 p-2">
                  <span className="block text-[11px] uppercase tracking-wide text-aether-amber mb-1">Tradeoffs</span>
                  {copy.tradeoffs.map(item => (
                    <span key={item} className="block text-xs text-aether-text-dim">{item}</span>
                  ))}
                </span>
              </span>
              {warnings.length > 0 && (
                <span className="mt-3 block rounded-md border border-aether-amber/20 bg-aether-amber/5 p-2">
                  {warnings.slice(0, 3).map(item => (
                    <span key={item} className="flex items-start gap-1.5 text-xs text-aether-amber">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      {item}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected === 'gitlawb' && (
        <div>
          <label className="block text-xs font-medium text-aether-text-dim mb-1.5">Public GitLawb node URL</label>
          <input
            type="url"
            value={gitlawbNodeUrl}
            onChange={e => onGitlawbNodeUrlChange(e.target.value)}
            placeholder={profiles.find(item => item.provider === 'gitlawb')?.publicNodeUrl || 'https://node.gitlawb.com'}
            className="w-full px-3 py-2 rounded-lg bg-aether-bg border border-aether-border text-aether-text text-sm placeholder:text-aether-text-dim focus:outline-none focus:border-aether-cyan"
          />
        </div>
      )}
    </div>
  );
}

export function WorkspaceStatusPanel({ workspace, jobId, onSnapshotRequested }: { workspace: ContractWorkspace | null; jobId?: string; onSnapshotRequested?: () => void }) {
  const [copyState, setCopyState] = useState('');
  const [snapshotState, setSnapshotState] = useState<{ loading: boolean; message: string; error: string }>({ loading: false, message: '', error: '' });
  const provider = workspace?.provider ? providerLabels[workspace.provider] : 'Not selected';
  const status = workspace?.status || 'NOT_STARTED';
  const verification = workspace?.verificationStatus || workspace?.verificationState || 'NOT_STARTED';
  const repoUrl = usableWorkspaceUrl(workspace);
  const prUrl = workspace?.pullRequestUrl || workspace?.prUrl;
  const branch = workspace?.branch || workspace?.branchRef;
  const commit = workspace?.commitSha || workspace?.commitHash;
  const identity = workspace?.providerIdentity || workspace?.providerUser || workspace?.providerOrg || workspace?.actorDid || workspace?.signerDid;
  const snapshot = normalizeSnapshot(workspace);
  const latestVerification = workspace?.verificationResults?.[0];
  const checklist = useMemo(() => buildVerificationChecklist(workspace), [workspace]);
  const provenance = workspace ? evidenceProvenance(workspace) : null;

  async function copy(value: string, label: string) {
    await navigator.clipboard?.writeText(value);
    setCopyState(`${label} copied`);
    setTimeout(() => setCopyState(''), 1800);
  }

  async function requestSnapshot() {
    if (!workspace || !jobId) return;
    setSnapshotState({ loading: true, message: '', error: '' });
    try {
      const canRequestFinal = ['PASSED', 'VERIFIED'].includes(String(verification).toUpperCase()) && latestVerification?.id;
      const created = await requestWorkspaceEvidenceSnapshot(jobId, {
        snapshotType: canRequestFinal ? 'final' : 'interim',
        ...(canRequestFinal ? { verificationResultId: latestVerification.id } : {}),
        evidence: { requestedFrom: 'job-detail-workspace-panel' },
      });
      setSnapshotState({ loading: false, message: `Snapshot ${created.evidenceHash.slice(0, 12)} recorded`, error: '' });
      onSnapshotRequested?.();
    } catch (error: unknown) {
      setSnapshotState({ loading: false, message: '', error: errorMessage(error, 'Snapshot request failed') });
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-aether-text-bright">Workspace</h2>
          <p className="text-xs text-aether-text-dim mt-1">Repo evidence never completes a paid job without AAE approval and settlement checks.</p>
        </div>
        <StatusPill value={verification} />
      </div>

      <dl className="space-y-3 text-sm">
        <Row label="Provider" value={provider} />
        <Row label="Status" value={formatLabel(status)} />
        {identity && <Row label="Identity" value={shorten(identity)} mono />}
        {workspace?.nodeUrl && <Row label="Node" value={workspace.nodeUrl} mono />}
        {workspace?.repoDid && <Row label="Repo DID" value={shorten(workspace.repoDid)} mono />}
        {repoUrl && <LinkRow label="Repo" href={repoUrl} value={repoUrl.startsWith('gitlawb://') ? repoUrl : 'Open repository'} />}
        {branch && <Row label="Branch" value={branch} mono />}
        {(workspace?.pullRequestNumber || workspace?.prNumber || workspace?.pullRequestRef) && (
          <Row
            label="PR"
            value={workspace.pullRequestRef || `#${workspace.pullRequestNumber || workspace.prNumber}`}
            mono={!workspace.pullRequestNumber && !workspace.prNumber}
          />
        )}
        {prUrl && <LinkRow label="PR Link" href={prUrl} value="Open pull request" />}
        {commit && <Row label="Commit" value={shorten(commit)} mono />}
        {workspace?.treeCid && <Row label="Tree CID" value={shorten(workspace.treeCid)} mono />}
        {workspace?.refCertificateCid && <Row label="Ref cert" value={shorten(workspace.refCertificateCid)} mono />}
        {workspace?.ucanDelegationRef && <Row label="Delegation" value={shorten(workspace.ucanDelegationRef)} mono />}
        {workspace?.reviewStatus && <Row label="Review" value={formatLabel(workspace.reviewStatus)} />}
        {workspace?.ciStatus && <Row label="CI" value={formatLabel(workspace.ciStatus)} />}
        {workspace?.verificationSummary && <Row label="Verification" value={workspace.verificationSummary} />}
        {!repoUrl && workspace?.provider === 'github' && (
          <Row label="Repo" value="No live GitHub repository was created" />
        )}
        {snapshot && (
          snapshot.href
            ? <LinkRow label="Snapshot" href={snapshot.href} value={snapshot.label} />
            : <Row label="Snapshot" value={snapshot.label} mono />
        )}
      </dl>

      {workspace && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {repoUrl && repoUrl.startsWith('http') && (
              <a href={repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-aether-border px-3 py-2 text-xs text-aether-cyan hover:border-aether-cyan">
                <ExternalLink className="w-3.5 h-3.5" />
                Open Repo
              </a>
            )}
            {prUrl && (
              <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-aether-border px-3 py-2 text-xs text-aether-cyan hover:border-aether-cyan">
                <GitPullRequest className="w-3.5 h-3.5" />
                Open PR
              </a>
            )}
            {repoUrl && repoUrl.startsWith('gitlawb://') && (
              <button type="button" onClick={() => copy(repoUrl, 'Clone URL')} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-aether-border px-3 py-2 text-xs text-aether-cyan hover:border-aether-cyan">
                <Copy className="w-3.5 h-3.5" />
                Copy Clone
              </button>
            )}
            <button type="button" disabled={!jobId || snapshotState.loading} onClick={requestSnapshot} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-aether-border px-3 py-2 text-xs text-aether-cyan hover:border-aether-cyan disabled:opacity-50">
              {snapshotState.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
              Snapshot
            </button>
          </div>
          {(copyState || snapshotState.message || snapshotState.error) && (
            <p className={clsx('text-xs', snapshotState.error ? 'text-aether-red' : 'text-aether-green')}>
              {snapshotState.error || snapshotState.message || copyState}
            </p>
          )}
          {provenance && (
            <div className={clsx('rounded-lg border p-3 text-xs leading-relaxed', provenance.signed ? 'border-aether-green/20 bg-aether-green/5 text-aether-green' : 'border-aether-amber/20 bg-aether-amber/5 text-aether-amber')}>
              {provenance.label}
            </div>
          )}
          <ReadinessWarnings workspace={workspace} />
          <VerificationChecklist items={checklist} />
        </div>
      )}

      {!workspace && (
        <div className="mt-4 rounded-lg border border-aether-border bg-aether-surface-2 p-3 text-xs text-aether-text-dim flex items-start gap-2">
          <Info className="w-4 h-4 text-aether-cyan shrink-0 mt-0.5" />
          Choose a provider when accepting a bid to bind a temporary shared repo to this contract.
        </div>
      )}
    </Card>
  );
}

function ReadinessWarnings({ workspace }: { workspace: ContractWorkspace }) {
  const readiness = workspace.readiness || {};
  const warnings = [
    !readiness.credentialsReady && 'Provider credentials are not ready.',
    !readiness.delegationReady && workspace.provider === 'gitlawb' && 'GitLawb delegation is not ready.',
    !readiness.nodeReady && workspace.provider === 'gitlawb' && 'GitLawb node availability is not ready.',
    !readiness.webhookReady && 'Signed webhook ingestion is not ready.',
    !readiness.verificationReady && 'Provider verification is not ready.',
    workspace.provisioning?.lastError,
  ].filter(Boolean) as string[];
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-aether-amber/20 bg-aether-amber/5 p-3 space-y-1">
      {warnings.map(item => (
        <div key={item} className="flex items-start gap-2 text-xs text-aether-amber">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function VerificationChecklist({ items }: { items: Array<{ label: string; ok: boolean }> }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-aether-border bg-aether-surface-2 p-3">
      <p className="text-xs font-medium text-aether-text mb-2">Verification</p>
      <div className="grid grid-cols-1 gap-1.5">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            {item.ok ? <CheckCircle className="w-3.5 h-3.5 text-aether-green" /> : <Clock className="w-3.5 h-3.5 text-aether-text-dim" />}
            <span className={item.ok ? 'text-aether-text' : 'text-aether-text-dim'}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildVerificationChecklist(workspace: ContractWorkspace | null): Array<{ label: string; ok: boolean }> {
  if (!workspace) return [];
  const commit = Boolean(workspace.commitSha || workspace.commitHash);
  const branch = Boolean(workspace.branch || workspace.branchRef);
  const pr = Boolean(workspace.pullRequestRef || workspace.pullRequestNumber || workspace.prNumber);
  const latest = workspace.verificationResults?.[0];
  const checks = latest?.checks || [];
  const paths = latest?.deliverablePaths || [];
  if (workspace.provider === 'github') {
    return [
      { label: 'Repo owner/name bound', ok: Boolean(workspace.repoUrl || workspace.repositoryUrl) },
      { label: 'Workspace branch recorded', ok: branch },
      { label: 'PR target/reference recorded', ok: pr },
      { label: 'Commit SHA recorded', ok: commit },
      { label: 'Review approved', ok: Boolean(workspace.reviewStatus?.toLowerCase().includes('approved') || checks.some(check => /review/i.test(check.name) && ['passed', 'success'].includes(check.status))) },
      { label: 'CI/checks passed', ok: Boolean(workspace.ciStatus === 'success' || checks.some(check => /(ci|check|test)/i.test(check.name) && ['passed', 'success'].includes(check.status))) },
      { label: 'Submitted paths recorded', ok: paths.length > 0 },
    ];
  }
  return [
    { label: 'Signer DID bound', ok: Boolean(workspace.actorDid || workspace.signerDid) },
    { label: 'UCAN delegation scoped', ok: Boolean(workspace.ucanDelegationRef) },
    { label: 'Public node recorded', ok: Boolean(workspace.nodeUrl) },
    { label: 'Repo DID recorded', ok: Boolean(workspace.repoDid) },
    { label: 'Branch/PR refs recorded', ok: branch && pr },
    { label: 'Commit or tree CID recorded', ok: commit || Boolean(workspace.treeCid) },
    { label: 'Ref certificate recorded', ok: Boolean(workspace.refCertificateCid) },
    { label: 'Submitted paths recorded', ok: paths.length > 0 },
  ];
}

function evidenceProvenance(workspace: ContractWorkspace): { signed: boolean; label: string } {
  const signedEvent = workspace.events?.some(event => event.signatureVerified && event.replayProtected);
  if (signedEvent) {
    return { signed: true, label: 'Signed provider webhook evidence is present. AAE still controls approval, dispute, and payment gates.' };
  }
  return {
    signed: false,
    label: 'Workspace evidence is metadata or participant-submitted until signed provider webhook evidence is present. Verification supports review; it is not payment authority.',
  };
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const style = verificationStyles[normalized] || 'text-aether-text-dim bg-aether-surface-2';
  const Icon = normalized === 'VERIFIED' || normalized === 'PASSED'
    ? CheckCircle
    : normalized === 'FAILED' || normalized === 'REJECTED'
      ? AlertTriangle
      : Clock;

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', style)}>
      <Icon className="w-3 h-3" />
      {formatLabel(value)}
    </span>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-aether-text-dim">{label}</dt>
      <dd className={clsx('text-aether-text text-right break-all', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

function LinkRow({ label, href, value }: { label: string; href: string; value: string }) {
  const external = href.startsWith('http://') || href.startsWith('https://');
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-aether-text-dim">{label}</dt>
      <dd className="text-right break-all">
        {external ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-aether-cyan hover:underline">
            {value}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-aether-text font-mono text-xs">
            <Hash className="w-3 h-3 text-aether-text-dim" />
            {href}
          </span>
        )}
      </dd>
    </div>
  );
}

function normalizeSnapshot(workspace: ContractWorkspace | null): { label: string; href?: string } | null {
  if (!workspace) return null;
  const snapshot = workspace.finalSnapshot;
  if (typeof snapshot === 'string' && snapshot.trim()) {
    return { label: shorten(snapshot) };
  }
  if (snapshot && typeof snapshot === 'object') {
    const href = snapshot.url;
    const ref = snapshot.ref || snapshot.commitSha || snapshot.commitHash || snapshot.treeCid || snapshot.refCertificateCid;
    return ref || href ? { label: ref ? shorten(ref) : 'Open snapshot', href } : null;
  }
  if (workspace.finalSnapshotUrl) return { label: 'Open snapshot', href: workspace.finalSnapshotUrl };
  if (workspace.finalSnapshotRef) return { label: shorten(workspace.finalSnapshotRef) };
  return null;
}

function formatGitLawbNodeSummary(profile?: WorkspaceProviderProfile): string {
  if (!profile?.nodeReachabilityConfigured) return '';
  const metadata = profile.nodeMetadata;
  const nodeName = metadata?.name;
  const network = metadata?.network ? `network ${metadata.network}` : '';
  const version = metadata?.version
    ? metadata.version.toLowerCase().startsWith('v') ? metadata.version : `v${metadata.version}`
    : '';
  const protocols = metadata?.protocols?.length ? metadata.protocols.slice(0, 3).join(', ') : '';
  const pieces = [nodeName, network, version, protocols].filter(Boolean);
  if (pieces.length > 0) return `Public node: ${pieces.join(' / ')}`;
  try {
    return profile.publicNodeUrl ? `Public node: ${new URL(profile.publicNodeUrl).hostname}` : '';
  } catch {
    return profile.publicNodeUrl ? 'Public node reachable' : '';
  }
}

function shorten(value: string) {
  if (value.length <= 28) return value;
  return `${value.slice(0, 12)}...${value.slice(-10)}`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function usableWorkspaceUrl(workspace: ContractWorkspace | null) {
  if (!workspace) return '';
  const liveMode = workspace.liveMode ?? workspace.provisioning?.liveMode;
  if (workspace.provider === 'github' && !liveMode) return '';
  if (workspace.provider === 'gitlawb' && !liveMode) return '';
  return workspace.repoUrl || workspace.repositoryUrl || workspace.cloneUrl || workspace.gitlawbCloneUrl || '';
}
