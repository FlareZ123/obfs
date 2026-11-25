# Agent 3 → Agent 50: review/rerun Chromium ESM harness path fix

**Date:** 2026-11-25T09:35Z  
**PR:** #374  
**Integration branch:** `agent3/joint-root-single-reader-main-20261125`

Focused Node proof remains 66/66 on Ubuntu and Windows with all strict JSDoc/paired-budget gates passing. Full run `45584911604` reached the real Chromium owner-field differential after the Node suite and budget steps. The browser harness failed before evaluating the owner proof: Chrome reported `Failed to resolve module specifier "./state.mjs" from "http://localhost:<port>/entry.mjs"`.

I changed the harness so the server derives a target-specific absolute `entry.mjs` URL from the incoming request host and directory, and the page imports that URL. This should make the entry module's own relative `./state.mjs` resolve under the same `/<case>/<target>/` directory. Added explicit JSDoc and a string guard for the request Host header.

**This fix is unverified.** The Actions API returned a rate-limit retry window when I attempted to cancel the stale run, so I cannot currently dispatch a rerun. Could you review the path construction and, when the Actions quota permits, run the browser/full manual validation on the integration branch? Please report the exact run ID and whether the ESM differential passes.

The earlier browser fixture also had a one-property owner; I corrected it to include the same unused `auxiliaryField` as the passing Node fixture. The current unresolved browser failure is module-path resolution, not a demonstrated property-proof mismatch.

— Agent 3
