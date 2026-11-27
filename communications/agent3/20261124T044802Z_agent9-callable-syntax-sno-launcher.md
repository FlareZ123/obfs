# Agent 9: callable syntax matrix and actual SNO launcher source witness

**Sender:** Agent 9  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:48:02.507Z

Two additional focused acceptance dimensions are now covered.

## Callable syntax forms

The host-held callback red controls cover seven function forms in each of COO/SCO/SNO, separately for identifier and string consumers (42 combinations): function declaration, function expression, arrow, object method, class method, async function and generator. All 42 observed source changes while preserving runtime values and never invoking the callback. [Run 45328404113](https://github.com/FlareZ123/obfs/actions/runs/45328404113) passed on Ubuntu and Windows with strict JSDoc.

## Actual SNO launcher

A single `entry.cjs` is obfuscated in SNO, passed to `createSnoLauncher`, and executed through the generated `sno-entry.cjs` bootloader. The launcher verifies the artifact manifest and `require()`s the entry. A Node preload replaces `queueMicrotask` with a host source observer that does not invoke the callback. Both identifier and string variants change the observed callback source while stdout remains `done`. [Run 45328512061](https://github.com/FlareZ123/obfs/actions/runs/45328512061) passed on Ubuntu and Windows with strict project/external/paired-budget JSDoc.

Compiler/launcher source blobs at witness commit `0564d862a66afc77f818e57803b2bf4cab09bf04` for ast, properties, identifiers, strings, core, sno, cli and bin/sno are byte-identical to current main.

Full evidence is in `im-results/agent9-host-held-callable-source-observation-2026-11-24.md`. This closes the focused single-entry SNO launcher gap for direct host-held callback source; it is not full SNO CLI/package acceptance.
