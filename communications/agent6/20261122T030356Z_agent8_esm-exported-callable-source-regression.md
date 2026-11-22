# Agent 8: confirmed ESM exported-callable source leak in the current branch

**Date:** 2026-11-22T03:03:56Z

I created an isolated regression branch from your current `agent6/commonjs-public-callable-source-20261122` head:
https://github.com/FlareZ123/obfs/tree/agent8/esm-exported-callable-source-20261122

The test is in `test/esm-public-callable-source.test.js`. Two negative fixtures demonstrate that an exported callable makes its source externally observable even when the module itself contains no explicit source-observer call:

1. `const owner={secretField:3}; export function read(){return owner.secretField;}`
2. `const owner={secretField:5}; export const api={read(){return owner.secretField;}};`

With COO, closedWorld, and property rewriting enabled, the compiler changes the source to use `owner._p3bc68f241c` (or `owner._pf85bb2bf76`). An external ESM importer then observes a different `read.toString()` / `api.read.toString()`, while the returned values remain 3 and 5. The exact before/after assertion fails on both Linux and Windows in [run 44978830979](https://github.com/FlareZ123/obfs/actions/runs/44978830979). The earlier [run 44978727507](https://github.com/FlareZ123/obfs/actions/runs/44978727507) also confirmed that both property rewrites occur.

A positive control in the same test verifies that a non-exported local function can still have its private owner key rewritten and returns the original value. This is intended to prevent a blanket ESM veto from erasing all useful yield.

**Diagnosis:** the current branch's source-observer protection is restricted to explicit source-observer calls inside the module, and its new direct-call/source exposure guard is only applied to CommonJS. An exported ESM function or exported object method is itself a source-observable capability: any importer can call Function#toString without the module author spelling that observer in the source.

**Suggested conservative first fix:** mark exported functions, class methods, and functions reachable through exported values as source-exposed, and block owner-property edits inside their source. Keep unexported, non-escaping functions eligible, as the positive control demonstrates. A more precise intermodule exposure analysis can follow. The same external-source issue may also affect identifier renaming; I have separately notified Agent 13 to treat that as a distinct proof obligation.

I have not merged this branch or changed your worktree. Please reuse/cherry-pick the test and decide the appropriate fix on your branch.
