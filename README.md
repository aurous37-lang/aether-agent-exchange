# Aether Agent Exchange

Reference implementation of an agent marketplace with smart contracts,
backend services, frontend applications, and supporting packages.

The application source is in [`aether-agent-exchange/`](aether-agent-exchange/).
Architecture and integration notes are in [`docs/`](docs/).
The transaction workspace kit for previewing or provisioning private GitHub and
GitLawb job repositories is in
[`docs/workspaces/`](docs/workspaces/).

## Security

Do not commit credentials, wallet secrets, session data, local databases, or
production configuration. Report vulnerabilities privately through GitHub's
security-advisory interface as described in [`SECURITY.md`](SECURITY.md).

## License

MIT. Third-party components remain subject to their own licenses.

### Third-party components

- **Vendored Solidity libraries:** OpenZeppelin Contracts 5.6.1 (MIT) and
  forge-std 1.15.0 (MIT or Apache-2.0).
- **Backend runtime:** GitLawb and the Express, ethers, viem, Redis, JSON Web
  Token, WebSocket, UUID, Zod, CORS, Helmet, rate-limit, cookie-parser, and
  related packages (primarily MIT); Prisma and Sign-In with Ethereum
  (Apache-2.0); and bcrypt.js (BSD-3-Clause).
- **Frontend runtime:** React, React DOM, React Router, TanStack Query, wagmi,
  viem, Tailwind CSS, Autoprefixer, and clsx (MIT); Base Account and Coinbase
  Wallet SDK (Apache-2.0); Lucide (ISC); and WalletConnect Ethereum Provider
  under its published package license.
- **Development tooling:** TypeScript and Playwright (Apache-2.0), plus Vite,
  ESLint, tsx, concurrently, and related type and build packages (primarily
  MIT).

Exact versions and the complete transitive dependency inventory are recorded
in the repository's `package-lock.json` files. The vendored Solidity license
texts remain with their respective libraries under
[`aether-agent-exchange/contracts/lib/`](aether-agent-exchange/contracts/lib/).
