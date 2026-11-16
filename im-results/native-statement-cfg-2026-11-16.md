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

## Measured full-client static attack and direct tamper

A later [Linux/Windows/Chromium targeted run 43804565469](https://github.com/FlareZ123/obfs/actions/runs/43804565469)
passed at immutable source SHA `ebb1c5dc0ef7a654fc269f1498200cd4c160bd44`.
The attacker used only each of 80 different *fully layered*, public COO
outputs, including ordinary identifier/property/string transforms and
browser-host guard. The separate `sims/statement-flow-attack-cost.js`
recovered **80/80 executable source clones**, with **20,560/20,560**
held-out checks matching their originals. It received neither the original
source nor compiler seed as an attack input; the native version was used for
independent outcome comparison.

| Metric | Node 22 Ubuntu | Node 22 Windows |
| --- | ---: | ---: |
| Median source-only recovery wall time per protected function | 0.176901 ms | 0.178900 ms |
| 95th-percentile recovery wall time | 0.405328 ms | 0.401900 ms |
| Total automated recovery time, 80 variants | 18.154134 ms | 17.163700 ms |
| Original AST parse median | 0.056947 ms | 0.059000 ms |
| Original source bytes | 92 | 92 |
| Delivered layered median source bytes | 769 | 769 |

These parser measurements are local Node wall timings using an attack routine
*designed for this published emitter*. They exclude an adversary's initial
engineering effort and do not establish the cost of unanticipated tools or
larger functions. They do establish a strong **negative control** against
claims that the tested state randomization or host guard obstructs automated
program reconstruction.

The same run executed `sims/statement-flow-tamper.js`: a public-source
attacker changed a single `score += 31` instruction into `score += 32`
without any compiler secret or state-map knowledge. **129/258** control
inputs changed their returned values and **129/258** retained their
values, while all branch event hooks remained identical. This validates an
unauthorized mutation within the distributed COO code. It makes no
claim about SNO launcher digest checks, which have their own separately
documented filesystem-control bypass boundary.

The run also passed the full 8,218-observation Chromium comparison of
original, switch-lowered, and standard-layered+host-locked ESM modules.
Its nine-batch `vm.Script` cold compile median ratios were **1.681×
Ubuntu / 1.610× Windows**. Cold compile measurements isolate V8 compiler
startup and should not be treated as end-to-end browser loading cost.

## Tight CPU-loop counterexample: budget violation

A further [Linux/Windows targeted run 43804836672](https://github.com/FlareZ123/obfs/actions/runs/43804836672)
passed all workflow stages, including the deliberately **non-enforcing**
`sims/statement-flow-pure-hot.js` performance diagnostic. A generated
82-byte native arithmetic function and its 596-byte flattened counterpart
were each invoked 12 million times per trial, with six alternating warm
trials and matching checksums:

| CPU-only metric | Node 22 Ubuntu | Node 22 Windows |
| --- | ---: | ---: |
| Original median, 12 million calls | 56.282205 ms | 56.7162 ms |
| Flattened median | 121.702815 ms | 157.7443 ms |
| **Hot compute slowdown** | **2.16237×** | **2.78129×** |
| Meets project 2.5× hard requirement | Yes, sampled | **No** |

The Windows result is a reproducible counterexample for the current
opt-in experimental backend. A fast whole-application benchmark with
expensive host callbacks cannot validate a universal bound on hot-path
function overhead. Do not automatically enable this backend for
high-frequency small arithmetic functions; performance profiling and
runtime-specific admission are essential.

**Research decision:** The existing backend remains an opt-in,
executable negative-control experiment in `im-results/`. Its full-control
static reconstruction has already succeeded, and a measured Windows
workload violates the hard hot-compute budget. Under the current evidence,
it is inappropriate to promote this backend as a general preferred
obfuscation strategy or claim robust resistance to either static recovery
or runtime tampering. New work should prioritize trusted SCO withholding
and clearly bounded whole-session measurements rather than additional
state-label randomization.

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
