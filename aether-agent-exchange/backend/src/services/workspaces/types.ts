export type WorkspaceProvider = 'github' | 'gitlawb';
export type WorkspaceProviderName = WorkspaceProvider;

export type WorkspaceStatus =
  | 'provisioning'
  | 'active'
  | 'linked'
  | 'access_revoked'
  | 'evidence_snapshot'
  | 'archived'
  | 'error';

export type WorkspaceVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'rejected'
  | 'needs_review'
  | 'VERIFIED'
  | 'FAILED'
  | 'PASSED'
  | 'PENDING';

export type WorkspaceEvidenceKind =
  | 'repository'
  | 'branch'
  | 'pull_request'
  | 'commit'
  | 'review'
  | 'ci'
  | 'access'
  | 'snapshot';

export type WorkspaceParticipantRole = 'client' | 'agent' | 'reviewer' | 'arbiter' | 'observer';

export interface WorkspaceJobRef {
  id: string;
  title: string;
  description?: string | null;
  clientId: string;
  agentId?: string | null;
  deliverables?: string[];
  acceptanceCriteria?: string | null;
}

export interface WorkspaceJobContext extends WorkspaceJobRef {
  acceptedAt?: Date | string | null;
}

export interface WorkspaceParticipant {
  userId?: string;
  providerIdentity?: string;
  role: WorkspaceParticipantRole;
  walletAddress?: string;
  did?: string;
  displayName?: string;
  permissions?: string[];
}

export interface WorkspaceRepositoryRef {
  provider: WorkspaceProvider;
  repoUrl: string;
  cloneUrl?: string;
  owner?: string;
  name?: string;
  fullName?: string;
  defaultBranch?: string;
  providerIdentity?: string;
  externalId?: string;
  visibility?: 'private' | 'public' | 'internal';
}

export interface WorkspacePullRequestRef {
  number: number;
  url?: string;
  title?: string;
  state?: 'open' | 'closed' | 'merged' | string;
  headBranch?: string;
  baseBranch?: string;
  headSha?: string;
}

export interface WorkspaceEvidence {
  id?: string;
  kind: WorkspaceEvidenceKind;
  ref: string;
  url?: string;
  sha?: string;
  branch?: string;
  status?: string;
  actor?: string;
  observedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceEvidenceSnapshot {
  provider: WorkspaceProvider;
  workspaceId: string;
  jobId: string;
  repository: WorkspaceRepositoryRef;
  branch?: string;
  pullRequest?: WorkspacePullRequestRef;
  latestCommitSha?: string;
  reviewStatus?: string;
  ciStatus?: string;
  evidence: WorkspaceEvidence[];
  capturedAt: Date | string;
  repo?: Record<string, unknown>;
  latestSubmission?: Record<string, unknown>;
  verification?: WorkspaceVerificationResult;
  events?: WorkspaceIngestResult[];
  metadata?: Record<string, unknown>;
}

export interface WorkspaceRecord {
  id?: string;
  provider: WorkspaceProvider;
  jobId: string;
  status?: WorkspaceStatus | string;
  repository?: WorkspaceRepositoryRef;
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  providerIdentity?: string;
  nodeUrl?: string;
  repoDid?: string;
  cloneUrl?: string;
  defaultBranch?: string;
  workBranch?: string;
  branchRef?: string;
  prRef?: string;
  prNumber?: number;
  commitSha?: string;
  treeCid?: string;
  refCertificateCid?: string;
  branch?: string;
  pullRequest?: WorkspacePullRequestRef;
  participants?: WorkspaceParticipant[];
  latestCommitSha?: string;
  reviewStatus?: string;
  ciStatus?: string;
  verificationStatus?: WorkspaceVerificationStatus;
  finalSnapshot?: WorkspaceEvidenceSnapshot;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkspaceExternalRef {
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  providerIdentity?: string;
  nodeUrl?: string;
  repoDid?: string;
  cloneUrl?: string;
  defaultBranch?: string;
  branchRef?: string;
  prRef?: string;
  prNumber?: number;
  commitSha?: string;
  treeCid?: string;
  refCertificateCid?: string;
}

export interface WorkspaceDelegationReference {
  id: string;
  issuerDid: string;
  audienceDid: string;
  capabilities: string[];
  resource: string;
  scope: Record<string, unknown>;
  issuedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  proofHash?: string;
  referenceUri?: string;
}

export interface WorkspaceAccessGrant {
  participant: WorkspaceParticipant;
  branch: string;
  targetBranch?: string;
  capabilities: string[];
  delegationRef?: WorkspaceDelegationReference;
}

export interface CreateWorkspaceRequest {
  owner: string;
  name?: string;
  visibility?: 'private' | 'public' | 'internal';
  defaultBranch?: string;
  jobBranch?: string;
  participants?: WorkspaceParticipant[];
  providerIdentity?: string;
  templateRepository?: {
    owner: string;
    name: string;
  };
}

export interface LinkWorkspaceRequest {
  repoUrl: string;
  owner?: string;
  name?: string;
  defaultBranch?: string;
  jobBranch?: string;
  providerIdentity?: string;
  pullRequest?: WorkspacePullRequestRef;
  participants?: WorkspaceParticipant[];
}

export interface WorkspaceAccessRequest {
  workspaceId: string;
  participant: WorkspaceParticipant;
}

export interface WorkspaceExternalEvent {
  provider: WorkspaceProvider;
  workspaceId?: string;
  jobId?: string;
  eventType: string;
  externalId: string;
  receivedAt?: Date;
  headers?: Record<string, string | string[] | undefined>;
  payload: unknown;
}

export interface WorkspaceProviderEvent {
  provider: WorkspaceProvider;
  jobId?: string;
  nodeUrl?: string;
  repoDid?: string;
  eventId?: string;
  eventType: string;
  occurredAt?: string;
  actorDid?: string;
  payload: Record<string, unknown>;
}

export interface WorkspaceIngestResult {
  provider: WorkspaceProvider;
  eventId: string;
  idempotencyKey: string;
  eventType: string;
  occurredAt: string;
  actorDid?: string;
  normalizedEvidence: Record<string, unknown>;
  completesJob: false;
}

export interface WorkspaceEventRecord {
  id: string;
  dedupeKey: string;
  provider: WorkspaceProvider;
  workspaceId?: string;
  jobId?: string;
  eventType: string;
  externalId: string;
  receivedAt: Date;
  payload: Record<string, unknown>;
  accepted: boolean;
  evidence?: WorkspaceEvidence[];
}

export interface WorkspaceEventIngestResult {
  accepted: boolean;
  duplicate: boolean;
  event: WorkspaceEventRecord;
  workspace?: WorkspaceRecord;
  evidence: WorkspaceEvidence[];
}

export interface WorkspaceVerificationCheck {
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped' | 'pass' | 'fail' | 'pending';
  message?: string;
  details?: Record<string, unknown>;
}

export interface WorkspaceSubmissionRef {
  repoDid?: string;
  prRef?: string;
  prNumber?: number;
  commitHash?: string;
  commitSha?: string;
  treeCid?: string;
  refCertificateCid?: string;
  signerDid?: string;
  branch?: string;
  targetBranch?: string;
  pullRequestNumber?: number;
  deliverablePaths: string[];
}

export interface WorkspaceVerificationResult {
  provider: WorkspaceProvider;
  workspaceId?: string;
  jobId: string;
  status: WorkspaceVerificationStatus;
  verified?: boolean;
  checkedAt: Date | string;
  checks: WorkspaceVerificationCheck[];
  evidence: WorkspaceEvidence[] | Record<string, unknown>;
}

export interface WorkspaceVerificationExpectation {
  signerDids: string[];
  delegationAudienceDid?: string;
  allowedSourceBranch?: string;
  targetBranch: string;
  requiredDeliverablePaths: string[];
  now?: Date;
}

export interface WorkspaceCapabilityCheck {
  name: string;
  supported: boolean;
  reason?: string;
}

export interface WorkspaceProviderCapabilities {
  provider: WorkspaceProvider;
  checks: WorkspaceCapabilityCheck[];
}

export interface WorkspaceProviderAdapter {
  readonly provider: WorkspaceProvider;
  checkCapabilities?(...args: any[]): Promise<WorkspaceProviderCapabilities>;
  createWorkspace(...args: any[]): Promise<WorkspaceRecord>;
  linkWorkspace(...args: any[]): Promise<WorkspaceRecord>;
  grantAccess(...args: any[]): Promise<WorkspaceAccessGrant | WorkspaceRecord>;
  revokeAccess(...args: any[]): Promise<void | WorkspaceRecord>;
  ingestEvent(...args: any[]): Promise<WorkspaceEventIngestResult | WorkspaceIngestResult>;
  verifySubmission(...args: any[]): Promise<WorkspaceVerificationResult>;
  snapshotEvidence(...args: any[]): Promise<WorkspaceEvidenceSnapshot>;
}

export interface WorkspaceStore {
  upsertWorkspace(workspace: WorkspaceRecord): Promise<WorkspaceRecord>;
  updateWorkspace(workspaceId: string, patch: Partial<WorkspaceRecord>): Promise<WorkspaceRecord>;
  getWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null>;
  getWorkspaceByJob(provider: WorkspaceProvider, jobId: string): Promise<WorkspaceRecord | null>;
  getWorkspaceByRepo(provider: WorkspaceProvider, owner: string, name: string): Promise<WorkspaceRecord | null>;
  appendEventIfNew(event: WorkspaceEventRecord): Promise<{ event: WorkspaceEventRecord; duplicate: boolean }>;
  listEvents(workspaceId: string): Promise<WorkspaceEventRecord[]>;
  addEvidence(workspaceId: string, evidence: WorkspaceEvidence[]): Promise<WorkspaceEvidence[]>;
  listEvidence(workspaceId: string): Promise<WorkspaceEvidence[]>;
}
