#!/usr/bin/env npx tsx

import {
  provisionWorkspaceWithAdapter,
  type WorkspaceProvisionInput,
} from '../services/workspaces/adapters';

type CliOptions = {
  provider?: string;
  jobId?: string;
  title?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  actorDids: string[];
  live: boolean;
  confirmCreate: boolean;
  help: boolean;
};

const VALUE_FLAGS: Record<string, keyof Omit<CliOptions, 'actorDids' | 'live' | 'confirmCreate' | 'help'>> = {
  '--provider': 'provider',
  '--job-id': 'jobId',
  '--title': 'title',
  '--repo-owner': 'repoOwner',
  '--repo-name': 'repoName',
  '--default-branch': 'defaultBranch',
};

function usage(): string {
  return `Usage:
  npm run workspace:provision -- \\
    --provider <github|gitlawb> \\
    --job-id <public-job-reference> \\
    --title <workspace-title> \\
    [--repo-owner <github-owner>] \\
    [--repo-name <repository-name>] \\
    [--default-branch <branch>] \\
    [--actor-did <public-did>]... \\
    [--live --confirm-create]

Preview mode is the default. Provider credentials and webhook secrets are read
only from the process environment or the ignored GitLawb runtime configuration;
this command does not accept secret arguments.`;
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    actorDids: [],
    live: false,
    confirmCreate: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') {
      options.help = true;
      continue;
    }
    if (flag === '--live') {
      options.live = true;
      continue;
    }
    if (flag === '--confirm-create') {
      options.confirmCreate = true;
      continue;
    }
    if (flag === '--actor-did') {
      options.actorDids.push(takeValue(args, index, flag));
      index += 1;
      continue;
    }
    const property = VALUE_FLAGS[flag];
    if (property) {
      options[property] = takeValue(args, index, flag);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }

  return options;
}

function requireSafeText(value: string | undefined, label: string, maxLength: number): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maxLength) throw new Error(`${label} must be at most ${maxLength} characters`);
  if (/[\r\n\0]/.test(normalized)) throw new Error(`${label} contains unsupported control characters`);
  return normalized;
}

function requireSlug(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = requireSafeText(value, label, 100);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(normalized)) {
    throw new Error(`${label} must contain only letters, numbers, dots, underscores, or hyphens`);
  }
  return normalized;
}

function validateOptions(options: CliOptions): WorkspaceProvisionInput {
  if (options.provider !== 'github' && options.provider !== 'gitlawb') {
    throw new Error('--provider must be github or gitlawb');
  }
  if (options.confirmCreate && !options.live) {
    throw new Error('--confirm-create is valid only with --live');
  }
  if (options.live && !options.confirmCreate) {
    throw new Error('Live creation requires --confirm-create');
  }

  const actorDids = options.actorDids.map((did) => {
    const normalized = requireSafeText(did, '--actor-did', 200);
    if (!normalized.startsWith('did:')) throw new Error('--actor-did values must be public DID identifiers');
    return normalized;
  });

  return {
    provider: options.provider,
    mode: 'create',
    jobId: requireSafeText(options.jobId, '--job-id', 120),
    title: requireSafeText(options.title, '--title', 200),
    repoOwner: requireSlug(options.repoOwner, '--repo-owner'),
    repoName: requireSlug(options.repoName, '--repo-name'),
    defaultBranch: requireSlug(options.defaultBranch, '--default-branch') || 'main',
    actorDids,
  };
}

function preview(input: WorkspaceProvisionInput): unknown {
  const suffix = input.jobId.slice(0, 8);
  const repoName = input.repoName || `aae-job-${suffix}`;
  return {
    mode: 'preview',
    writesPerformed: false,
    provider: input.provider,
    repository: {
      owner: input.provider === 'github' ? input.repoOwner || '<authenticated-owner>' : undefined,
      name: repoName,
      visibility: 'private',
      defaultBranch: input.defaultBranch,
      jobBranch: `aae/job-${suffix}`,
    },
    actorDids: input.actorDids,
    nextStep: 'Repeat with --live --confirm-create after configuring credentials outside the repository.',
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const input = validateOptions(options);
  if (!options.live) {
    console.log(JSON.stringify(preview(input), null, 2));
    return;
  }

  if (input.provider === 'github') {
    process.env.AAE_ENABLE_LIVE_GITHUB_WORKSPACES = 'true';
  } else {
    process.env.AAE_ENABLE_LIVE_GITLAWB_WORKSPACES = 'true';
  }

  const result = await provisionWorkspaceWithAdapter(input);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Workspace provisioning failed';
  console.error(`Workspace provisioning failed: ${message}`);
  process.exitCode = 1;
});
