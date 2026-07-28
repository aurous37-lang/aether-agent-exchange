import crypto from 'crypto';
import { execFile } from 'child_process';
import dns from 'dns/promises';
import { mkdir } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { WorkspaceProvider, WorkspaceProviderAdapter } from './types';

const DEFAULT_GITLAWB_PUBLIC_NODE_URL = 'https://node.gitlawb.com';
const GITHUB_API = process.env.GITHUB_API_BASE || 'https://api.github.com';
const NODE_HEALTH_CACHE_MS = 60_000;
const execFileAsync = promisify(execFile);

export interface WorkspaceProviderProfile {
  provider: WorkspaceProvider;
  label: string;
  summary: string;
  tradeoffs: string;
  liveEnabled: boolean;
  liveCredentialsConfigured: boolean;
  webhookSignatureConfigured: boolean;
  nodeReachabilityConfigured: boolean;
  delegationConfigured: boolean;
  verificationConfigured: boolean;
  warnings: string[];
  publicNodeUrl?: string;
  nodeMetadata?: GitLawbPublicNodeMetadata;
  nodeReachabilityError?: string;
}

export interface GitLawbPublicNodeMetadata {
  name?: string;
  network?: string;
  version?: string;
  protocols?: string[];
  did?: string;
  p2pPeerId?: string;
  auth?: string;
  identity?: string;
}

type NodeHealth = {
  ok: boolean;
  checkedAt: string;
  metadata?: GitLawbPublicNodeMetadata;
  error?: string;
};

const nodeHealthCache = new Map<string, { expiresAt: number; result: NodeHealth }>();

export interface WorkspaceProvisionInput {
  jobId: string;
  title: string;
  provider: WorkspaceProvider;
  mode: 'create' | 'link';
  repoOwner?: string;
  repoName?: string;
  repoUrl?: string;
  defaultBranch?: string;
  branchRef?: string;
  prRef?: string;
  prNumber?: number;
  cloneUrl?: string;
  nodeUrl?: string;
  repoDid?: string;
  actorDids?: string[];
  ucanDelegationRefs?: unknown[];
  providerIdentity?: string;
  participants?: Array<{ login?: string; permission?: string; did?: string; role?: string }>;
}

export interface WorkspaceProvisionResult {
  status: 'READY' | 'FAILED';
  liveMode: boolean;
  providerWorkspaceId?: string;
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  cloneUrl?: string;
  nodeUrl?: string;
  repoDid?: string;
  defaultBranch?: string;
  branchRef?: string;
  prRef?: string;
  prNumber?: number;
  actorDids?: string[];
  ucanDelegationRefs?: unknown[];
  capabilitySummary?: string;
  readiness: {
    credentialsReady: boolean;
    delegationReady: boolean;
    nodeReady: boolean;
    webhookReady: boolean;
    verificationReady: boolean;
  };
  warnings: string[];
}

function envFlag(name: string): boolean {
  return process.env[name] === 'true';
}

function gitlawbConfigFile(): string {
  return process.env.GITLAWB_CONFIG_FILE || path.join(gitlawbRuntimeDir(), 'config.env');
}

function readGitLawbConfig(): Record<string, string> {
  try {
    return readFileSync(gitlawbConfigFile(), 'utf8')
      .split(/\r?\n/)
      .reduce<Record<string, string>>((config, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return config;
        const separator = trimmed.indexOf('=');
        if (separator <= 0) return config;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        if (/^[A-Z0-9_]+$/.test(key)) config[key] = value;
        return config;
      }, {});
  } catch {
    return {};
  }
}

function gitlawbConfigValue(name: string): string | undefined {
  const envValue = process.env[name]?.trim();
  if (envValue) return envValue;
  const fileValue = readGitLawbConfig()[name]?.trim();
  return fileValue || undefined;
}

function gitlawbConfigFlag(name: string): boolean {
  return gitlawbConfigValue(name) === 'true';
}

export function isLiveWorkspaceEnabled(provider: WorkspaceProvider): boolean {
  if (provider === 'gitlawb') return gitlawbConfigFlag('AAE_ENABLE_LIVE_GITLAWB_WORKSPACES');
  return provider === 'github'
    ? envFlag('AAE_ENABLE_LIVE_GITHUB_WORKSPACES')
    : false;
}

function gitlawbNodeUrl(input?: { nodeUrl?: string }): string {
  return input?.nodeUrl || gitlawbConfigValue('GITLAWB_PUBLIC_NODE_URL') || DEFAULT_GITLAWB_PUBLIC_NODE_URL;
}

function redactedRef(prefix: string, value: unknown): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(value ?? '')).digest('hex').slice(0, 16);
  return `${prefix}:${hash}`;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function slugPart(value: string, maxLength = 48): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'workspace';
}

function gitlawbRepoName(input: WorkspaceProvisionInput): string {
  return input.repoName || `aae-${input.jobId.slice(0, 8)}-${slugPart(input.title, 32)}`;
}

function gitlawbRuntimeDir(): string {
  return process.env.GITLAWB_RUNTIME_DIR || process.env.GITLAWB_IDENTITY_DIR || path.join(process.cwd(), '.gitlawb-aae-live');
}

function gitlawbIdentityDir(): string {
  return gitlawbConfigValue('GITLAWB_IDENTITY_DIR') || gitlawbRuntimeDir();
}

function gitlawbWebhookSecretFile(): string {
  return gitlawbConfigValue('GITLAWB_WEBHOOK_SECRET_FILE') || path.join(gitlawbRuntimeDir(), 'webhook-secret');
}

export function getGitLawbWebhookSecret(): string | undefined {
  const configuredSecret = gitlawbConfigValue('GITLAWB_WEBHOOK_SECRET');
  if (configuredSecret) return configuredSecret;
  try {
    const value = readFileSync(gitlawbWebhookSecretFile(), 'utf8').trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function gitlawbPublicWebhookBaseUrl(): string | undefined {
  return gitlawbConfigValue('AAE_PUBLIC_WEBHOOK_BASE_URL') || (isLiveWorkspaceEnabled('gitlawb') ? 'https://aethermarket.xyz' : undefined);
}

function gitlawbCliBin(): string {
  return gitlawbConfigValue('GITLAWB_CLI_BIN') || path.join(process.cwd(), 'node_modules', '.bin', 'gl');
}

function redactCliOutput(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/secret[=:]\s*\S+/gi, 'secret=[redacted]')
    .trim()
    .slice(0, 800);
}

async function runGitlawbCli(args: string[], options: { nodeUrl?: string; timeoutMs?: number } = {}): Promise<string> {
  try {
    const result = await execFileAsync(gitlawbCliBin(), args, {
      timeout: options.timeoutMs || 20_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        ...(options.nodeUrl ? { GITLAWB_NODE: options.nodeUrl } : {}),
      },
    });
    return `${result.stdout || ''}${result.stderr || ''}`.trim();
  } catch (error: any) {
    const output = redactCliOutput(`${error?.stdout || ''}\n${error?.stderr || ''}`);
    const message = output || error?.message || 'GitLawb CLI command failed';
    throw Object.assign(new Error(message), { statusCode: 502 });
  }
}

async function ensureGitlawbIdentity(identityDir: string): Promise<string | undefined> {
  await mkdir(identityDir, { recursive: true, mode: 0o700 });
  try {
    return (await runGitlawbCli(['identity', 'show', '--dir', identityDir])).trim() || undefined;
  } catch {
    await runGitlawbCli(['identity', 'new', '--dir', identityDir]);
    return (await runGitlawbCli(['identity', 'show', '--dir', identityDir])).trim() || undefined;
  }
}

function boundedString(value: unknown, maxLength = 200): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function boundedStringArray(value: unknown, maxItems = 12, maxLength = 80): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map(item => boundedString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return items.length ? items : undefined;
}

function sanitizeGitLawbNodeMetadata(value: unknown): GitLawbPublicNodeMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const metadata: GitLawbPublicNodeMetadata = {
    name: boundedString(data.name, 80),
    network: boundedString(data.network, 80),
    version: boundedString(data.version, 80),
    protocols: boundedStringArray(data.protocols),
    did: boundedString(data.did),
    p2pPeerId: boundedString(data.p2p_peer_id || data.p2pPeerId),
    auth: boundedString(data.auth, 120),
    identity: boundedString(data.identity, 120),
  };
  return Object.values(metadata).some(Boolean) ? metadata : undefined;
}

async function checkPublicNodeReachability(nodeUrl: string): Promise<NodeHealth> {
  const cached = nodeHealthCache.get(nodeUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.result;

  const checkedAt = new Date().toISOString();
  try {
    const parsed = new URL(nodeUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('GitLawb public node URL must use https');
    }

    await dns.lookup(parsed.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    let metadata: GitLawbPublicNodeMetadata | undefined;
    try {
      const response = await fetch(nodeUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.status >= 500) {
        throw new Error(`GitLawb public node returned HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        metadata = sanitizeGitLawbNodeMetadata(data);
      }
    } finally {
      clearTimeout(timeout);
    }

    const result = { ok: true, checkedAt, metadata };
    nodeHealthCache.set(nodeUrl, { expiresAt: now + NODE_HEALTH_CACHE_MS, result });
    return result;
  } catch (error: any) {
    const result = {
      ok: false,
      checkedAt,
      error: error?.name === 'AbortError' ? 'GitLawb public node health check timed out' : error?.message || 'GitLawb public node is not reachable',
    };
    nodeHealthCache.set(nodeUrl, { expiresAt: now + NODE_HEALTH_CACHE_MS, result });
    return result;
  }
}

async function requestJson(url: string, init: RequestInit, provider: WorkspaceProvider): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = typeof data?.message === 'string' ? data.message : `${provider} request failed with ${res.status}`;
    const rateLimitReset = res.headers.get('x-ratelimit-reset');
    throw Object.assign(new Error(message), {
      statusCode: res.status,
      rateLimitReset,
      provider,
    });
  }
  return data;
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw Object.assign(new Error('GITHUB_TOKEN is required for live GitHub workspaces'), { statusCode: 503 });
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': process.env.GITHUB_API_VERSION || '2022-11-28',
  };
}

async function githubRequest(path: string, init: RequestInit = {}): Promise<any> {
  return requestJson(`${withoutTrailingSlash(GITHUB_API)}${path}`, {
    ...init,
    headers: { ...githubHeaders(), ...(init.headers || {}) },
  }, 'github');
}

function parseGitHubUrl(url?: string): { owner?: string; name?: string } {
  if (!url) return {};
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  return match ? { owner: match[1], name: match[2].replace(/\.git$/, '') } : {};
}

function isPlaceholderGitHubOwner(owner?: string): boolean {
  return !owner || owner === 'aae-local';
}

async function getGitHubAuthenticatedOwner(): Promise<string | undefined> {
  const user = await githubRequest('/user', { method: 'GET' });
  return typeof user?.login === 'string' && user.login.trim() ? user.login.trim() : undefined;
}

function githubRepoMatchesInvitation(invitation: any, owner: string, name: string): boolean {
  const repo = invitation?.repository;
  const fullName = typeof repo?.full_name === 'string' ? repo.full_name.toLowerCase() : '';
  return fullName === `${owner}/${name}`.toLowerCase() ||
    (
      typeof repo?.owner?.login === 'string' &&
      typeof repo?.name === 'string' &&
      repo.owner.login.toLowerCase() === owner.toLowerCase() &&
      repo.name.toLowerCase() === name.toLowerCase()
    );
}

async function acceptGitHubRepositoryInvitation(owner: string, name: string): Promise<boolean> {
  const invitations = await githubRequest('/user/repository_invitations?per_page=100', { method: 'GET' });
  const invitation = Array.isArray(invitations)
    ? invitations.find(item => githubRepoMatchesInvitation(item, owner, name))
    : undefined;
  if (!invitation?.id) return false;

  await githubRequest(`/user/repository_invitations/${encodeURIComponent(String(invitation.id))}`, { method: 'PATCH' });
  return true;
}

async function setupGitHubWebhook(owner: string, name: string, warnings: string[]): Promise<boolean> {
  if (!process.env.AAE_PUBLIC_WEBHOOK_BASE_URL || !process.env.GITHUB_WEBHOOK_SECRET) {
    warnings.push('GitHub webhook signature secret or public webhook URL is not configured.');
    return false;
  }

  try {
    await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/hooks`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request', 'pull_request_review', 'check_suite', 'workflow_run'],
        config: {
          url: `${withoutTrailingSlash(process.env.AAE_PUBLIC_WEBHOOK_BASE_URL)}/api/workspaces/webhooks/github`,
          content_type: 'json',
          secret: process.env.GITHUB_WEBHOOK_SECRET,
          insecure_ssl: '0',
        },
      }),
    });
    return true;
  } catch (error: any) {
    warnings.push(`GitHub webhook setup deferred: ${error.message}`);
    return false;
  }
}

async function provisionGitHub(input: WorkspaceProvisionInput): Promise<WorkspaceProvisionResult> {
  const liveMode = isLiveWorkspaceEnabled('github');
  const parsed = parseGitHubUrl(input.repoUrl);
  const requestedOwner = input.repoOwner || parsed.owner || process.env.GITHUB_OWNER;
  const owner = liveMode && isPlaceholderGitHubOwner(requestedOwner)
    ? (await getGitHubAuthenticatedOwner()) || 'aae-local'
    : requestedOwner || 'aae-local';
  const name = input.repoName || parsed.name || `aae-job-${input.jobId.slice(0, 8)}`;
  const defaultBranch = input.defaultBranch || 'main';
  const branchRef = input.branchRef || `aae/job-${input.jobId.slice(0, 8)}`;
  const repoUrl = input.repoUrl || `https://github.com/${owner}/${name}`;
  const warnings: string[] = [];

  if (!liveMode || input.mode === 'link') {
    if (!liveMode) warnings.push('Live GitHub provisioning disabled; no GitHub repository was created.');
    const metadataOnlyCreate = !liveMode && input.mode === 'create';
    let linkedRepo: any;
    let acceptedInvitation = false;
    let webhookReady = Boolean(process.env.GITHUB_WEBHOOK_SECRET && process.env.AAE_PUBLIC_WEBHOOK_BASE_URL);

    if (liveMode && input.mode === 'link') {
      try {
        acceptedInvitation = await acceptGitHubRepositoryInvitation(owner, name);
        if (acceptedInvitation) warnings.push('Accepted pending GitHub repository invitation for the AAE service account.');
      } catch (error: any) {
        warnings.push(`GitHub invitation acceptance deferred: ${error.message}`);
      }

      linkedRepo = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { method: 'GET' });
      webhookReady = await setupGitHubWebhook(
        linkedRepo?.owner?.login || owner,
        linkedRepo?.name || name,
        warnings,
      );
    }

    const actualOwner = linkedRepo?.owner?.login || owner;
    const actualName = linkedRepo?.name || name;
    const actualRepoUrl = linkedRepo?.html_url || repoUrl;

    return {
      status: metadataOnlyCreate ? 'FAILED' : 'READY',
      liveMode,
      providerWorkspaceId: linkedRepo?.full_name || `${actualOwner}/${actualName}`,
      repoOwner: actualOwner,
      repoName: actualName,
      repoUrl: metadataOnlyCreate ? undefined : actualRepoUrl,
      defaultBranch: linkedRepo?.default_branch || defaultBranch,
      branchRef,
      prRef: input.prRef,
      prNumber: input.prNumber,
      capabilitySummary: metadataOnlyCreate
        ? 'GitHub workspace was not created because live GitHub provisioning is disabled.'
        : liveMode
          ? acceptedInvitation
            ? 'GitHub workspace linked after accepting the AAE service account repository invitation.'
            : 'GitHub workspace linked with live credentials.'
          : 'GitHub workspace linked in metadata fixture mode.',
      readiness: {
        credentialsReady: Boolean(process.env.GITHUB_TOKEN),
        delegationReady: true,
        nodeReady: true,
        webhookReady,
        verificationReady: true,
      },
      warnings,
    };
  }

  const tokenOwner = process.env.GITHUB_OWNER || owner;
  const createPath = process.env.GITHUB_OWNER
    ? `/orgs/${encodeURIComponent(tokenOwner)}/repos`
    : '/user/repos';
  let repo: any;
  try {
    repo = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { method: 'GET' });
    warnings.push('GitHub repository already existed; reusing it for this workspace retry.');
  } catch (error: any) {
    if (error?.statusCode !== 404) throw error;
    repo = await githubRequest(createPath, {
      method: 'POST',
      body: JSON.stringify({
        name,
        private: true,
        auto_init: true,
        description: `AAE temporary workspace for job ${input.jobId}: ${input.title}`.slice(0, 350),
      }),
    });
  }

  const actualOwner = repo?.owner?.login || owner;
  const actualName = repo?.name || name;

  for (const participant of input.participants || []) {
    if (!participant.login) continue;
    try {
      await githubRequest(`/repos/${encodeURIComponent(actualOwner)}/${encodeURIComponent(actualName)}/collaborators/${encodeURIComponent(participant.login)}`, {
        method: 'PUT',
        body: JSON.stringify({ permission: participant.permission || 'push' }),
      });
    } catch (error: any) {
      warnings.push(`GitHub collaborator ${participant.login} invitation deferred: ${error.message}`);
    }
  }

  let prRef = input.prRef;
  let prNumber = input.prNumber;
  if (input.prRef || input.prNumber) {
    prRef = input.prRef;
  } else if (process.env.AAE_GITHUB_AUTO_OPEN_PR === 'true') {
    try {
      const pr = await githubRequest(`/repos/${encodeURIComponent(actualOwner)}/${encodeURIComponent(actualName)}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
          title: `AAE job ${input.jobId.slice(0, 8)} deliverables`,
          head: branchRef,
          base: defaultBranch,
          body: 'Temporary AAE contract workspace PR. Completion remains gated by AAE approval and settlement.',
          draft: true,
        }),
      });
      prRef = pr.html_url;
      prNumber = pr.number;
    } catch (error: any) {
      warnings.push(`GitHub PR creation deferred: ${error.message}`);
    }
  }

  const webhookReady = await setupGitHubWebhook(actualOwner, actualName, warnings);

  return {
    status: 'READY',
    liveMode: true,
    providerWorkspaceId: repo.full_name || `${actualOwner}/${actualName}`,
    repoOwner: actualOwner,
    repoName: actualName,
    repoUrl: repo.html_url || repoUrl,
    defaultBranch: repo.default_branch || defaultBranch,
    branchRef,
    prRef,
    prNumber,
    capabilitySummary: 'GitHub live workspace provisioned: private repo, collaborator invitations, and webhook setup attempted.',
    readiness: {
      credentialsReady: true,
      delegationReady: true,
      nodeReady: true,
      webhookReady,
      verificationReady: true,
    },
    warnings,
  };
}

function gitlawbApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = gitlawbConfigValue('GITLAWB_NODE_API_TOKEN');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function gitlawbRequest(nodeUrl: string, path: string, body: unknown): Promise<any> {
  return requestJson(`${withoutTrailingSlash(nodeUrl)}${path}`, {
    method: 'POST',
    headers: gitlawbApiHeaders(),
    body: JSON.stringify(body),
  }, 'gitlawb');
}

async function provisionGitLawb(input: WorkspaceProvisionInput): Promise<WorkspaceProvisionResult> {
  const liveMode = isLiveWorkspaceEnabled('gitlawb');
  const nodeUrl = gitlawbNodeUrl(input);
  const repoDid = input.repoDid || `did:gitlawb:aae:${input.jobId}`;
  const cloneUrl = input.cloneUrl || input.repoUrl || `gitlawb://${repoDid}`;
  const defaultBranch = input.defaultBranch || 'main';
  const branchRef = input.branchRef || `aae/job-${input.jobId.slice(0, 8)}`;
  const warnings: string[] = [];

  if (!nodeUrl.startsWith('https://')) {
    throw Object.assign(new Error('GitLawb public node URL must use https'), { statusCode: 400 });
  }

  let providerWorkspaceId = repoDid;
  let delegationRefs = input.ucanDelegationRefs || [];
  let repoName = input.repoName;
  let webhookReady = Boolean(getGitLawbWebhookSecret());

  if (liveMode && input.mode === 'create') {
    const identityDir = gitlawbIdentityDir();
    const operatorDid = await ensureGitlawbIdentity(identityDir);
    repoName = gitlawbRepoName(input);
    await runGitlawbCli([
      'repo',
      'create',
      repoName,
      '--description',
      `AAE job ${input.jobId}: ${input.title}`,
      '--private',
      '--branch',
      defaultBranch,
      '--node',
      nodeUrl,
      '--dir',
      identityDir,
    ], { nodeUrl });
    providerWorkspaceId = repoName;

    if (input.actorDids?.length) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const delegationScope = [`gitlawb://repos/${repoName}`, `branch:${branchRef}`, 'git/push', 'pr/open'];
      const delegationOutputs = await Promise.all(input.actorDids.map(async (actorDid) => {
        const output = await runGitlawbCli([
          'ucan',
          'delegate',
          '--to',
          actorDid,
          '--cap',
          `gitlawb://repos/${repoName}`,
          '--can',
          'git/push,pr/open',
          '--expiry',
          '168',
          '--json',
          '--dir',
          identityDir,
        ], { nodeUrl });
        return {
          ref: redactedRef('ucan', output),
          audienceDid: actorDid,
          scope: delegationScope,
          expiresAt,
        };
      }));
      delegationRefs = delegationOutputs;
    } else {
      warnings.push('GitLawb live delegation skipped because no actor DID was supplied.');
    }

    const webhookSecret = getGitLawbWebhookSecret();
    const webhookBaseUrl = gitlawbPublicWebhookBaseUrl();
    if (webhookSecret && webhookBaseUrl) {
      await runGitlawbCli([
        'webhook',
        'create',
        repoName,
        '--url',
        `${withoutTrailingSlash(webhookBaseUrl)}/api/workspaces/webhooks/gitlawb`,
        '--events',
        'push,pull_request.opened,pull_request.reviewed,pull_request.merged,pull_request.closed',
        '--secret',
        webhookSecret,
        '--node',
        nodeUrl,
        '--dir',
        identityDir,
      ], { nodeUrl });
      webhookReady = true;
    } else {
      webhookReady = false;
      warnings.push('GitLawb webhook signature secret or public webhook URL is not configured.');
    }

    if (operatorDid) warnings.push(`GitLawb live workspace created by operator DID ${operatorDid}.`);
  } else if (!liveMode) {
    warnings.push('Live GitLawb provisioning disabled; public-node metadata fixture mode is active.');
  }

  return {
    status: 'READY',
    liveMode,
    providerWorkspaceId,
    repoName,
    cloneUrl: liveMode && repoName ? `gitlawb://${repoName}` : cloneUrl,
    nodeUrl,
    repoDid: providerWorkspaceId,
    defaultBranch,
    branchRef,
    prRef: input.prRef,
    prNumber: input.prNumber,
    actorDids: input.actorDids || [],
    ucanDelegationRefs: delegationRefs,
    capabilitySummary: liveMode
      ? 'GitLawb public-node workspace provisioned with redacted delegation references.'
      : 'GitLawb workspace linked in metadata fixture mode.',
    readiness: {
      credentialsReady: true,
      delegationReady: delegationRefs.length > 0,
      nodeReady: true,
      webhookReady,
      verificationReady: true,
    },
    warnings,
  };
}

export async function provisionWorkspaceWithAdapter(input: WorkspaceProvisionInput): Promise<WorkspaceProvisionResult> {
  return input.provider === 'github' ? provisionGitHub(input) : provisionGitLawb(input);
}

class MetadataOnlyWorkspaceAdapter implements Pick<WorkspaceProviderAdapter, 'provider'> {
  constructor(readonly provider: WorkspaceProvider) {}
}

export const workspaceAdapters: Record<WorkspaceProvider, Pick<WorkspaceProviderAdapter, 'provider'>> = {
  github: new MetadataOnlyWorkspaceAdapter('github'),
  gitlawb: new MetadataOnlyWorkspaceAdapter('gitlawb'),
};

export function getWorkspaceAdapter(provider: WorkspaceProvider): Pick<WorkspaceProviderAdapter, 'provider'> {
  return workspaceAdapters[provider];
}

export async function getWorkspaceProviderProfiles(): Promise<WorkspaceProviderProfile[]> {
  const githubLive = isLiveWorkspaceEnabled('github');
  const gitlawbLive = isLiveWorkspaceEnabled('gitlawb');
  const gitlawbPublicNodeUrl = gitlawbConfigValue('GITLAWB_PUBLIC_NODE_URL') || DEFAULT_GITLAWB_PUBLIC_NODE_URL;
  const gitlawbNodeHealth = await checkPublicNodeReachability(gitlawbPublicNodeUrl);
  const githubWarnings = [
    ...(!githubLive ? ['Live GitHub adapter disabled by AAE_ENABLE_LIVE_GITHUB_WORKSPACES.'] : []),
    ...(githubLive && !process.env.GITHUB_TOKEN ? ['GITHUB_TOKEN is required for live GitHub provisioning.'] : []),
    ...(!process.env.GITHUB_WEBHOOK_SECRET ? ['GITHUB_WEBHOOK_SECRET is required for signed GitHub webhook ingestion.'] : []),
    ...(!process.env.AAE_PUBLIC_WEBHOOK_BASE_URL ? ['AAE_PUBLIC_WEBHOOK_BASE_URL is required before GitHub can deliver webhooks.'] : []),
  ];
  const gitlawbWarnings = [
    ...(!gitlawbLive ? ['Live GitLawb adapter disabled by AAE_ENABLE_LIVE_GITLAWB_WORKSPACES.'] : []),
    ...(!getGitLawbWebhookSecret() ? ['GITLAWB_WEBHOOK_SECRET is required for signed GitLawb webhook ingestion.'] : []),
    ...(!gitlawbConfigValue('GITLAWB_PUBLIC_NODE_URL') ? [`Using default public GitLawb node ${DEFAULT_GITLAWB_PUBLIC_NODE_URL}.`] : []),
    ...(!gitlawbNodeHealth.ok ? [`GitLawb public node is not reachable: ${gitlawbNodeHealth.error}`] : []),
  ];

  return [
    {
      provider: 'github',
      label: 'GitHub',
      summary: 'Centralized git hosting with mature private repos, permissions, reviews, CI, webhooks, and broad developer tooling.',
      tradeoffs: 'Requires account/OAuth management, platform custody, centralized availability and policy risk, and weaker native agent identity than DID-based workflows.',
      liveEnabled: githubLive,
      liveCredentialsConfigured: Boolean(process.env.GITHUB_TOKEN),
      webhookSignatureConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET && process.env.AAE_PUBLIC_WEBHOOK_BASE_URL),
      nodeReachabilityConfigured: true,
      delegationConfigured: true,
      verificationConfigured: true,
      warnings: githubWarnings,
    },
    {
      provider: 'gitlawb',
      label: 'GitLawb',
      summary: 'Agent-native decentralized git over public GitLawb nodes with DID identity, signed pushes, UCAN-scoped delegation, gitlawb:// remotes, PRs, and verifiable ref/update artifacts.',
      tradeoffs: 'v0.1-alpha API/tooling risk, public-node eventual-consistency assumptions, less mature private-repo UX, and stricter key/delegation management requirements.',
      liveEnabled: gitlawbLive,
      liveCredentialsConfigured: true,
      webhookSignatureConfigured: Boolean(getGitLawbWebhookSecret()),
      nodeReachabilityConfigured: gitlawbNodeHealth.ok,
      delegationConfigured: gitlawbLive,
      verificationConfigured: true,
      publicNodeUrl: gitlawbPublicNodeUrl,
      nodeMetadata: gitlawbNodeHealth.metadata,
      nodeReachabilityError: gitlawbNodeHealth.error,
      warnings: gitlawbWarnings,
    },
  ];
}
