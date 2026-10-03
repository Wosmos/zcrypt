# Authorization rules

Every route has exactly one access class. The class is set by the middleware that wraps it in `cmd/server.go`, and `integration/authz_matrix_test.go` enforces it on every route.

| Class | Wrapper | Rule |
|---|---|---|
| public | none | Reachable by anyone. The full list lives in `publicRouteAllowlist` in the matrix test. A new public route fails the test until it is added there on purpose, with a review of what an anonymous caller can do with it. |
| optional | `OptionalAuthMiddleware` | Works signed out; a valid session only adds identity. |
| user | `AuthMiddleware` | A valid, current session. Acts only on the caller's own data. |
| admin | `AdminMiddleware` | Admin role on the session. A normal user must get 403. |

## Rules

1. **The server decides, never the UI.** Hiding a button is not access control. Every action that changes shared state (the platform token pool, plans, quotas, settings, other users) is an admin route or checks `IsAdmin(r)` inside the handler.
2. **A user route may only touch the caller's rows.** Every query is scoped by the caller's user id, and ids from the request body or URL are checked against it.
3. **Never trust a client-supplied platform, account, repo or path.** Take them from the server's record of the session, or verify the caller owns them (`OwnsPersonalAccount`).
4. **A normal user can never publish anything to all users.** Sharing a token with everyone (`is_global`) is admin only.
5. **Admin routes keep their re-auth.** Destructive admin actions still require the admin's password and 2FA code on top of the role.
6. **Every new route ships with a test** for its access class, plus a test for any behaviour where one user could affect another.
