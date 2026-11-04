# Pix

Pix is a personal-agent platform exploring a move from a standalone Linux VM to durable, idle-efficient Cloudflare infrastructure.

- Separate each person's agent state, storage, and permissions.
- Use durable coordination and recoverable state without an always-on VM per instance.
- Compose tools through Codemode, with isolated execution and scoped credentials.
- Keep the harness versioned, reviewable, and easy to extend.

The Cloudflare architecture and migration approach are still being explored. The first implementation is a minimal Worker in `@pix/cloud`.

## Development

Requires Node.js 24.11.1+ and pnpm 12.16.1 (pinned in `package.json`).

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

This is a pnpm workspace with packages under `packages/*`. Root tests run the existing Markdown tooling tests and each package's tests.

### Cloud Worker

`packages/cloud` (`@pix/cloud`) contains an Effect v4 HTTP handler, an Alchemy v2 Worker declaration, and its `alchemy.run.ts` stack. Alchemy is pinned to a beta release compatible with Effect v4.

```sh
pnpm --filter @pix/cloud test
pnpm --filter @pix/cloud typecheck
```

The smoke test sends one `GET /` request through Effect's Web Request/Response adapter and checks the status, content type, and `Hello from Pix!` body. It uses the same handler as the Worker, runs in Node via Vitest, and needs no Cloudflare credentials, network listener, or deployed resources. It does not test the Cloudflare runtime or provisioning.

The stack is declared for future deployment only. No deployment or `alchemy dev` is part of setup or testing; Alchemy's dev command can provision cloud resources.

## Capabilities vs. tools

### Capability (integration)

A **capability** is first-party functionality implemented and managed by Pix. It is available to the system itself and can optionally be made available to tools. Some capabilities work out of the box; others require user setup, such as connecting an account or configuring credentials.

Examples include:

- **LLM inference:** access to a model provider through a supported subscription or API key. This capability is required for Pix to operate and may also be used by tools.
- **GitHub integration:** a configured connection for accessing repositories and other GitHub functionality.
- **Replicate or TypeSafe access:** provider integrations configured with the user's own keys.
- **Email integration:** an authenticated connection to the user's mail provider.

Credentials enable a capability; they are not, by themselves, the capability.

### Tool

A **tool** is a third-party extension that an agent can discover and invoke through a common interface. Pix defines the extension contract, not a fixed catalog of tool names, purposes, or implementations. Those details can vary between tools without requiring changes to the core system.

Tools may use capabilities that Pix explicitly makes available to them.

In short: **capabilities are system-managed building blocks; tools are open-ended, agent-facing extensions that may build on them.**
