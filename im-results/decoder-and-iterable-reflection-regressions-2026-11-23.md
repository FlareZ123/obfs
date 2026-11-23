# Two-mode ambient-decoder and reflective-owner adversarial regressions (23 November 2026)

**Agent 17. Classification:** Compatibility test coverage and conservative positive-yield verification; no newly established defect, no new protection result, and no security promotion. Current strong-protection verdict remains **RELEASE-BLOCKED**.

## Cross-file mutable decoder hazards

The new `test/string-global-alias-decoder-observer.test.js` loads three actual CommonJS files in a fresh Node `vm` realm. The entry invokes a side-effect module first and a target module afterwards. The target exports a substantial ordinary string literal that the compiler would normally encode with the runtime `String.fromCharCode` decoder. The side-effect module probes six mutation channels:

1. local direct `String` constructor alias;
2. `globalThis` ordinary property storing `String`;
3. `globalThis` property getter returning `String`;
4. dynamically computed global `eval` alias (`globalThis[key](...)`);
5. dynamically computed global `Function` constructor alias;
6. dynamically computed global evaluator stored in a local variable, then called.

The last three hide the sensitive `String.fromCharCode` write inside dynamically evaluated source, not an ordinary syntactically visible property assignment. They exercise a meaningful failure mode: if the compiler emitted its decoder into a later module, the now-modified global decoder could return the wrong string, despite unchanged user-visible literal bytes in the original module. The fixture compares original versus emitted module return values in isolated realms **and** checks the target's `metrics.literals===0` after each mutation. A positive graph with no mutation requires `metrics.literals>0` and same result. Both COO and SNO were exercised: **12 mutation combinations plus one positive case**.

**Result:** all thirteen tests passed; the existing compiler did conservatively disable unsafe later decoding while retaining safe encoding on the clean graph. This is not a discovered vulnerability, and it does not prove safety for arbitrary unknown host getters or future loader mutations. It supplies an additional reproducible source-observation/mutation regression. The exact mainline [Ubuntu+Windows focused run 45117741959](https://github.com/FlareZ123/obfs/actions/runs/45117741959) **passed** at `98a38c8fd727e6890d7dbd65b4583aa8b97db9cf`, including all thirteen runtime cases, normal project and external strict JSDoc. Initial isolated branch run [45117599294](https://github.com/FlareZ123/obfs/actions/runs/45117599294) also passed at `bb46d65de16f7e0dd745aa4f01a31878dfd506f8`.

## Private object through iterable and reflection APIs

`test/property-iterable-owner-reflection-fuzz.test.js` generates 24 deterministic flow shapes, each with two modes and five independent build seeds: **240 compiled executions** compared against original clean-realm JSON results. The source object has two private-looking own keys; a reference to it travels through a one-element array or an API result before a reflective observer calls `Object.keys(ref)`. Methods cover direct index, `at`, `find`, `findLast`, `filter`, `map`, `reduce`, `slice`, `concat`, `toReversed`, `with`, `flat`, spread, destructuring, `Array.from`, array iterators/values, `Set`, `Map`, `Object.values`, `Object.entries`, `Reflect.apply`, `Object.assign` cloning and object destructuring.

The reflection is deliberately an external **key-spelling observer**: renaming a member without rewriting every reachability and reflective use would change the return value even if all numerical member reads were updated consistently. The test does **not** demand all these flows be rewritten; it requires exact native/emitted results and permits a conservative refusal. A separate non-reflective scalar private owner must still be renamed (`metrics.objects>0`) in both modes, so the suite is not vacuously green under blanket no-op conversion. Node 22 supports the modern iterator/array primitives used here.

**Result:** no semantic counterexample was observed in the 240 seeded transformations, and the private positive control retained nonzero rewrite yield. The exact mainline [Ubuntu+Windows focused run 45118309358](https://github.com/FlareZ123/obfs/actions/runs/45118309358) **passed** at `3de092c5a47a30f9ca33c04c5865149c4d387571`, including the full 240-case corpus, private positive control and strict project/external JSDoc. The isolated branch proof [45118141764](https://github.com/FlareZ123/obfs/actions/runs/45118141764) passed earlier at `da8dc932b8d5897fac5440c39420c7ebc9afd2f9`.

## Boundaries and next validation

These bounded tests do not show that either COO or SNO becomes confidential against a public-source/runtime owner, that host locking resists instrumentation, or that application compute stays universally under 2.5×. Cross-file decoder fixtures are actual three-file CommonJS graphs; the iterable-owner corpus is *single-file CommonJS* with two compiler modes and cannot establish cross-file imported-identity safety by itself. Existing repository ESM and multi-file tests cover complementary cases. The source pins above are **focused**, not a restored postmerge full Node/Chromium release admission. See the Critic's 23 November 04:48 integration stopline and the Agent10-led full-suite reconciliation.

Preserve both suites in main to catch future unsafe source-observer or property-flow edits. If future transformations add real protected yield to these cases, a new source-pinned native/compiled parity and equal-trust adversarial comparison would be needed before interpreting that yield as security.
