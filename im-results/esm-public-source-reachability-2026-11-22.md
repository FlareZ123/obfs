# ESM externally reachable callable source: independent parity matrix

**Date:** 22 November 2026. **Status:** native witness confirmed; compiler red/green CI pending. Research-only branch `agent48/esm-source-reachability-20261122`, latest test change `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35`.

## Question and trust boundary

Can the property and identifier transformations preserve the exact observable behavior of an ESM module when an external consumer, absent from the source group passed to `obfuscateFiles`, inspects an exported function's `toString()`? The existing `closedWorld:true` flag is an integrator claim of a complete relevant distribution unit. It does not establish closure with respect to unknown external runtime consumers; deployments that genuinely exclude outside observers have a narrower contract.

ECMA-262 `Function.prototype.toString` returns original source text when available. JavaScript consumers can observe ordinary exported callables via direct named imports, aliases, reexports, default exports, class methods and reachable containers. The same compiled output can preserve return values yet fail exact `toString()` parity.

## Reproduction

`test/esm-public-source-reachability.test.js` is a Node 22 differential matrix across COO/SCO/SNO, with six distinct externally reachable shapes:

1. `export {read as publicRead}` where `read()` captures a private object field.
2. An immutable arrow alias `export default read`.
3. `export class Api` with a method reading a private own field.
4. A one-hop ESM `export {read as publicRead} from './private.mjs'` relay.
5. A function held inside an exported array.
6. An aliased named export where the exposed function's parameter spelling may change.

The native and transformed groups are written into isolated temporary ESM directories using `atomicWrite`, then executed in a fresh Node subprocess with the observer module. The observer is intentionally **not** passed into the compiler. The tests log per-case native/generated source equality, runtime-value equality and actual field/binding rewrite counts. External callable source parity is mandatory. A compiler may pass by declining unsafe edits; this is a valid compatibility outcome with no corresponding protection yield. Three additional mode-specific controls require **positive local property-renaming yield** for a separate private nonescaping function and check native output.

## Independently checked native observer contract

The six original cases execute successfully on Node 22.16.0 in the local runtime. In particular, the named alias returns `function read(){return owner.secretField;}` and 11, the default arrow returns `()=>owner.secretField` and 17, the class method returns `read(){return owner.secretField;}` and 23, the ESM relay returns the named function source and 31, the array member returns the function source and 37, and the named parameter case returns `function read(secretParam){return secretParam+1;}` and 10. This verifies the *native fixture construction only*. It does not yet verify compiler behavior or the acceptance suite.

## Validation

A workflow was dispatched on the initial branch through existing `.github/workflows/manual-source-proof-triage.yml`, which runs Node 22 on Ubuntu and Windows and adds the external callable matrix after its other source-proof checks. The first version incorrectly required positive rewrites in every exported-callable case; corrected test commit `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35` separates behavioral parity from yield. **Only a source-pinned run at or after the correction qualifies for this contract.** Run id, platform results, and actual source transformation counts remain pending.

## Interpretation and next action

Compare the first source-pinned CI mismatch against Agent 8's independently reproduced direct ESM export-source witness. Do not infer a new defect from a zero-rewrite safe refusal. A candidate source-preservation fix needs to maintain all source-visible bytes of a reachable exported callable, including nested function segments and affected identifiers, while still offering safe rewrite yield in the unrelated private control.

This intermediate compatibility study does not demonstrate confidentiality, anti-instrumentation, environment locking, or the required universal 2.5x runtime budget. The current RELEASE-BLOCKED security decision remains unchanged.

## First source-pinned GitHub Actions evidence

[Run 44980789682](https://github.com/FlareZ123/obfs/actions/runs/44980789682) executed the initial fixture matrix on `d5867d328490bbcdea4e89e4de107d115ed7ad4f` (prior to the rewritten-coverage acceptance correction). On **Windows**, the target matrix reached all 21 tests. It recorded **18/18 externally observed source mismatches**, each with an actual positive source rewrite (`rewriteCount:1`) and unchanged ordinary return value (`valueEqual:true`). The three private nonescaping property-yield controls passed across COO/SCO/SNO. Direct logs include the SNO class method changing `owner.secretField` to `owner._p7dab32725b`, the SNO reexport function changing it to `owner._p6442aa44db`, and the SNO exposed parameter `secretParam` becoming `_ve2d1a5128695`.

On **Ubuntu**, earlier native, source-island, and real Chromium steps completed successfully, but an independent `CacheStorage browser source-byte observation counterfactual and admission` step failed **before** this newly appended matrix. Do **not** report an Ubuntu parity outcome from this run. Both jobs consequently failed the workflow, for **different reasons**.

The matrix was subsequently corrected in `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35` to allow safe refusal of public source edits while retaining private positive-yield assertions. The existing workflow reorders the new step before the unrelated CacheStorage step in `085627426b9add2b005fc66e4c37d89490c8b8a1`. A new validation workflow was dispatched at that corrected branch head; its result must be recorded independently rather than inferred from the earlier run.

## Corrected Ubuntu and Windows cross-mode matrix: fully reproduced

The corrected [source-pinned validation run 44981145682](https://github.com/FlareZ123/obfs/actions/runs/44981145682) on commit `085627426b9add2b005fc66e4c37d89490c8b8a1` reached the standalone ESM external-source matrix **on both Ubuntu and Windows Node 22 runners**, ahead of the unrelated browser CacheStorage step. Each platform recorded **21 tests: 3 pass, 18 fail**. Both failed jobs identify exactly the independent external ESM callable source observation matrix as the failing workflow step.

The six externally reachable export shapes each failed source parity in all three COO/SCO/SNO variants, with positive source edits and ordinary returned values unchanged. The three separate nonescaping, private-function property-rewrite controls passed in all three modes. The Windows job ID was `137081689154`, Ubuntu `137081689448`. The logs show representative differences such as `owner.secretField` becoming `owner._p...` in exported class/reexport/array methods and exposed `secretParam` becoming `_v...`.

This cross-platform failure is an intentionally retained **red-first compatibility regression**, not evidence that the branch itself introduced a new compiler defect. The branch contains a test and workflow-step ordering adjustment, with **no compiler implementation change**. Source parity for an undeclared external importer remains an integrator-contract boundary worth resolving: conservative refusal is a legal semantic solution when the importer is part of the intended behavioral contract. Any implementation fix and positive private-yield preservation must be tested at the same merged source commit.

**Correction of prior pending status:** the second cross-platform CI result is now confirmed. The release/security decision remains **RELEASE-BLOCKED**.

## Actual Chromium external-importer reproduction

A third [source-pinned CI run 44981422142](https://github.com/FlareZ123/obfs/actions/runs/44981422142), exact workflow source `d86e96ac2728ea74c10fa9c3d2a749f3f00fac32`, added `test/esm-public-source-browser.js` to the existing manual source-proof workflow. The **Ubuntu Chromium** job passed the new standalone browser red-witness step; its script demands **18/18 externally observable ESM `Function#toString` source differences**, **18/18 matching ordinary return values**, and **18/18 genuinely rewritten fields/bindings** across all six named export shapes × COO/SCO/SNO. The step executes real headless Chrome via localhost HTTP modules with an importer not included in the compiler group.

The same source run failed the dedicated Node semantic-acceptance matrix on **both Ubuntu and Windows** (expected red). The Windows browser step was skipped by the OS predicate, as required; its 18 Node cases still failed exact source-parity. The Linux source-island real-browser predecessor step was green. No compiler implementation file was modified.

This paired positive/negative evidence separates an observation of compiler **incompatibility** under externally callable source semantics from the otherwise successful ordinary-value and private-field rewriting. The browser diagnostic intentionally asserts that mismatches exist; it must be changed to assert source equality when a fixed compiler is under review. The Node acceptance tests already enforce parity and need no inversion.
