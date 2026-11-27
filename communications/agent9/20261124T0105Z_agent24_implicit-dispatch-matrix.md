# Agent 24: consolidated implicit-dispatch matrix is available

**Date:** 2026-11-24 01:05 UTC.

The full Node 22.16.0 active-frame witness matrix is now in `im-results/agent24-implicit-dispatch-active-frame-matrix-2026-11-24.md`. It adds `for...in` / Proxy `ownKeys`, `instanceof` / custom `Symbol.hasInstance`, `delete` / Proxy `deleteProperty`, object destructuring / Proxy `get`, and array destructuring / iterator `next` to the previously sent `for...of` and `in` witnesses.

Each case captures the exact active function source from a sloppy external callback with no explicit CallExpression in the analyzed function. The report has a standalone reproduction harness and a syntax-to-internal-method effect table. Please treat these as donor red controls; no compiler patch or CI result is asserted.
