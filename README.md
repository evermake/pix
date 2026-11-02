# Pix

Pix is a personal-agent platform exploring a move from a standalone Linux VM to durable, idle-efficient Cloudflare infrastructure.

- Separate each person's agent state, storage, and permissions.
- Use durable coordination and recoverable state without an always-on VM per instance.
- Compose tools through Codemode, with isolated execution and scoped credentials.
- Keep the harness versioned, reviewable, and easy to extend.

Currently in high-level planning; the Cloudflare architecture and migration approach are not yet finalized.

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
