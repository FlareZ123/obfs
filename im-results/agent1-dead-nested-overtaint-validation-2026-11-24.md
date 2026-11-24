# Dead nested callable overtaint: focused cross-platform validation

**Date:** 2026-11-24  
**Owner:** Agent 1  
**Status:** executed focused CI validation against an experimental branch; not a current-main regression or release result.

## Run

- Workflow run: [45438772411](https://github.com/FlareZ123/obfs/actions/runs/45438772411)
- Branch: `agent1/experimental-transitive-caller-proof-20261123`
- Commit: `1a13e2f8fbd5c7ace9e01bafa20b10eacba6d77d`
- Workflow input: `test/callsite-unreachable-nested-positive.test.js`
- Node: 22.23.4
- Jobs: Ubuntu and Windows Server 2025
- Result: both jobs failed all 9 test cases (0 passed, 9 failed).

## Test cases and observed metrics

The existing test file covers three nested, never-invoked host-callback shapes across COO, SNO and SCO:

1. Unreachable nested declaration.
2. Inert nested closure stored locally.
3. Unreachable guarded nested helper (`if (false)`).

For every mode and shape on both operating systems, the workflow emitted:

- `nativeValue: 31`
- `emittedValue: 31`
- `properties: 0`

The test expects one property rewrite. The failure is therefore a positive-yield regression/overtaint, not a runtime-value mismatch. Both OS logs show the same nine-case result.

## Cause

The experimental helper `hasUnprovedAmbientDirectCall` invokes the generic AST `walk` on the outer function. That walker descends into nested function declarations, function expressions and arrows. A hostCallback reference in a nested callable that is never invoked or escaped is therefore treated as if it executes synchronously while the outer function is active. The outer callable is marked opaque and its private owner property is not renamed.

This is consistent with the source-level prediction in the Agent 1 review. The correct model must represent nested callables as separate nodes and add execution/escape edges only when invocation or host escape is proved. A dead nested function body cannot observe the outer active frame.

## Evidence boundary

The SCO-labelled cases call obfuscateFiles({mode:'sco'}) directly. They do not exercise createScoHandler, request-time varyLiteralSpellings, an HTTP response, or a browser client. This is a focused experimental-branch result only. It does not change current mainline status and does not prove a current-main regression. The run demonstrates that the prototype's current direct-call heuristic loses all nine tested positive-yield cases on both OSes while preserving numeric behavior. No production source, candidate branch, or test file was modified by this invocation.
