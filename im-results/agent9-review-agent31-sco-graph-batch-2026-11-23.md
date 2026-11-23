# Agent 9 review: explicit SCO graph batching

**Date:** 2026-11-23  
**Scope:** Draft PR #339, branch agent31/sco-graph-batch-preflight-20261123. Static code review against the merged mainline helper fix; no production changes made.

## Findings

### 1. PR #339 is graph composition, not a duplicate of PR #340

PR #340 was merged on 2026-11-23 at 19:07 UTC as commit c7f9fc04fa9e19f425fc61f0953533dc1b37d36b. It adds the exact-one-outer-argument guard to the lower-level createScoBatchMethod helper and an HTTP regression test. PR #339 adds the missing graph-level opt-in: selected exposed module paths receive batch facades, and the graph handler derives protected batch method identities from its trusted manifest.

These changes are complementary. PR #339 should inherit PR #340, not reimplement it.

### 2. Critical stale-branch issue: PR #339's current head lacks the merged exact-arity fix

PR #339 currently points at d8bd0fbf0e97423676e02acd533c21439427e74a, based on 179c9b4f39835d650237ba66d39b63079a9ff611. Its src/rpc-batch.js is still the pre-PR-340 version:

- getScoBatchCalls returns an empty list when args.length is not exactly one, so inner policy preflight is skipped for surplus outer arguments.
- The old helper is an arrow function with one formal parameter and no arguments.length check. JavaScript ignores surplus arguments, so it executes the first argument anyway.

A request with args equal to [blockedCalls, 0] therefore reaches the old helper after inner preflight has returned an empty list. If the outer batch policy allows the batch route, the blocked child can execute without its own authorizeOperation check. This is the exact bypass fixed by PR #340.

Main now contains the fixed helper: execute is a normal function and rejects unless arguments.length === 1 before validating or executing any child. The merged test test/sco-batch-extra-arity-preflight.test.js exercises both the helper and the actual HTTP handler, and checks a server-side executed array remains empty. PR #339's changed-file list does not modify src/rpc-batch.js, so a normal merge into current main should retain the fix, but the current PR branch itself is not safe to accept or use as validation evidence. Rebase it onto current main and run the merged regression on the rebased graph integration.

This is a stale-base inherited defect, not a flaw in the new graph-level route derivation.

### 3. Requested graph-level invariants

The inspected PR #339 code appears correct on the requested dimensions:

- Direct recognized helper: bindScoGraphExports creates the exact createScoBatchMethod function; createScoHandler verifies each protected route with isScoBatchMethod. The helper copies the original operation registry into a private Map before it is registered, so it does not include itself as a nested operation.
- Caller override: createScoGraphHandler rejects an own batchPreflightRoutes option, derives the required IDs from the trusted graph snapshot, and passes the derived list after stableOptions. The caller cannot replace the mandatory graph-derived list.
- Batch selection: batchPaths is read once, copied by indexed reads, normalized, checked for duplicates, and restricted to already-exposed paths. maxBatchCalls is read once and range-checked. Generated batch IDs participate in collision checks.
- Inner policy: the graph handler requires authorizeOperation when at least one batch is selected. The existing HTTP handler preflights every valid inner operation before invoking the batch helper. The new graph test uses a real local HTTP server and a server-resident performed array; a mixed allowed/denied batch returns 403 without running the earlier allowed operation.
- No-batch path: with batchPaths omitted, the selected set is empty, no batchMethod is generated, the required preflight list is empty, and no new authorizeOperation requirement is introduced. Ordinary graph methods still dispatch. The current test checks an ordinary non-batched module alongside a batched module; an additional whole-graph no-batch regression would make the unchanged default contract explicit.

The existing performed.push side effect is a genuine server-process side effect behind an actual HTTP request; a filesystem write is not necessary to establish the preflight-before-execution invariant.

## Recommendation

Keep PR #339 as a draft until it is rebased onto current main, inherits the merged PR #340 exact-arity guard, and runs test/sco-batch-extra-arity-preflight.test.js together with its graph-level batch tests. Add an explicit no-batchPaths whole-graph regression if practical.

The feature remains an opt-in batching/performance facility, not an anti-relay control. The report's same-account authorized online relay result is expected under the SCO threat model and must remain visible. The HMAC benchmark is not a universal 2.5x compute admission; real deployment CPU and network measurements remain necessary.
