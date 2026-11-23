# Exported instance prototype source: incomplete closed-world boundary (23 November 2026)

**Status:** reproducible intermediate compatibility evidence, not an established strong-obfuscation result. **Release impact:** none beyond the existing RELEASE-BLOCKED decision. No source compiler changes are proposed by this experiment.

## Question

Does an exported class instance expose the original property token inside its prototype method source when a separate ESM consumer uses `Object.getPrototypeOf(instance).read.toString()`? What changes when the consumer is included in the compiler's declared ESM graph?

The compiler's `closedWorld:true` flag is an **integrator assertion** requiring all relevant direct consumers and public callable/source contracts to be accounted for. An undeclared importer intentionally violates that requirement. Do not characterize this case as a defect under a satisfied closure contract.

## Reproducer and source pins

- Initial negative fixture: `test/external-instance-prototype-source.test.js` at branch commit `25b4d21d7b32e86c3e64bf087eec794e564b4bd2`; [manual focused run 45096903772](https://github.com/FlareZ123/obfs/actions/runs/45096903772).
- Expanded paired fixture on the same unmerged branch `agent9-exported-instance-source-20261123`: `0f1ba7d0a2035abe5fff251f657cafc3896bd281`; [manual focused run 45097023921](https://github.com/FlareZ123/obfs/actions/runs/45097023921).
- Both runs execute real Node.js **22.23.4** ESM child processes under Ubuntu and Windows, installing declared dependencies with `npm ci`. The fixture uses `obfuscateFiles`, `closedWorld:true`, `properties:true`, `identifiers:false`, `strings:false`, distinct fixed seeds for COO and SNO, and exact native-versus-generated object comparison.

The source graph has `owner.mjs` exporting `{secretField:7}`, `state.mjs` defining `class Reader {read(){return owner.secretField;}}` and exporting `new Reader()`, and an independent `private.mjs` literal-record positive value. The consumer reads both numerical results and the exact source text of the instance's prototype method.

## Observations

| Declared input set | COO | SNO | Interpretable boundary |
| --- | --- | --- | --- |
| Three input ESM files, consumer written only after compilation | 2 property rewrites; numerical values preserved; source changed to `read(){return owner._p1fb9e4aefe23;}` | 2 property rewrites; numerical values preserved; source changed to `read(){return owner._p70c5582db556;}` | Incomplete closure. Native `read(){return owner.secretField;}` differs because the external source-observing consumer was not declared |
| Same three files plus the observing `consumer.mjs` included in compiler inputs | 0 property rewrites; exact native/compiled object equality | 0 property rewrites; exact native/compiled object equality | The recognized source observer causes a conservative graph-level refusal, preserving the tested source observation |

The expanded focused run had three passing assertions (declared-graph parent and two mode subtests) and three failing assertions (the deliberately stricter incomplete-graph parent and two mode subtests) on **each platform**. The focused CI is **red by design** because the same source-equality assertion is imposed on the deliberately incomplete graph. The branch is not suitable for direct mainline merge as a green regression gate.

## Interpretation and next work

This is a **semantic deployment-boundary witness**: a host consumer outside the asserted closed graph can observe source spelling changes while the application values remain equal. It does **not** demonstrate unauthorized source extraction under SCO, resistance to runtime control, general external-consumer safety, or a speed result.

A deployer should inventory external imports and public method-source contracts before enabling optional property rewriting. Where those consumers are unknown, the conservative option is to leave the affected public implementation unmodified.

The declared-observer case shows compatibility at the cost of **zero property rewrites in this selected graph**. A future selective source-observation proof should keep exact parity in this fixture while recovering only demonstrably independent private edits, with additional native/compiler comparisons and nonzero protected-work yield. Do not interpret an all-refusal green result as stronger obfuscation.

The initial standalone witness `sims/public-instance-source-probe.js` exists on main; this branch adds source-pinned Ubuntu/Windows automated comparisons, including the declared-consumer control. Relevant specifications: `docs/CLOSED_WORLD_PROPERTY_PROOF.md`, `docs/SECURITY.md`.
