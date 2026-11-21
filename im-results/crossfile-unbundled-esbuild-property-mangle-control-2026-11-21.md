# Same-distribution esbuild property mangling versus conservative closed-world renaming

**Agent 7, 21 November 2026. Bounded negative advantage and compatibility evidence.** Complements Agent28's already source-pinned *bundled* esbuild property-mangling comparator `test/cross-file-property-mangle-control.js`. This experiment preserves the actual **three-file, unbundled ESM delivery** of `test/cross-file-imported-identity-browser.js` for every variant.

## Decision question

The compiler can safely remove both `secretField` and `otherField` from the current three-module imported-identity graph under its strict closed-world proof, while ordinary default `esbuild transform({minify:true})` leaves both labels. Does the result still have a unique *static label-hiding* advantage over a properly configured, equal-trust **unbundled** esbuild control?

Official esbuild [property mangling documentation](https://esbuild.github.io/api/#mangle-props) provides `mangleProps`, `mangleCache` and an explicit warning that renaming is unsafe for arbitrary property reflection and potentially inconsistent across independent compilation boundaries. The comparison does not rely on esbuild being unable to mangle private names.

## Frozen three-module fixture

Each input graph has a source module exporting `state={secretField:17,otherField:5}`, an independently imported immutable `identity` helper, and an entry point that reads the private record through either a one-hop or three-hop immutable relay. The third, *reflective* graph calls `Object.keys` on that record and is a negative for semantic property rewriting.

The four distributed variants are:

1. Original ESM.
2. Ordinary **default** unbundled esbuild `transform(...,{minify:true})`, one transform for each module.
3. **Configured** unbundled esbuild `build({entryPoints:[all three],bundle:false,write:false,minify:true,mangleProps:/^(secretField|otherField)$/,...})` with an explicit **stable** `mangleCache:{secretField:'a',otherField:'b'}` for every output module.
4. The compiler's closed-world private-key output with no identifier- or string-mangling extras.

Every variant retains the **three .mjs files**, original ESM import topology and identical browser-visible entrypoint. This avoids the delivery architecture change made by a bundling comparator. A single esbuild API call serves all modules in the configured arm, with a manually chosen two-name cache that ensures cross-module key identity.

## Red-to-green mapping evidence

The **unconfigured mangle cache** is a measurable cross-file compatibility trap. A first emitted-source inspection at exact source `018b0aac8f67ed4d57ddb7a2a38c3f1008c776c2`, [red Chrome CI 44947612797](https://github.com/FlareZ123/obfs/actions/runs/44947612797), showed a single `bundle:false` multi-entry `build` mapping the state object's fields to `{t:17,e:5}` while the entry accesses `result.t` and `result.r`. The **second field was mismatched**, and the real browser detected an output disagreement at the first held-out input. An earlier run [44947488366](https://github.com/FlareZ123/obfs/actions/runs/44947488366) observed the same first-input mismatch but did not yet log emitted code. This is an empirical finding for esbuild 0.28.2 with the exact options in this repository; it should not be generalized to bundled builds or other versions without testing.

Giving esbuild a global explicit two-name `mangleCache` resolved the mismatch **without changing the input graphs or browser fixture**. [Source-pinned Ubuntu/Windows Node 22 and real Chrome 157 CI 44947700905](https://github.com/FlareZ123/obfs/actions/runs/44947700905), executable SHA `c5c3a86b6c0bb32d4e10de144f01314699d48b77`, finished **success** with strict core and cross-file JSDoc, 41 focused property proof tests per OS and both the prior bundled and new unbundled real-browser comparators.

## Chrome results on the exact same source

| Dimension | Original | Default esbuild minifier | Configured unbundled esbuild | Closed-world compiler |
| --- | --- | --- | --- | --- |
| Positive one-hop source keys retained | Both | Both | Neither | Neither |
| Positive three-hop source keys retained | Both | Both | Neither | Neither |
| `Object.keys` negative exposes original keys | Yes | Yes | **No, unsafe change** | **Yes, safe refusal** |
| 100,000 held-out positive inputs | Reference | Exact parity | **Exact parity** | **Exact parity** |
| Three-module unbundled output | Yes | Yes | Yes | Yes |
| Runtime inspected under hostile-client capability | Public | Public | Public | Public |

In the [exact Chrome result](https://github.com/FlareZ123/obfs/actions/runs/44947700905), the one-hop/transitive graph and negative were checked on 4,096 additional inputs before measurement. A later independent 100,000-input loop verified equality for both positive graphs and the proof-preserving reflective negative. The deliberately unsafe configured-esbuild reflective output has changed `Object.keys`, with its numeric read value still correct; that is a **negative control**, and is excluded from the positive parity claim. The test observed **768 primitive host callbacks** across all four warmed benchmark variants.

Across twelve rotated-order 100,000-call real-Chrome work trials, the compiler/native measured median ratio was about **1.000×** and the compiler/configured-esbuild-mangle ratio **1.067×**, with **0/12 measured strict >2.5× breaches** against either. Selected work medians around **0.75–0.8 milliseconds** and 0.1-ms browser timer granularity mean small differences are poorly resolved. Module delivery, cold startup, network, JIT warmup and esbuild build-time costs are not included in these selected-work measurements.

## Bounded security and engineering conclusion

**For this frozen closed-world graph, neither static label removal nor warm selected-work cost establishes an advantage over a correctly configured esbuild property-mangling control.** Both outputs hide both original semantic field labels, and each distributed module can be read, inspected and modified by a COO adversary. Program reconstruction remains a separate attack experiment.

The conservative property proof does establish a useful **automatic semantic-safety selection** distinction on this fixture. Without a manual risk decision, a blanket esbuild property rule renames the reflective record and breaks its observable keys; the compiler refuses that rewrite. Esbuild can also preserve reflection with an appropriately chosen per-graph reservation policy, but that policy requires explicit programmer knowledge beyond the `mangleProps` regex. A valid proof of the compiler's better *general coverage* requires a substantially broader, same-source corpus with equally competent manually configured controls, which is not provided here.

This report changes no threat-model claims for SCO/SNO and provides no general 2.5× performance guarantee. Keep the primary strong-obfuscation release **RELEASE-BLOCKED**.

**Reproduction:** `test/cross-file-imported-identity-browser.js`, existing workflow `.github/workflows/manual-imported-identity-alias.yml`, source `c5c3a86b6c0bb32d4e10de144f01314699d48b77`, [successful CI 44947700905](https://github.com/FlareZ123/obfs/actions/runs/44947700905). No new CI workflow was introduced.
