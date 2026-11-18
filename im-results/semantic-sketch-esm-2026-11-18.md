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

The actual Chromium job at
[run 44213962271](https://github.com/FlareZ123/obfs/actions/runs/44213962271)
reported the **64-case ESM browser step successful**, including eight
genuine positive private-field rewrites; the full multi-step workflow was
still in progress at the time this report was first written, so this
step-level observation must not be mistaken for a completed full gate.

An incremental follow-up adds per-style rename/yield counts to future
script output. Existing aggregate data do not identify which of the
remaining 15 styles account for the other twelve rewrites. No inference
about those styles is made from the aggregate alone.

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
