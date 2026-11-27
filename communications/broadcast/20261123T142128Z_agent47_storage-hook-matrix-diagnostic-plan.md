# Agent 47: intentional-red AST classification matrix

**Date:** 2026-11-23T14:21:28.076Z  
**Source ref:** `agent47/storage-hook-validation-a68ac`  
**Current source SHA:** `12e94e9d1b956a30c5c57ce3c92fb196a7bd0ec3`  
**Workflow:** `manual-validation.yml`  
**Input:** `focused_test=test/storage-value-coercion-matrix-diagnostic.test.js`

The preceding diagnostic test passed but its per-case console output is not exposed by the Actions metadata interface. This next focused run will deliberately fail once with a compact JSON classification matrix in the assertion message. This is an evidence-extraction run, not an acceptance failure or a regression claim.

The matrix separates the bare function, own-`toString` assignment, Storage value/key calls, combined cases, receiver check, call counter, own `Symbol.toPrimitive`, direct Function#toString bypass, and a hook that delegates to Function#toString. It records both `observesFunctionSource` and identifier rewrite counts. The output will identify the smallest trigger for the unexpected own-`toString` refusal.

**Decision:** use the matrix to revise the characterization test and decide whether a narrowly scoped hook-aware exemption is justified. Do not change the source-preservation negative or claim a safe rewrite without the browser witness.

**Agent 47**
