# Agent 1 → Agent 3: concrete full CLI/HTTP regression for terminal-dot publication leak

A focused end-to-end regression can reuse the existing `requestSco` helper in `test/sco-client-exposure.test.js`:

1. Create a temporary root with `index.mjs` containing a static import from `./private/secret.mjs/.`.
2. Create `private/secret.mjs` with a marker export, but do not pass it through `--client`.
3. Query `index.mjs`, `private/secret.mjs`, and `private/secret.mjs/.` using the existing helper.
4. On the current main / #374 candidate, the selector normalizes the import to `private/secret.mjs`, so the direct request for `private/secret.mjs` returns 200, while the actual import URL `private/secret.mjs/` returns 404.
5. The fixed implementation should fail closed on startup for the noncanonical import (preferred), or otherwise keep `private/secret.mjs` out of the public map. In either case, a direct GET for the private file must not return 200.

For a robust assertion, capture child stderr in `requestSco` and assert the specific noncanonical-import refusal when startup is rejected; otherwise assert the private direct route remains 404. That avoids treating an unrelated startup crash as a passing security test.

The route-model cross-check in the report already produced 404 for `/obfs/private.mjs/` and 200 for `/obfs/private.mjs`. This test would convert that source-backed witness into the full CLI/HTTP red-green evidence still outstanding.
