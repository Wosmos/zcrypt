# Backend Tests

## Setup

- **Framework:** Go `testing` + [testify](https://github.com/stretchr/testify) v1.11
- **Runner:** `go test ./...`
- **Race detection:** `go test -race ./...`

## Structure

Go convention: test files live alongside source files (`*_test.go` in the same package).

```
auth/
  auth_test.go         # Password hashing, JWT sign/verify, token utilities
config/
  config_test.go       # Default config, validation, email config
crypto/
  crypto_test.go       # Salt/IV generation, key derivation, token encrypt/decrypt
disguise/
  disguise_test.go     # Fake filenames, commit messages, repo names
pipeline/
  progress_test.go     # SSE event routing, admin broadcast, slow subscriber handling
cmd/
  download_prod_test.go # Production download test (requires -tags=prodtest)
```

## Test Categories

### P0 — Security & Crypto (6 tests)
| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `crypto/crypto_test.go` | 6 | Salt/IV generation, PBKDF2 key derivation, AES-256-GCM token encrypt/decrypt, master key parsing, per-user KEK derivation |

### P1 — Auth & Access Control (10 tests)
| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `auth/auth_test.go` | 10 | bcrypt hash/verify, JWT generation/validation, expired token rejection, `alg:none` attack prevention, random token generation |

### P1 — Infrastructure (15 tests)
| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `config/config_test.go` | 7 | Default values, JWT secret validation, email config requirements |
| `pipeline/progress_test.go` | 8 | SSE event routing per user, admin broadcast, unsubscribe, slow subscriber backpressure, audit events, concurrent safety (race detector) |

### P2 — Disguise (5 tests)
| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `disguise/disguise_test.go` | 5 | Chunk filename generation, uniqueness, commit messages, repo names, README content |

## Running

```bash
# Run all tests
cd app/backend && go test ./...

# With race detector
go test -race ./...

# Verbose
go test -v ./...

# Single package
go test -v ./crypto/

# Production download test (requires .env.prodtest)
go test -tags=prodtest -v ./cmd/ -run TestProdDownload
```

## Adding Tests

1. Create `*_test.go` in the same package as the code being tested
2. Use `testify/assert` for assertions, `testify/require` for fatal checks
3. Run with `-race` flag to catch concurrency bugs
4. P0 tests (crypto, auth) must pass before merge
