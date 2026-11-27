# Combined WeakMap-source observation transfer review (Agent 47, 27 November 2026)

**Status:** **Intermediate compiler compatibility integration donor, not an accepted release candidate.** The production release decision remains **RELEASE-BLOCKED**. The complete security/performance, SCO HTTP/SNO deployment and independent attack gates are not discharged by this work.

## Origin, controlled source and test contract

- Agent46's frozen current-main review base: `ceaa71275025f0df2a9b346b991707c6510a286c`. Agent47 first executed source-preservation falsifiers against this pin without modifying `src/`: [accessor descriptor report](agent47-accessor-descriptor-source-parity-falsifiers-2026-11-27.md) and [expression-order report](agent47-weakmap-expression-evaluation-order-2026-11-27.md).
- The shared switch/control-flow donor from Agent8 used as **integrated-source base**: `24f0254739566cf4b1df11de514599f81621969b`. It contained switch selector transfer, case completion and 72 test tuples. It is independently evolving, and its later commits must be evaluated separately.
- Integration-review branch `agent47/merged-source-transfer-104case-20261127` combines Agent8's switch fix with Agent47's getter/setter, thrown-expression, missing evaluated AST child, optional-chain, logical assignment and class-field transfer corrections. **No competing production PR was opened.**
- Test file `test/agent3-weakmap-cfg-matrix.test.js`: native Node v22 three-file ESM evaluation, native `WeakMap.prototype` test, mocked DOMString `document.title` setter intercepting callable `Function.prototype.toString`, exact byte equality native versus emitted source, and actual identifier-binding rewrite counts. COO/SCO/SNO are separately seeded **`obfuscateFiles` core API configurations**: the test is not a real SCO HTTP authorization flow, a standalone SNO launcher, or browser-native WebIDL.

## Reproducible red-to-green progression (source-pinned runs)

| Source SHA | Test count (per OS) | Three-OS result | What was changed |
| --- | ---: | --- | --- |
| `70b07d2d2d09663f7f7a530991e2618afec999c5` | 104 | **93 passed / 11 red** [run 46073868209](https://github.com/FlareZ123/obfs/actions/runs/46073868209) | Agent8 switch controls + Agent47 new reproducible cases; corrected combined-matrix separator |
| `ab4f2748f961d1566e2fab9a18d39591056efe47` | 104 | **98 passed / 6 red** [run 46073982908](https://github.com/FlareZ123/obfs/actions/runs/46073982908) | Ordered evaluation + accessor metadata/coalescing/writes/clone/branch joins |
| `c03a4b2c325e5bae237aa1d944f0d42f763b7d5c` | 104 | **100 passed / 4 red** [run 46074153088](https://github.com/FlareZ123/obfs/actions/runs/46074153088) | Logical assignment skip and conservative branch joins |
| `9b878b48eb2437f2013e8799b0ab29c2b4843455` | 104 | **102 passed / 2 red** [run 46074234249](https://github.com/FlareZ123/obfs/actions/runs/46074234249) | Optional-chain computed property/call argument guard |
| `864ee7ea7eed017254b006aff21f9eeb212bfd79` | 104 | **104 passed / 0 red** [run 46074394974](https://github.com/FlareZ123/obfs/actions/runs/46074394974) | Defer class-declaration nonstatic field initializers until direct construction |
| `7eb072572577f4dcdc3680a2f36bd1303e0838d9` | 109 | **105 passed / 4 red** [run 46074489007](https://github.com/FlareZ123/obfs/actions/runs/46074489007) | Four independent alias/parameter/reflective/subclass constructor falsifiers |
| `47f76b74f9b6d98b7ed6cecf1e7aa4e65bfffaf7` | 109 | **109 passed / 0 red** [run 46074618965](https://github.com/FlareZ123/obfs/actions/runs/46074618965) | Fail closed for unproved/escaped class constructors, retain direct-new yield |
| `6480b3380eb6d08c00832335abced01302293384` | 114 | **114 passed / 0 red** [run 46074853687](https://github.com/FlareZ123/obfs/actions/runs/46074853687) | Additional reflective Object/Reflect accessor controls were already safely refused when native-shared |
| `62c64a18da5003493550a724ab98111327c8d61a` | 114 | **114 passed / 0 red** [run 46074887306](https://github.com/FlareZ123/obfs/actions/runs/46074887306) | Record static getter/setter descriptor kinds from Object/Reflect definition; earlier run was already green |
| `963ed03f1f6a07f2c453458d6d68f00239f0c1c8` | 123 | **120 passed / 3 red** [run 46075315833](https://github.com/FlareZ123/obfs/actions/runs/46075315833) | Six class-expression timing probes; two source mismatches plus one false-positive yield loss |
| `1892395d76d259fc7d1b221190be38a6b72258fa` | 123 | **123 passed / 0 red** [run 46075513281](https://github.com/FlareZ123/obfs/actions/runs/46075513281) | Defer class-expression nonstatic field initializers, schedule provable constructors and fail closed for escape |

The red/green numbers above describe **each** of Ubuntu, Windows and macOS focused GitHub Actions jobs, all at the claimed exact source SHA. The accessor fixes removed native source-observation mismatches while **non-WeakMap Ordinary controls still required four actual renamed bindings** in each core API configuration. The source-pinned added callee-before-argument probes passed by conservative `group:true,bindings:0` refusal and are **not** new false-safes; one proposed overstrict non-WeakMap call control was deliberately dropped because it demanded rewrite yield through an opaque computed callee. Likewise, four reflective accessor positive-WeakMap cases passed by conservative refusal already *before* the descriptor-definition metadata edit; do not promote that edit as a measured red-to-green fix.

There were two invalid early combined test builds (`ee385f84...` and `e07a2fd...`) where a missing separator caused `TypeError: .for is not iterable`, not a semantic compiler regression. The corrected 104-case base is `70b07d2d...`. Never count invalid test-load runs as obfuscator false-safes.

## A distinct frozen full-gate source

To avoid conflating subsequent experiments with full acceptance, `agent47/109case-full-gate-20261127` was frozen at **`47f76b74f9b6d98b7ed6cecf1e7aa4e65bfffaf7`** and never modified. That pin has:

- full Node Ubuntu/Windows [workflow 46074807475](https://github.com/FlareZ123/obfs/actions/runs/46074807475), including compact full Node suite, strict typechecks, benchmarks, selected paired process profiles and Chromium on Ubuntu. **At report creation Ubuntu completed success; Windows was still running.** Verify its exact completed state before using it as a two-OS receipt.
- full [real-browser Chromium workflow 46074813269](https://github.com/FlareZ123/obfs/actions/runs/46074813269) **completed success** at the identical SHA, including reviewed WebIDL/Storage/SRI/inter-file/module/runtime cases. This success does **not** exercise subsequent `62c64a...`, `189239...` or later changes.

Neither green focused suite nor these full workflows prove the adversarial attack resistance, runtime extraction/relay boundary, or strict 2.5× **all workloads** requirement. A benchmark sample within threshold is not a security conclusion. Other agents' selected-hot/per-work and process-level full-session evidence must be considered independently.

## Implemented transfer policies (scoped, not a general ECMAScript abstract interpreter)

- Maintain an abstract carrier environment with branch-preserving joins and alias-preserving cloned heaps. `CarrierContainer.accessors:Set<string>` distinguishes getter/setter slots from own data slots. Source-order getter/setter definitions coalesce; a potential setter write retains previous getter-return carrier rather than certifying an overwrite. Definiteness proof of local helper slot writes rejects accessor slots.
- Execute the relevant computed object/class member keys, class `extends`, member assignment key, constructor callee, and thrown expression value/effects in observed native order. The thrown value must use its post-expression state.
- Model logical assignments `||=`/`??=`/`&&=` as conditional field writes rather than unconditional replacement. Use conservative state joins when value/truth is not proved; unknown computed LHS reference fails closed rather than inventing a safe value.
- Model optional-chain computed keys and call arguments as conditional on nullish receiver; unresolved host/callee receiver effects fail closed while proved receiver states execute effect transfers.
- Separate class definition-time computed keys/static field values from *instance* field initializers. Replay instance writes on proved direct constructors; if aliases, reflective construction, subclasses, exports or dynamic execution may construct elsewhere and the initializer is effectful, refuse source-sensitive rewriting instead. The class-expression extension recognizes proved private `const Name=class{}` owners and private unobserved object literals, while retaining conservative escape handling.

This is an incremental **scope-limited** repair. Unsupported getters, proxies, dynamic property access, class escapes, reentrancy, reflection and cross-realm quirks can still exceed the proof. Expanding syntax-specific patches without a canonical ordered expression transfer and exception/completion model can generate new false-safes. Agent4's [ordered transfer design audit](../workplace/agent4-carrier-transfer-semantics-audit-2026-11-27.md) and the [canonical carrier/effects proposal](../workplace/source-observer-carrier-effect-contract-2026-11-23.md) remain the longer-term architectural direction.

## Immediate owner actions

1. Review the donor as a **single source-provenance unit** with Agent8's switch corrections and Agent47's transfer/descriptor changes; prefer Agent1's single acceptance branch, **not** two competing release heads.
2. Fold exact native-negative positive-yield controls alongside native-WeakMap-positive exact-source controls. Refusal with `bindings:0` is not an obfuscation gain. New source patches must rerun exact pin on all 3 OS.
3. Before any promotion: full Node and actual browser at one **identical final SHA**, genuine SCO and SNO launchers and server/private mode tests, paired 2.5× per-work budgets, and independent attacked application versus equal-trust ordinary-minified control.
4. Keep **RELEASE-BLOCKED** unless all relevant conditions are satisfied. Do not relabel correctness fixes as an academically established security result.

**Reproduction:** `npm ci --ignore-scripts --no-audit --no-fund && node --test test/agent3-weakmap-cfg-matrix.test.js` at each exact test SHA. The existing `manual-validation.yml` focused workflow executes this test on all three OS with Node 22.23.4, and also strict JSDoc checks.
