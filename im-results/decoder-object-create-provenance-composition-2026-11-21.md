# Native string decoder provenance across Object.create descriptor factories and first-class call sites

**21 November 2026 | Agent 5 | intermediate behavior-preservation research.** Security release remains **RELEASE-BLOCKED**.

## Native-versus-emitted failure mechanism

The generated eager string decoder uses ambient JavaScript string intrinsics. A prior imported or required module can install a getter in an `Object.create`-style descriptor map, read a private object property to recover `String.prototype`, and overwrite `charCodeAt` before an encoded string initializes in another module. The original JavaScript long literal is unaffected; the obfuscated version may decode into incorrect characters. A scanner that recognizes only direct `Object.create(null,{ref:{get(){return String.prototype}}})` does not track caller-captured `Object.create`, composed descriptor maps, first-class calls, or imported descriptor factories.

The preserved native/emitted test graph requires `mutator.cjs` before `target.cjs`, then compares isolated Node 22 child-process exit status, stdout and stderr. Each unsafe mutator must disable eager string encoding and therefore preserve the original target literal. Matched `Number.prototype` benign controls require **nonzero** literal encoding and the identical native output, so a universal disable is rejected.

## Three independent predecessor proofs and blocking evidence

Agent 3's experimental [PR #217](https://github.com/FlareZ123/obfs/pull/217) recognizes locally and exported constructed descriptor maps, accessor descriptor aliases, and factory returns in CJS/ESM. Agent 5's independent [PR #219](https://github.com/FlareZ123/obfs/pull/219) covers literal descriptor construction, assignments, `Object.assign`, captured `Object.create`, destructuring and computed map names. Agent 1's [PR #211](https://github.com/FlareZ123/obfs/pull/211) studies call/apply/bind and holder-transferred first-class targets.

Each investigated a different provenance slice. On Agent 3 source `48b888457412a20efd06736ecdfe510b5de4661a`, adding only Agent 5's [independent 131-case alias matrix, PR #222](https://github.com/FlareZ123/obfs/pull/222) gave **27 distinct actual native/emitted output mismatches per operating system**, nine source shapes × COO/SNO/SCO, in [run 44944756668](https://github.com/FlareZ123/obfs/actions/runs/44944756668), source `70a40414f67266a964fc994124ee0791d2f9e319`. This is a mandatory integration gate, rather than a source-only heuristic assertion.

## Additive source-level composition

The isolated branch `agent5/decoder-agent3-alias-union-20261121` is based on Agent 3's #217 source. It retains Agent 3's descriptor/factory fixed point and exports gate, then composes Agent 5's finite alias bindings, writes, Object.assign sources and conservative unmatched-create reference guard. It also adds Agent 1's first-class callable transfer through local identifiers, object holder fields, `call`/`apply`/`Reflect.apply`, and bound callables. The last stage recognizes a terminal `SequenceExpression` callee, pre-bound descriptor maps, and a source-visible sensitive accessor when an Object.create callable escapes through an array or an opaque function argument. Unproved cases decline the transform instead of emitting eager ambient-dependent decoder code.

The test-only independent 131-case audit was brought into the same source graph. Agent 1's native-calls suite adds direct, captured, holder and bound invocation families. Three newly proposed adversarial shapes add pre-bound descriptor-map values, array-held callable transfer, and an opaque helper that calls the passed function; the positive `Number.prototype` controls remain paired.

## Source-pinned experimental chronology

| Source SHA | Evidence | Result |
| --- | --- | --- |
| `214985825c9adbe4d13ed0300c4c3cfbabe6f51a` | [Ubuntu and Windows full CI 44962351990](https://github.com/FlareZ123/obfs/actions/runs/44962351990) | **Both operating systems green**, including independent Agent 5 131-case matrix, strict JSDoc, and Ubuntu Chromium; did not yet include Agent 1 first-class invocation proof |
| `8e9569491f3cfae83d7500198e4548493e13e1ac` | [Two-platform full CI 44962544599](https://github.com/FlareZ123/obfs/actions/runs/44962544599) | **Three actual native/emitted mismatches per OS**, from `(0,create)(...)` source when new first-class callable summary failed to unwrap sequence expressions |
| `8ef1fd74130a18d4ec175c996c62a034cb67517d` | [Two-platform full CI 44962721847](https://github.com/FlareZ123/obfs/actions/runs/44962721847) | Ubuntu showed **nine actual mismatches**: the three prior sequence expression cases plus six new prebound/array-held/helper-forwarded negative cases (COO/SNO); native positive `Number` cases were unaffected. Windows status must be verified separately |
| `fec8c2d3ce8aa1b2c8256fbd258e3674f242ba5c` | [Two-platform full CI 44963114866](https://github.com/FlareZ123/obfs/actions/runs/44963114866) | **Pending** at report creation. Source adds recursive sequence-callee recognition, pre-bound map installation detection and conservative opaque first-class escape refusals |

The proposed fix has no user-facing string decoder runtime change for any program in which native integrity cannot be proved: it only suppresses the unsafe eager encoding. Compiler analysis cost may increase with source size and has not been separately benchmarked on adversarially large alias graphs. The existing 2.5× **obfuscated application runtime** ceiling has not been established globally.

## Integration decision and limits

The branch remains **isolated**. A full source-coincident two-OS passing run after the newly added test gate is required before calling the composed source green, requesting integration or creating a release claim. No independent source confidentiality or tamper-resistance gain follows from refusing incorrect transforms. Any candidate merge must protect the already validated positive literal-encoding yield and should not mechanically combine duplicate scanners without exact-source paired tests.

This report belongs in `im-results/`. It does not establish a novel academic theorem or change `results/README.md`'s established RELEASE-BLOCKED verdict.


## 22 November 2026 update: exported native-callable cross-file route

A separate source-pinned challenge found that a factory module can export the native `Object.create` function itself (or an object holding it), after which a mutator module calls the imported function with a sensitive getter descriptor map. The entry then loads a long-string target. The earlier composition did not prove the imported call target, so it admitted eager decoding and produced **seven distinct native/emitted output mismatches on each OS** across CJS direct export, CJS holder export and ESM named export, in the frozen red run [44964073219](https://github.com/FlareZ123/obfs/actions/runs/44964073219) at `6dd6ce02c8cf73334fcdb8e13c54c5c63a150a0c`. All matched benign `Number.prototype` controls retained positive encoding yield.

The narrow follow-up treats a source-visible sensitive descriptor map in the second argument of an otherwise opaque call as a possible cross-file native `Object.create`/`Object.defineProperties` sink. It refuses eager decoder encoding for that case while retaining the benign Number controls. The exact source and test passed full two-platform validation and Chromium in [run 44964439042](https://github.com/FlareZ123/obfs/actions/runs/44964439042), source `4f4a2b1df17aa98ddf0a08320f8c1ecf115386b9`.

The source was then composed with the #217 descriptor/factory branch, the 131-case independent alias matrix, and the first-class invocation tests in stacked draft [PR #239](https://github.com/FlareZ123/obfs/pull/239). The final combined source pin `34922e438c1e09c49a6f4319ed523ce061590058` passed the full Ubuntu/Windows manual validation [run 44964771823](https://github.com/FlareZ123/obfs/actions/runs/44964771823): both OS jobs passed behavioral/adversarial tests, strict project and external JSDoc, performance/profile and whole-process budget steps; Ubuntu passed the configured real Chromium integration, including the first-class alias fixture.

This closes the specifically enumerated exported-native-callable regression for the tested graph and supports review of the composed compatibility patch. It does not establish general effect analysis across arbitrary imported callables, full JavaScript equivalence, increased obfuscation resistance, or a universal 2.5× compute guarantee. PR #239 remains a draft stacked on Agent 3's #217 branch; integration awaits the parent branch owner's review.

## 22 November follow-up: bound prototype argument offsets

A later adversarial test found that `Object.create.bind(null, null)` pre-binds the prototype argument, shifting a descriptor map supplied at invocation from index 1 to index 0. The old guard missed this and produced actual native/emitted long-string corruption on both OSes. This is distinct from binding only the `this` value or pre-binding the descriptor map itself. The full red/green record, including direct, `.call`, `.apply`, `Reflect.apply`, nested-bind and holder-field controls, is in [decoder-bound-object-create-argument-offset-2026-11-22.md](decoder-bound-object-create-argument-offset-2026-11-22.md). The final browser-extended two-platform validation is [run 44972512134](https://github.com/FlareZ123/obfs/actions/runs/44972512134), source `c2bebcd8bc3e022fee494ba57277aab2bb9b8bfe`.


## 22 November follow-up: descriptor object identity across aliases

Agent 42 found a separate soundness gap where a descriptor object was passed to `Object.create` under its original identifier but its sensitive getter was written through `alias = descriptors`. The original scanner indexed member writes by the alias name and did not join them back to the object identity at the sink. Independent all-mode red evidence is [run 44972082499](https://github.com/FlareZ123/obfs/actions/runs/44972082499); the imported test reproduced on this PR head in [44973223450](https://github.com/FlareZ123/obfs/actions/runs/44973223450).

The fix adds a reverse identifier-alias graph and follows alias chains with cycle protection when checking descriptor member writes and `Object.assign` sources. The final browser-extended source passed full Ubuntu/Windows and Chromium validation in [44974089708](https://github.com/FlareZ123/obfs/actions/runs/44974089708), source `27c483e66e6ce2e0dda03f8d3b378e7061441796`. See [decoder-descriptor-object-alias-write-2026-11-22.md](decoder-descriptor-object-alias-write-2026-11-22.md) for the red/green and limitations.
