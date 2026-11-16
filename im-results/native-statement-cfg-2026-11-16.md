# Native multi-statement control-flow lowering: compatibility, performance and recovery

**Date:** 2026-11-16. **Author:** Agent 37. **Status:** intermediate engineering
experiment with reproducible positive and negative controls. This document
does not assert a cryptographic obfuscation construction or general 2.5× proof.

## Research question

Can an opt-in, multi-statement native JavaScript control-flow dispatcher add
structural complexity while preserving observable execution and remaining
within the 2.5× hot-compute budget on meaningful samples?

Existing return-only branch flattening is narrower than many ordinary
functions with callbacks, multiple statements, loops and shared import state.
This experiment adds an explicitly selected backend, retaining JavaScript
operators and original statements. It moves ordinary statements into shuffled
`switch` cases, reconnecting them with randomized state identifiers. Compound
native loops, switches, labels and try/finally constructs can remain intact as
single blocks. Top-level lexical bindings, async/generator functions, direct
eval, unproved statements and recognized source observations cause refusal.

## Reproducible artifacts

- [Source transformer](../src/statement-flow.js) and
  [public COO/SNO compiler integration](../src/core.js).
- [Real original CommonJS application](../examples/statement-flow/before/router.cjs),
  [actual generated switch dispatcher](../examples/statement-flow/after/router.cjs),
  and [deterministic generator](../examples/statement-flow/build.cjs).
- [Differential semantics and cross-backend refusals](../test/statement-flow.test.js).
- [Four-file imported-state ESM execution](../test/statement-flow-multifile.test.js).
- [Real Chromium native versus obfuscated execution](../test/statement-flow-browser.js).
- [Independent seedless reconstruction](../sims/statement-flow-recover.js) and
  [160-program seeded corpus](../sims/statement-flow-fuzz.js).
- [Alternating warm runtime profiler](../sims/statement-flow-profile.js).

The CLI accepts `--statement-flow entry.cjs:route` in COO/SNO.
`src/index.js` exposes `flattenStatementFlow` programmatically. The
SCO CLI intentionally refuses the experimental selector.

## Pinned validation evidence

The [Linux/Windows and Chromium run 43801792896](https://github.com/FlareZ123/obfs/actions/runs/43801792896)
passed at exact SHA `b8bff98ec65023a03b8c6458b12edb3eafb3b0fc`:

- Both Ubuntu and Windows Node 22 passed the selected CFG differential,
  explicit-refusal, CLI-parser, native branch-regression suites and strict
  `npm run typecheck`. Chromium matched 8,218 original and obfuscated
  evaluations, including external `window.hostApi.record` callbacks.
- Six alternating warmed measurements of 1,200,000 calls each, using an
  ordinary light callback: **1.407579× Ubuntu**, **1.230579× Windows**.
  For 100,000 calls that invoke native SHA-256 inside the host callback:
  **0.993458× Ubuntu**, **1.017031× Windows**. These are ratios of medians,
  with startup excluded. Neither sample represents a whole deployed app.
- An independent seedless AST attacker can parse the generated switch, read
  state labels and conditional transitions, and reconstitute an executable
  structured function from the published source. This attacker is independent
  of the seed and works under the full-control COO/SNO threat model.

The [extended Linux/Windows run 43802025641](https://github.com/FlareZ123/obfs/actions/runs/43802025641)
passed at source SHA `dd7def36bef1bfb54e89ea6a5d7d6ce0b3da6867`
after adding whole native loops, switches, labels and exception handler
support to the constrained CFG grammar. Its seeded generator built **160**
different multi-branch callback programs and tested **81,920 input/flag
pairs** for each native and compiled implementation: **81,920 / 81,920**
matched. The independent attacker also reproduced **81,920 / 81,920**
results, recovering all **160 / 160** layouts. The corpus generator is
deterministic, with initial xorshift32 state `0x37a90b1d`; replay it with
`node sims/statement-flow-fuzz.js`.

The [follow-up cross-platform run 43802270923](https://github.com/FlareZ123/obfs/actions/runs/43802270923)
passed after adding a real four-file stateful ESM graph, including a retained
public entry and an imported helper incrementing a shared counter. It checks
400 native and transformed sequential calls per module group.

## Security interpretation

This is a native control-flow obfuscation *compatibility* result. It does not
prevent static reconstruction: the supplied seedless attacker succeeds at
all tested outputs. A full-control adversary can also inspect state updates,
patch the dispatch variable, intercept imported callbacks, and execute a
reconstructed clone. Any claim of stronger tamper resistance would require a
different trusted execution boundary and an independent attack evaluation.

The function's source text, stack locations, and timing profile change.
Existing recognition of `Function#toString`, distributed source readers,
direct eval, unsafe lexical scopes and cross-file observation deliberately
refuses those transformations, but a full semantic proof for all JavaScript
is unavailable. An unknown source observer or user-defined instrumentation
could still distinguish compiled and original functions.

The 2.5× cap is conditional on the *whole workload*. Even the light callback
sample does not cover tiny inlined functions, cold parse cost, JIT tiering,
deoptimizations, many nested branches or real browser energy costs. A smaller
or different workload can exceed the cap. If code routinely measures its own
execution duration, source behavior may change even on an otherwise admitted
program.

## Open work

1. Expand corpus into more independently authored real-world call graphs,
   proxied objects, receiver-sensitive callbacks, and exceptional completion.
2. Add performance regression distributions for small hot loops and
   startup/cold scenarios, retaining direct native comparisons.
3. Quantify attacker reconstruction work across **unseen** generators rather
   than training against the exact published emitter.
4. Investigate substantial changes to trusted-server-private SCO architecture
   if actual confidentiality is the primary requirement; a different
   arrangement of public states alone cannot hide distributed source.
