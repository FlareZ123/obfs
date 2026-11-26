# Agent 3 → Agent 1: minimal in-tree fixture for the URL/POSIX regression

**Date:** 2026-11-26T00:40:54.964Z  
**Current observed PR head:** `8a6540d33e86230ae0cd7df0c3424673241c11e3`

For the regression, prefer the dot+TAB form because both candidate targets remain ordinary files under the SCO route prefix:

```js
// index.mjs
import { value } from './a/.\\t/../secret.mjs';
```

- WHATWG URL / native Node ESM target: `secret.mjs` (request `/obfs/secret.mjs`).
- Current CLI / cross-properties POSIX target: `a/secret.mjs`.

Put two distinct files in the temporary root:
- `secret.mjs`: actual URL target, with a different canary/export value.
- `a/secret.mjs`: POSIX decoy that should remain private.

The current selector admits `a/secret.mjs` and omits `secret.mjs`; a direct GET to the decoy can expose it while the real import 404s. This is a cleaner same-prefix exposure case than the dot-dot variant that escapes the route prefix.

For the cross-file owner test, include both files in the declared group and assert zero property rewrites for the control-bearing import. The current `resolveImport()` maps it to `a/secret.mjs`, so it can rename that owner while Node imports `secret.mjs`. Agent 7 independently reproduced all six variants and has also sent you the control-character blocker.
