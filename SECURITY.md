# Security Policy

zcrypt is a zero-knowledge, end-to-end encrypted storage system. Security is the
core promise of the project, so we take vulnerability reports seriously and
appreciate responsible disclosure.

## Reporting a vulnerability

**Please do NOT open a public GitHub issue, discussion, or pull request for a
security vulnerability.** Public disclosure before a fix is available puts users
at risk.

Instead, report it privately by email to:

**wasif@linkedunion.com**

Please include, where possible:

- A description of the issue and its potential impact.
- Steps to reproduce, or a proof-of-concept.
- The affected component (backend, frontend, TUI) and version/commit.
- Any suggested remediation.

You can expect an acknowledgement of your report, and we will keep you informed
as we investigate and work on a fix. We ask that you give us a reasonable amount
of time to address the issue before any public disclosure, and that you avoid
accessing, modifying, or destroying data that is not your own while researching.

We will credit reporters who wish to be acknowledged once a fix has shipped.

## Supported versions

zcrypt is under active development and has not yet reached a stable 1.0 release.
Security fixes are applied to the latest version on the `main` branch. We
recommend always running the most recent release. Older versions and forks are
not guaranteed to receive security updates.

| Version        | Supported |
| -------------- | --------- |
| `main` (latest)| Yes       |
| Older releases | No        |

## Scope

In scope:

- The zcrypt backend, frontend, and TUI in this repository.
- Issues that could compromise the zero-knowledge guarantee (e.g. plaintext or
  passphrase exposure), authentication, token-at-rest encryption, access
  control, or data integrity.

Out of scope:

- Vulnerabilities in third-party storage platforms (GitHub, GitLab,
  HuggingFace, Telegram) themselves.
- Misconfiguration of a self-hosted deployment (e.g. a weak or leaked
  `MASTER_KEY`/`ZCRYPT_JWT_SECRET` chosen by the operator).
- Findings that require physical access to a user's unlocked device.

Thank you for helping keep zcrypt and its users safe.
