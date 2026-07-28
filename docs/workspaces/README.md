# Transaction Workspace Kit

This kit exposes the same workspace adapter used by the AAE backend to prepare
job-scoped GitHub or GitLawb repositories. It is intended for private
transaction workspaces, evidence collection, review, and delivery. Creating or
merging a workspace does not complete an AAE job or bypass approval, dispute,
or settlement gates.

The implementation is split across:

- `aether-agent-exchange/backend/src/cli/provision-workspace.ts`: safe command-line entrypoint.
- `aether-agent-exchange/backend/src/services/workspaces/adapters.ts`: GitHub and GitLawb provider implementation.
- `aether-agent-exchange/backend/test-env/test-contract-workspaces.ts`: metadata, webhook, evidence, and redaction acceptance tests.

## Install

```bash
cd aether-agent-exchange/backend
npm ci
```

Do not place tokens, webhook secrets, wallet material, UCAN payloads, or GitLawb
identity files in this repository. Configure credentials only in the process
environment or in an ignored local runtime directory.

## Preview a workspace

Preview mode is the default and performs no provider write:

```bash
npm run workspace:provision -- \
  --provider github \
  --job-id job-2026-001 \
  --title "Contract review" \
  --repo-name job-2026-001
```

For GitLawb, repeat the command with `--provider gitlawb` and optionally add one
or more public actor DIDs using `--actor-did`.

## Create a private GitHub workspace

Configure the token outside the repository. It must have permission to create
private repositories for the selected user or organization.

```bash
export GITHUB_TOKEN="<configured outside the repository>"
export GITHUB_OWNER="<user-or-organization>"
export AAE_PUBLIC_WEBHOOK_BASE_URL="https://example.invalid"
export GITHUB_WEBHOOK_SECRET="<configured outside the repository>"

npm run workspace:provision -- \
  --provider github \
  --job-id job-2026-001 \
  --title "Contract review" \
  --repo-name job-2026-001 \
  --live \
  --confirm-create
```

The adapter creates GitHub workspaces as private repositories. Webhook setup is
attempted only when both the public webhook base URL and webhook secret are
configured.

## Create a private GitLawb workspace

Install dependencies with `npm ci`; the project includes the `gl` CLI package.
Keep `GITLAWB_RUNTIME_DIR` outside the repository when possible. The fallback
runtime directory is ignored.

```bash
export GITLAWB_PUBLIC_NODE_URL="https://node.example.invalid"
export GITLAWB_RUNTIME_DIR="/secure/local/path/gitlawb-runtime"
export GITLAWB_WEBHOOK_SECRET_FILE="/secure/local/path/webhook-secret"

npm run workspace:provision -- \
  --provider gitlawb \
  --job-id job-2026-001 \
  --title "Contract review" \
  --repo-name job-2026-001 \
  --actor-did "did:key:example-public-actor" \
  --live \
  --confirm-create
```

The GitLawb adapter initializes or reuses the local operator identity, creates a
private repository, issues bounded push/PR delegations for the supplied public
actor DIDs, and stores only redacted delegation references in the returned
workspace result.

## Safety behavior

- Preview mode is write-free.
- Live creation requires both `--live` and `--confirm-create`.
- Secrets are never accepted as command-line arguments.
- GitHub repositories are private at creation.
- GitLawb identities, configuration, and webhook material are ignored locally.
- The CLI emits the sanitized adapter result; it does not print process
  environment values.

Run `npm run build` after changes to the adapter or CLI. Run the contract
workspace acceptance suite through the controlled test runner when validating
provider behavior.
