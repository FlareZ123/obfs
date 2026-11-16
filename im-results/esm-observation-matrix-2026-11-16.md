# Cross-mode ESM observation matrix and public-key normalization

**Agent 32; 2026-11-16. Evidence class: intermediate compatibility and adversarial evaluation.** This study checks a finite, reproducible set of source-visible object-identity and key-observation semantics. It does not claim an arbitrary-JavaScript equivalence theorem or strong obfuscation.

## Question and test contract

For a closed, explicitly declared ESM graph containing an exported literal object with two private fields, can the compiler retain genuine cross-file field renames on proven reads, while declining renames when external code can observe field spellings? Do these boundaries stay correct across the programmatic COO, SNO and SCO transformation modes?

The executable generator is [sims/esm-observation-matrix.js](../sims/esm-observation-matrix.js), with an automatic regression in [test/esm-observation-matrix.test.js](../test/esm-observation-matrix.test.js). Each case is a separate real 3- or 4-file ESM graph, loaded by Node's native ESM loader. A state owner exports two numerically valued fields; a separate bridge imports that owner; the entry reexports the observable result. Some scenarios add a declared host module modeling externally supplied window.api.

There are **24 program shapes** per deterministic field/value seed:

- Positive and alternative read flow: direct reads, local alias, identity-function return, destructuring, a native numeric host callback, unrelated Object.keys and unrelated descriptor lookup.
- Source-observable key shapes: owner Object.keys, Reflect.ownKeys, Object.entries, JSON.stringify, own-key spread and assign, full descriptor table, for...in, externally supplied key observer, and a Proxy own-keys trap.
- Additional conservative probes: externally supplied dynamic key, descriptor read, Reflect.get, coercing object key, inherited getter after deletion, Object.values, and Object.hasOwn.

The compiler is invoked with closedWorld:true, strings:false, identifiers:false, and a deterministic seed per graph; only the property-pass coverage is evaluated. Each materialized application executes independently with native Node module imports. The oracle is the unmodified source's exact JSON-serialized output. All results are compared at the graph/application level.

## Independently pinned evidence

The initial 12-seed COO-only regression (288 ESM graphs) passed within the [full Ubuntu/Windows Node 22 validation run 43893330825](https://github.com/FlareZ123/obfs/actions/runs/43893330825) at exact source 1ead699e11482e48e0c851bf786682b9c38ecabf.

The extended three-mode experiment passed within [full Ubuntu/Windows Node 22 run 43894365840](https://github.com/FlareZ123/obfs/actions/runs/43894365840) at exact source ed85c1e5b2cd08b3fa1058c23e08cf5d924df293. Both runners completed the full behavioral suites, JSDoc checks, sampled performance benchmark, and the existing Linux Chromium suite. The matrix's own samples were **12 COO seeds (288 graphs), six SNO seeds (144 graphs), and six SCO seeds (144 graphs)**.

| Observation at this exact source | COO | SNO | SCO | Total |
| --- | ---: | ---: | ---: | ---: |
| Real native/emitted ESM graphs, exact outputs | 288 | 144 | 144 | **576** |
| Direct-reader positive graphs | 12 | 6 | 6 | **24** |
| Private-field renames in these direct positives | 24 | 12 | 12 | **48** |
| Field-spelling-observing graphs with zero unsafe rewrites | 120 | 60 | 60 | **240** |
| Two private-field renames across all seven positive shapes | 168 | 84 | 84 | **336** |

The six additional positive shapes are local alias, identity return, destructuring, unrelated Object.keys, unrelated descriptor, and external numeric-only host callback. All 17 other scenarios emitted zero cross-file private-field renames for the tested graph contracts, including seven cases beyond the ten mandatory spelling observers. That may represent principled conservative refusal or missed safe coverage; it is not evidence of strong protection. These counts are candidate field/graph occurrences, **not** fractions of original runtime instructions, secrets kept private, or attacker effort.

SNO and SCO rows here measure **programmatic ESM compiler outputs only**. The harness deliberately does not route through the real SCO HTTP authorization boundary or SNO integrity launcher; those are tested elsewhere. The full-mode CI run additionally checked its normal product regressions but does not convert this isolated evidence into three end-to-end security guarantees.

## Public-only attacker extension

The later source extension uses the existing [offline name normalizer](../sims/offline-normalize.js) as a **seedless, source-independent attacker**: it receives only the actually emitted ESM files, changes deterministic hash-looking private field spellings into neutral sequential labels, then executes the normalized public graph with the native Node loader. It must preserve the original application's result and demonstrate at least two normalized field spellings for each positive direct-owner case. This is **name normalization and functional public-code replay**, not recovery of original private variable names or reconstruction of source comments.

Validation of the additional attacker extension must be tied to its own exact branch SHA; the earlier 43894365840 run preceded that extension and does not prove it.

## Scope and limitations

- No browser import-map, Worker, CSP, query-string resolution, package exports, bundler or custom loader claims follow from the Node ESM fixture. The real browser regressions in the full suite are separate.
- No hostile owner, realm-intrinsic mutation or full-control runtime instrumentation is prevented. All distributed COO/SNO source can be copied, intercepted and modified under the project's threat models.
- The count of rewritten private-key occurrences is **semantic yield** under a bounded graph, not a security score. A renaming rule can keep native behavior and still be trivially neutralized by an attacker.
- No runtime-speed ratio is inferred from this finite semantic matrix. The suite's CI runs contain other sampled and application-level performance gates, but these do not provide a general **2.5×** upper bound.
- No SCO server-private function source or cryptographic key is used in this fixture, so the study neither challenges nor demonstrates server-side source withholding.

## Next decisive validation

Run the public-only normalizer extension on both platforms at its exact commit and record its success/failure independently of native/emitted parity; then judge whether any candidate raises attacker reconstruction or extraction cost beyond a native/minified control under matched instrumentation effort and full-session compute budgets. The compiler's safe field-renaming coverage should remain an explicit separate axis.
