# Support

Thanks for using zcrypt. This page is the map for getting help — pick the channel that matches what you need.

zcrypt is built and maintained by one person, in the open, for free. Support is **best-effort**: you'll usually get a reply, but there is no SLA and response times vary. Clear, reproducible reports get resolved fastest.

## Where to go

| I want to… | Go here |
| ---------- | ------- |
| **Report a bug** | [Open a GitHub issue](https://github.com/Wosmos/zcrypt/issues/new) with the details below |
| **Request a feature** | [Open a GitHub issue](https://github.com/Wosmos/zcrypt/issues/new) and describe the problem it solves |
| **Ask a question / discuss** | [GitHub Discussions](https://github.com/Wosmos/zcrypt/discussions) (if enabled) or a GitHub issue |
| **Report a security vulnerability** | **Do not open a public issue** — follow [docs/SECURITY.md](docs/SECURITY.md) |
| **Contact the maintainer** | m.wasifmalik17@gmail.com |

> Security issues are the one thing that must stay private. Anything that could let someone read another user's files, bypass authentication, or leak secrets goes through the private process in [docs/SECURITY.md](docs/SECURITY.md) — never a public issue.

## Filing a good bug report

The more of this you include, the faster it gets fixed:

1. **What you did** — the exact steps to reproduce.
2. **What you expected** vs. **what actually happened.**
3. **Which client** — web (and browser + version), desktop (and OS), Android, or TUI.
4. **Version / build** — the app version, or the commit hash if you built from source.
5. **Logs or screenshots** — with anything sensitive redacted.

⚠️ **Never paste secrets into a public issue** — no passphrases, JWTs, platform tokens, connection strings, or `MASTER_KEY`. If you already have, rotate the secret immediately; deleting the comment does not un-leak it. (zcrypt is zero-knowledge, so a maintainer can never recover your passphrase or decrypt your files for you — by design.)

## What's in scope

- The web app, desktop app, Android app, TUI, and the backend in this repository.
- Self-hosting help: build, configuration, and environment variables (see the [README](README.md) and [`app/backend/.env.example`](app/backend/.env.example)).

## What's out of scope

- Bugs in the storage platforms themselves (GitHub, GitLab, HuggingFace, Telegram) or their rate limits.
- Recovering a lost passphrase or files encrypted under a passphrase you no longer have — this is **impossible by design** and not a bug.
- Operator misconfiguration of a self-hosted instance (though the docs should make it hard to get wrong — if they don't, that's a documentation issue worth filing).

## Contributing a fix

If you'd like to fix something yourself, that's very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the PR workflow.

## Supporting the project

zcrypt is free with no paid tiers. If you'd like to help keep the infrastructure running, see [Sponsor zcrypt](README.md#sponsor-zcrypt).
