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

The expanded focused run had three passing assertions (declared-graph parent and two mode subtests) and three failing assertions (the deliberately stricter incomplete-graph parent and two mode subtests) on **each platform**. The focused CI is **red by design** because the same source-equality assertion is imposed on the deliberately incomplete graph. That initial red fixture is intentionally retained as a source-pinned counterexample. A subsequent revised test removes the uncontracted source-parity assertion while retaining declared-graph parity and an independent positive private-field yield requirement.

## Interpretation and next work

This is a **semantic deployment-boundary witness**: a host consumer outside the asserted closed graph can observe source spelling changes while the application values remain equal. It does **not** demonstrate unauthorized source extraction under SCO, resistance to runtime control, general external-consumer safety, or a speed result.

A deployer should inventory external imports and public method-source contracts before enabling optional property rewriting. Where those consumers are unknown, the conservative option is to leave the affected public implementation unmodified.

The declared-observer case shows compatibility at the cost of **zero property rewrites in this selected graph**. A future selective source-observation proof should keep exact parity in this fixture while recovering only demonstrably independent private edits, with additional native/compiler comparisons and nonzero protected-work yield. Do not interpret an all-refusal green result as stronger obfuscation.

The revised green fixture `8929f6d456f70914e854c7b41acdce5d6f8422ae` passed the [focused Ubuntu/Windows gate 45097154104](https://github.com/FlareZ123/obfs/actions/runs/45097154104), including both strict project and external JSDoc checks. It was integrated on main as `test/external-instance-prototype-source.test.js` in `564a696a4cde0ad1e29f47b73c065bb7b5b88a59`. That test permits the external undeclared observer to differ while requiring exact declared-graph parity and isolated private-field rewrite yield. It does not certify the current moving main until a separate source-pinned validation.

The initial standalone witness `sims/public-instance-source-probe.js` exists on main; this branch adds source-pinned Ubuntu/Windows automated comparisons, including the declared-consumer control. Relevant specifications: `docs/CLOSED_WORLD_PROPERTY_PROOF.md`, `docs/SECURITY.md`.

## SCO actual HTTP publication follow-up (23 November 2026)

The same prototype-reachable method source is observable through a **declared, served** ESM entry under SCO. `test/sco-instance-prototype-source.test.js` uses real HTTP GET responses from `createScoHandler(files,{closedWorld:true})`, writes each received module to a separate directory using atomic file replacements, then runs the resulting ESM graph with Node 22.23.4. The graph exports a `new Reader()` instance whose prototype method accesses a named imported field, and the served entry obtains `Object.getPrototypeOf(instance).read.toString()`.

- The declared observer case retains native JSON values and exact source spelling.
- A separate non-source-observing entry retains native numeric behavior (no incremental renaming claim is made for that case).
- [Focused Ubuntu/Windows gate 45097567690](https://github.com/FlareZ123/obfs/actions/runs/45097567690) passed both platform jobs and strict project/external JSDoc checks at branch source `5539d5cf739bb5d3e342416949cf3b6c966df992`.
- Integrated `test/sco-instance-prototype-source.test.js` to main in `bb611324b6ad4dc67576e1f9193a68f15d2d2104`.

This extends the **compatibility** control from prebuilt COO/SNO to real SCO publication. It does not establish a hostile-client confidentiality, integrity, or query-oracle advantage; the served graph exposes the prototype method by design.

## Mainline correctness integration pin

At exact source `a277fcbe1027656eee43c4422bb594acfe711e0e`, the [manual full Node 22.23.4 Ubuntu/Windows and Ubuntu Chromium gate 45097373277](https://github.com/FlareZ123/obfs/actions/runs/45097373277) **passed** both platform jobs, strict project/external JSDoc, the complete Node behavioral/adversarial runner, sampled performance checks, and the workflow's real-browser checks. This source includes the integrated COO/SNO instance-source test and predates the subsequent SCO-specific test and this report update; it cannot certify those later changes or arbitrary workloads. A successful correctness gate does not alter the project's primary RELEASE-BLOCKED security decision.
