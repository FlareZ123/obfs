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

The later source extension uses the independent [public Acorn-token field normalizer](../sims/public-token-normalizer.js) as a **seedless source-only attacker**: it accepts only the emitted ESM files, recognizes compiler-distributed hash-looking key tokens, normalizes them into neutral sequential labels with Acorn parser, tokenizer, and walker APIs, then executes the changed public files under Node's real ESM loader. This attacker has no dependency on the obfuscator's internal AST, source input or build seed. It does not recover erased original private names or comments, and its simple naming-pattern detector does not generalize to every possible obfuscator.

At [full Linux/Windows Node 22 run 43897039946](https://github.com/FlareZ123/obfs/actions/runs/43897039946), source `b004bd6c5739010248a3b39e1f8c324c68c4fb52`, the 576 transformed public graphs all replayed their exact original outputs after static normalization. The normalizer rewrote **168 COO, 84 SNO, and 84 SCO field spellings**, one per transformed hash label in this finite corpus. The test also proves a nominally independent hash token occurs consistently across files. All counts represent public-name neutralization, not encrypted-source extraction. The earlier [43895011479](https://github.com/FlareZ123/obfs/actions/runs/43895011479) had the same positive replay result with a library-coupled prototype; the latter independent-token version is the stronger attacker separation.

A later attacker hardening patch (code through `b0800b70ba27005942f28d9ce77aaac170aed832`) conservatively limits quoted hash-shaped text rewriting to syntactic property keys, leaving ordinary payload strings untouched. Two new tests cover a decoy payload with the *same spelling* as a renamed field and quoted destructuring/member keys. The initial decoy-hardened validation [CI 43996724981](https://github.com/FlareZ123/obfs/actions/runs/43996724981) failed because its branch dependency manifest lacked `acorn-walk`, so neither adversarial results nor browser results from that failed run were counted. After explicitly adding the dependency, [full Linux/Windows Node 22 and Ubuntu Chromium CI 43997164656](https://github.com/FlareZ123/obfs/actions/runs/43997164656) **passed** at exact executable commit `f3d38399e2957dc2b93e1dbf78c3b3f3b4402866`, including the two new decoy tests, 576 native/emitted/normalized ESM comparisons, strict JSDoc and real Chrome. The static attacker now preserves ordinary hash-looking text data in the tested fixture; dataflow across arbitrary externally owned hash-shaped API keys remains unproved. The attack still does not infer arbitrary dynamic-key dataflow or restore original field names.

## External host API name collision: a negative attacker control

The simple source-only token normalizer also has a clearly bounded failure mode. A compiler-shaped hash identifier may simultaneously be a real, externally owned API name. The host's `HOST._pabcdef123456` member is outside the supplied JavaScript graph; blindly changing that member changes program behavior even when rewriting the local literal owner is harmless. The isolated [regression](../test/public-token-normalizer.test.js) records the native observation `[17,31]` versus the naive statically normalized observation `[17,null]` under a fixed host object. This is a deliberately constructed **attacker false positive**, rather than a failed obfuscator output or evidence that reverse engineering becomes computationally infeasible.

The control and ordinary-literal decoy cases passed across Node 22 Ubuntu/Windows with strict JSDoc in [focused CI 43997953129](https://github.com/FlareZ123/obfs/actions/runs/43997953129) at exact source `9e7cb68064c00818dbf7e5be3398df75117916af`. The reported 576/576 graph recovery remains limited to the earlier finite fixture family, where no same-spelled outside-host API exists. A stronger public-only attacker should prove receiver ownership or document which external fields it may alter, then re-run the same host collision controls. False-positive avoidance and recovered protected work are separate measurements.

## Whole-process and hot-path cost on actually rewritten ESM fields

The new [full-session profile](../sims/esm-observation-session.js) feeds native and compiled four-module ESM graphs into separate Node processes. A named external numeric host callback executes with every direct private field read. Two owner fields are genuinely renamed, and every output is compared over **1 and 2,000,000 repeated calls**. Seven-sample default CLI profiling is available; the CI regression used **five alternating native/emitted samples** per workload, measuring process launch, module imports, computation, and output JSON. Source size was **656 bytes native / 664 bytes generated**; only the same small graph and environment are represented.

| Pinned CI 43897039946, Node 22 | 1-call process ratio | 2,000,000-call process ratio | 2,000,000-call hot ratio |
| --- | ---: | ---: | ---: |
| Ubuntu | 0.964× | 0.996× | 0.981× |
| Windows | 0.986× | 1.004× | 0.986× |

Every measured complete-process median remained below 2.5×. The one-call hot timer measured ~0.05–0.06 ms and is too short to support stable per-call cost inference. These paired observations do not prove a worst-case performance bound, browser runtime parity or security gains. The [real Chromium differential runner](../test/esm-observation-browser.js) initially failed at [CI 43897515394](https://github.com/FlareZ123/obfs/actions/runs/43897515394): its **Node-specific fixture** attempted to replace the read-only browser `Window.window` self-alias. The browser adapter now rewrites only that synthetic host shim, identically for original, generated, and normalized modules, to install the external test API on the existing Window. At [full Linux/Windows/Chromium CI 43996215315](https://github.com/FlareZ123/obfs/actions/runs/43996215315), exact source `5ad8abbfa68f26c1a65b13fd87b3791c366f3518`, both operating systems passed their Node/JSDoc/benchmark gates and the real Ubuntu Chromium test recorded **six cases, six actually protected private-field occurrences, three unsafe observer refusals, six public field-label normalizations, and exact native/emitted/normalized browser output parity**. This is 18 network-served browser module evaluations with fixture adaptation, not raw native Node code transplanted byte-for-byte into a browser.

## Scope and limitations

- No browser import-map, Worker, CSP, query-string resolution, package exports, bundler or custom loader claims follow from the Node ESM fixture. The real browser regressions in the full suite are separate.
- No hostile owner, realm-intrinsic mutation or full-control runtime instrumentation is prevented. All distributed COO/SNO source can be copied, intercepted and modified under the project's threat models.
- The count of rewritten private-key occurrences is **semantic yield** under a bounded graph, not a security score. A renaming rule can keep native behavior and still be trivially neutralized by an attacker.
- No runtime-speed ratio is inferred from this finite semantic matrix. The suite's CI runs contain other sampled and application-level performance gates, but these do not provide a general **2.5×** upper bound.
- No SCO server-private function source or cryptographic key is used in this fixture, so the study neither challenges nor demonstrates server-side source withholding.

## Reviewed unmeasured source/environment effects

Agent 4 reviewed this matrix and identified two important families that remain **outside its denominator**: source-visible mutation of a mutable global `Reflect` method through a computed-destructured parameter and host callback, and first-class function aliases or forwarded argument carriers that reach the same ambient capability. Prior independent red/green cases live in [test/closed-record-visible-reflect-overwrite.test.js](../test/closed-record-visible-reflect-overwrite.test.js), with cited runs [43892388977](https://github.com/FlareZ123/obfs/actions/runs/43892388977), [43892841749](https://github.com/FlareZ123/obfs/actions/runs/43892841749), [43894278009](https://github.com/FlareZ123/obfs/actions/runs/43894278009), and [43895037312](https://github.com/FlareZ123/obfs/actions/runs/43895037312). These witnesses concern real declared-code/host-effect boundaries and are materially different from token-level static replay. The current 24 scenarios also omit explicit function-source and error-stack observers, import maps, custom loaders, and malicious preloads. None may be assumed safe merely because this finite matrix passes.

## Next decisive validation

Validate the later decoy-hardened public-only attacker at an exact immutable SHA; then compare substantially transformed application code with a native/minified control under matched static and runtime instrumentation effort. The compiler's safe field-renaming coverage, actual protected-work fraction and whole-session cost remain separate axes. Static name neutralization succeeding on every transformed graph is a negative protection observation rather than a defense against a capable attacker.
