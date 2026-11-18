# Seeded multi-file semantic sketch evaluation with genuine property yield

**Agent 5, 18 November 2026. Classification:** intermediate,
source-pinned differential evaluation of the existing COO property compiler.
This is a compatibility/measurement contribution and is **not** evidence of
deobfuscation resistance or authorization security.

## Motivation and frozen procedure

The project already has an interfile API fuzz covering six reflection/host
patterns and extensive hand-constructed source-observer tests. This
additional experiment varies **the context in which an owned object is
observed**, including awaited continuations, proxies, property descriptors,
callbacks, prototype inheritance, cloned objects, computed keys and
exception messages. A source-equivalent compiler must preserve the entire
observable return trace for native and generated code.

The deterministic [generator](../sims/semantic-sketch-esm.js) creates
three-file ESM graphs with unique directories per case:
`state.mjs` exports an object with two seed-specific private fields;
`worker.mjs` performs one of 16 source sketches and returns a JSON-safe
result and side-effect trace; `entry.mjs` reexports the exercise function.
The same sketch source is run natively and as the **actual**
`obfuscateFiles({mode:'coo',closedWorld:true,strings:false,identifiers:false})`
output using fresh Node ESM loader processes. Exceptions become structured
name/message observations, and every side effect explicitly added to the
trace must match.

A deliberately positive `owned-direct` variant for each seed requires
at least **two actual cross-file property rewrites**. This prevents a
completely unchanged compiler from claiming a passing yield result.
Other sketches are not required to transform unproved object keys:
conservative refusal can be the correct semantic decision.

A separate [real Chromium check](../test/semantic-sketch-browser.js)
hosts both the native and emitted versions of four seeds of the same
16-variant corpus. Their distinct URLs load real ESM graphs through
HTTP; the page imports both variants, compares function results and
side-effect observations and emits one exact marker only if all agree.
It also demands genuine rewrites in each positive variant.
The browser test is run in the existing Linux-only manual semantics
workflow, independent of a simulated DOM.

## Initial source-pinned measurements

The complete two-platform [manual transformation semantics run
44213469530](https://github.com/FlareZ123/obfs/actions/runs/44213469530)
passed on Ubuntu and Windows at exact source
`600e21cc8025f074822db0fc0d33c6a373eb0b81`.
Both systems printed the same observation:

- **96 three-file ESM graphs** (six deterministic seeds and 16 sketches).
- All **96 native/emitted result and trace comparisons** matched.
- Six positive graph controls had **12 genuine renamed properties**.
- **24 of 96 graphs** had one or more private-field rewrites.
- **72 of 96 graphs** had zero such rewrites; this is not a compiler
  correctness failure on potentially unsafe/reflected contexts.

The 16 cases include a direct positive and alias/parameter/async variants,
`Reflect.ownKeys`, descriptor reads, proxy key capture, global dynamic
keys, object spread, `structuredClone`, invalid-descriptor TypeErrors,
`for..in`, destructuring, `Object.hasOwn`, prototype inheritance,
and a computed `Object.keys` walk. Exact variations and seeds are
in the committed generator. No random claims or hidden source mutation
are used in these observations.

## Full cross-platform confirmation, style coverage and attack control

The [complete manual transformation safety run
44214634993](https://github.com/FlareZ123/obfs/actions/runs/44214634993)
**passed both Ubuntu and Windows** at immutable checkout
`f5f9466ef1ffea36007dc201df15de8e774ca1f4`,
after correcting two strict JSDoc HTTP-harness callback annotations in a
prior red CI. The complete run includes all existing transformation
regressions and typechecks as well as the new studies.

The expanded seeded Node output independently recorded this same
per-style yield on both platforms:

| Six graphs per context | Private-field renames | Graphs with any renaming |
| --- | ---: | ---: |
| Owned direct lookup | 12 | 6 |
| Same-module alias | 12 | 6 |
| Local parameter callback | 12 | 6 |
| Await then static property | 12 | 6 |
| All twelve reflective, dynamic-key, proxy, clone, descriptor, inherited and related contexts, combined | 0 | 0 |
| **Total** | **48** | **24** |

The direct-positive subset still accounts for twelve of the 48
rewrites. All 96 native/emitted trace pairs matched. The zero-rename
contexts represent conservative compiler behavior on this corpus; no
claim that all are fundamentally unrenamable follows.

The independently constructed source-only parser in
[`sims/semantic-sketch-static-control.js`](../sims/semantic-sketch-static-control.js)
was given **only the distributed state-module text** and the declared
two-number/no-input challenge family, without original property names
or a seed. Its Acorn AST pass reconstructed the complete return values
for **6/6 actual compiler-emitted positive cases**, each with two
verified private-property rewrites. The same reader reconstructed
**6/6 ordinary esbuild-minified control cases**. The six emitted state
modules totalled 367 bytes versus 391 for the minified state modules;
these are partial module sizes, with no overall distribution-size or
runtime conclusion. This demonstrates a precisely bounded static
reconstruction failure of these protected positives relative to the
minification control. The attack assumes advance knowledge of the
two-number challenge family and does not recover an arbitrary program.

The real Chromium step from the same successful workflow loaded **64**
native/emitted sketch pairs as actual independently hosted ESM graphs,
with **8** verified private-field rewrites in four positive graph
controls. All 64 Chromium result/trace comparisons matched, and strict
JSDoc passed on both Node platforms. The subsequent independently pinned
[full Ubuntu/Windows semantics run 44215116463](https://github.com/FlareZ123/obfs/actions/runs/44215116463)
passed at exact source `d25908fd29bba7d48ef29f806abfab3468b98987`.
Its Ubuntu real Chromium step loaded a **third, source-only recovered ESM**
module for each of the four browser-positive cases and verified all four
against both native and protected outputs in the same tab:
`cases:64, positiveRewrites:8, recoveredClones:4`.
This confirms the narrowly declared no-input public-state reconstruction
also executes correctly as real browser modules, without acquiring
original private key names. It is not an arbitrary-program attack.

## Security and cost boundaries

This suite tests **behavioral parity on a finite, designed corpus**.
It cannot prove preservation under all host APIs, lexical features,
malicious inputs or reflective operators. A passing `owned-direct`
rename merely changes public field names; source-only attackers can
still read the published JavaScript and inspect it in DevTools.
No independent static attacker, conventional minifier comparator,
runtime extraction cost, browser workload cost or universal 2.5x CPU
budget is measured here. The 16-context methodology is compatible
with, but materially smaller than, independent JavaScript
obfuscator fuzzing research such as
[OBsmith](https://arxiv.org/abs/2510.10066).

The result belongs in intermediate evidence. Further tests should
preserve source-pinned positive yield, group data by context, add
truly held-out seeds, and evaluate actual static reconstruction and
full-session compute before drawing a protection verdict.
