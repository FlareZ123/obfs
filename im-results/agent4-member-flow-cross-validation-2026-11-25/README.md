# Agent 4: member-flow receiver and prototype cross-validation

Status: **INTERMEDIATE RESEARCH — not production integration and not a release result.**

Date: 2026-11-25 UTC

## Scope

Adversarially reviewed the experimental helper `workplace/agent9-ambient-call-bindingid.js` across Agent 10, Agent 6, Agent 1, Agent 4 and Agent 5 research snapshots. Tests use Node's `vm` runtime to execute each source first, assert the exact function observed by the host callback, and then compare the static `hostHeldCallable`/`safe` summary. This distinguishes genuine false negatives from conservative over-retention.

Two reusable runtime-backed test files are stored beside this report:

- `member-flow-adversarial-review.test.js` — 19 cases covering ordered spread/computed keys, object/class method/getter receivers, side-effect sinks, factory-returned members, destructuring, namespace-qualified construction, constructors and nested chains.
- `prototype-member-flow-review.test.js` — 12 cases covering function/class prototype assignments, prototype replacement, prototype methods/getters, inheritance, constructor-returned objects and own-property shadow controls.

These files are reproduction artifacts for the helper snapshots cited below. Their imports assume the helper is available at `workplace/agent9-ambient-call-bindingid.js`; that helper is not integrated into current production source by this report.

## Differential evidence

| Research implementation | Focused run | Result |
|---|---:|---|
| Agent 10 candidate `c8d6bf6...` | [45657844717](https://github.com/FlareZ123/obfs/actions/runs/45657844717) | 10/19; nine runtime-confirmed false negatives |
| Agent 6 spread/override helper `719f484...` | [45659709961](https://github.com/FlareZ123/obfs/actions/runs/45659709961) | 16/19; three receiver-related false negatives |
| Agent 4 receiver donor `6b21582...` | [45657750458](https://github.com/FlareZ123/obfs/actions/runs/45657750458) | 12/14; two method/getter side-effect receiver false negatives |
| Agent 1 current-main helper `e673dfa...` | [45659950310](https://github.com/FlareZ123/obfs/actions/runs/45659950310) | 19/19, including focused typechecks |
| Agent 1 current-main helper, Agent 5's 51-case receiver suite | [45660207684](https://github.com/FlareZ123/obfs/actions/runs/45660207684) | 44/51; two false negatives and five precision over-retentions |
| Agent 5 receiver helper `4bf3c478...` | [45657855450](https://github.com/FlareZ123/obfs/actions/runs/45657855450) | 19/19, focused JSDoc green |
| Agent 5 latest semantic receiver helper plus clean JSDoc fix `0ec1ac5...` | [45662649431](https://github.com/FlareZ123/obfs/actions/runs/45662649431) | **51/51 plus project, external and paired-budget JSDoc checks green** |

The 19-case matrix's nine Agent 10 false negatives were: later object spread overwrite; object method return through `this.callback`; object getter return through `this.callback`; unknown computed object key; later computed-key overwrite; object method side-effect sink; object getter side-effect sink; factory-returned object method; and factory-returned object getter. Runtime witnesses confirmed the host received `hidden` before the static summary failed to retain it.

Agent 5's 51-case suite adds inherited getter receiver preservation, dynamic getter side-effect binding, lexical-arrow receiver propagation, nested method chains, and precision controls. The 51-case run is green after the effective-object-value change in `5f5d170...` and the JSDoc annotation patch described below.

## Prototype boundary

Both Agent 5 and Agent 1 helpers passed the nine positive prototype cases and failed the same three negative precision controls:

- A function constructor's own `this.callback = harmless` shadows `Local.prototype.callback = hidden`.
- A class instance field `callback = harmless` shadows `Local.prototype.callback = hidden`.
- A later own assignment `owner.callback = harmless` shadows the prototype value.

Runtime observed `harmless`, but the summary continued to mark `hidden` host-held. This is conservative over-retention, not an unsafe false negative. It indicates that the current helper protects prototype-installed callables without proving own-property precedence over the prototype chain.

Agent 5 prototype run: [45662347666](https://github.com/FlareZ123/obfs/actions/runs/45662347666). Agent 1 prototype run: [45662563234](https://github.com/FlareZ123/obfs/actions/runs/45662563234). Each had 9/12 tests pass: all nine exposure controls passed; all three own-shadow precision controls failed.

## Strict JSDoc repair

Agent 5's latest semantic receiver helper had seven `Set<unknown>`/`Set<number>` type errors in `typecheck:external`. A clean review patch changed recursive value-flow `seen` parameters from `Set<number>` to `Set<unknown>` (15 annotations) while preserving the distinct `Map<AstNode,Set<number>>` binding-ID map. The patch is commit `0ec1ac5314c3426906d2025eb4117ccf6ac92afe` on `agent4/agent5-seen-set-jdoc-fix-20261125`; run [45662649431](https://github.com/FlareZ123/obfs/actions/runs/45662649431) passed the full 51-case suite and all focused JSDoc checks. Agent 5 was sent the exact commit for cherry-pick/reproduction; their branch was not modified.

## Conclusions

1. The Agent 10 candidate is materially behind the receiver-aware donor on ordered object property semantics and receiver propagation. Do not merge its stale branch wholesale.
2. Agent 1's current-main property-flow work is a useful integration base, but its 51-case differential shows unresolved inherited/dynamic getter receiver paths and several precision regressions.
3. Agent 5's latest receiver-map, lexical-arrow and effective-object-value implementation is the strongest tested helper donor in this review: 51/51 plus strict JSDoc passes.
4. Prototype own-property shadowing remains a known precision limitation shared by Agent 1 and Agent 5. Preserve fail-closed behavior until a prototype/instance abstraction proves the negative controls.

## Next work

- Port the minimal Agent 5 receiver-map and effective-object-value logic onto a fresh current-main integration branch, retaining Agent 1's module/property analysis foundation and the 51-case regressions.
- Keep the seen-set JSDoc fix and verify the full focused workflow after any rebase.
- Add an abstract prototype/instance property model: ordered own writes, class fields, constructor writes, function/class prototype assignments, replacement prototype objects, inheritance, and constructor-returned objects. Preserve descriptor/proxy mutations as fail-closed until modeled.
- Expand to cross-module imported aliases, mutator parameter flow, destructuring and dynamic reflection/proxy cases with runtime-first tests.
- Only after production integration, run the complete test suite, behavior-preservation suite, browser/Node mode validation and the 2.5x runtime-budget benchmarks.

## Limitations

All results here concern an experimental helper and focused test matrix. They do not establish production compiler correctness, full cross-file soundness, resistance to runtime extraction, domain-locking correctness, SCO/COO/SNO integration, or the 2.5x compute budget. `results/` and the release status should remain unchanged until those gates are met.
## Reproduction

On a branch that contains the matching helper at `workplace/agent9-ambient-call-bindingid.js`, run:

```sh
node --test im-results/agent4-member-flow-cross-validation-2026-11-25/member-flow-adversarial-review.test.js
node --test im-results/agent4-member-flow-cross-validation-2026-11-25/prototype-member-flow-review.test.js
```

The test files are archived under `im-results/` so their intentionally failing precision/soundness assertions do not become unconditional mainline CI gates. Copy them into a focused review branch or run them explicitly against the exact helper snapshot under investigation.
## Production source-observer positive check

Separately tested a local object getter returning `globalThis.Reflect`, then aliased the result and wrapped `Reflect.ownKeys` so that the wrapper observes an imported object's own keys. The production cross-file proof correctly declined the rename (`compiled.crossFile.properties === 0`) and preserved native/compiled output. The standalone witness passed on Ubuntu and Windows with strict JSDoc: [45664023694](https://github.com/FlareZ123/obfs/actions/runs/45664023694). The same regression was added to `test/cross-file-safe-record-read.test.js` in [PR #376](https://github.com/FlareZ123/obfs/pull/376); the integrated focused-file run [45664303344](https://github.com/FlareZ123/obfs/actions/runs/45664303344) passed on both platforms with all focused JSDoc checks.

This validates a getter-mediated Reflect alias path in the production source-observer guard; it is a positive control, not a newly discovered gap.
A second production source-observer regression was added in the same PR: a getter returns `globalThis.Object`, and an aliased `Object.getOwnPropertyDescriptor` wrapper observes the imported object's property descriptor. The production proof again declines the rename and preserves native/compiled output. Combined focused run [45665112193](https://github.com/FlareZ123/obfs/actions/runs/45665112193) passed both Reflect and Object getter-mediated alias tests on Ubuntu and Windows with all focused JSDoc checks. PR #376 now contains both tests.
The clean JSDoc patch is also available as [PR #377](https://github.com/FlareZ123/obfs/pull/377), targeting Agent 5's research branch `agent5/lexical-this-arrow-return-review-20261125`. It remains open for Agent 5 review; no unreviewed branch was merged.
A third production source-observer regression covers a `Proxy` get trap that records the property key used to read an imported object. The proof declines the rename and preserves exact output; the combined getter/Proxy suite [45665679576](https://github.com/FlareZ123/obfs/actions/runs/45665679576) passed on Ubuntu and Windows with all focused JSDoc checks. PR #376 now contains all three positive observer tests (Reflect getter, Object getter, Proxy get trap).
The current production implementation also has an explicit `Proxy` constructor/handler fail-closed path in `src/cross-properties.js` (around lines 1644–1673): non-empty proxy handlers set the intrinsic-observation guard. The runtime regression verifies that this conservative rule preserves an observable get-trap key.
## Production receiver mutation gate (separate from the helper)

Agent 1's independent production-path matrix [run 45686751880](https://github.com/FlareZ123/obfs/actions/runs/45686751880) passed **20/20 on Ubuntu and Windows** against the pinned current-main production compiler. It covers 18 hostile receiver/intrinsic mutation cases, the host-preloader receiver case, and a direct property-read positive control. All mutation cases preserve execution while refusing the rename (`crossFile.properties=0)); the direct control still renames one property (`crossFile.properties=1`). Strict project/external/paired-budget JSDoc passed. Full details and exact source pin: `im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md`.

This production result is deliberately separate from the research-helper false negatives below: it does not validate the helper's source-only intrinsic-trust assumption, and it is a focused mutation matrix rather than full acceptance.

## Latest same-suite cross-candidate replay (25 November 2026, 19:32–19:38 UTC)

The archived 19-case matrix `member-flow-adversarial-review.test.js` (blob `075c103ff7be85c7f963a03763322ec7f585f844`) and the copied test used in the focused branches (blob `f71afcb7a10f6a23720f2bdfe2fb950f436902e9`) differ only in relative `require()` paths. The executable test cases are identical.

| Candidate helper | Test-only branch / helper pin | Focused run | Result |
|---|---|---:|---|
| Agent 10 current member-flow candidate | `agent10/member-flow-counterexamples-20261125`, helper blob `4bd863bbc4fbf4a7315b9223aa1004c23c5b5bc8` | [45686131087](https://github.com/FlareZ123/obfs/actions/runs/45686131087) | **10/19 on Ubuntu and Windows; 9 false negatives** |
| Agent 5 current receiver candidate | `agent5/receiver-explicit-this-call-apply-20261125`, helper blob `49c3b2db10dedc307f5a83a74e28f7629f955778` | [45686766037](https://github.com/FlareZ123/obfs/actions/runs/45686766037) | **19/19 on Ubuntu and Windows; strict project, external and paired-budget JSDoc passed** |

The nine Agent 10 false negatives are: later object spread overwriting an earlier static property with a callable; object method return through `this.callback`; object getter return through `this.callback`; unknown computed object key supplying a callable property; later unknown computed key overwriting an explicit callable; object method side-effect sink through `this.callback`; object getter side-effect sink through `this.callback`; factory-returned object method returning `this.callback`; and factory-returned object getter returning `this.callback`. The full test summary for 45686131087 is 10 pass / 9 fail on both platforms. An earlier same-helper/same-test replay [45657844717](https://github.com/FlareZ123/obfs/actions/runs/45657844717) is consistent.

A second focused replay on the same Agent 5 helper used Agent 10's 31-case member-flow follow-up suite (test blob `6d27f0eb5641122b57a8e98b2be0cbb45c6fae45`): [run 45687002533](https://github.com/FlareZ123/obfs/actions/runs/45687002533) succeeded on both Ubuntu and Windows, with strict project/external/paired-budget JSDoc. The Ubuntu test summary was **30 pass, 0 fail, 1 TODO**. This shows that the Agent 5 receiver candidate also covers the exercised factory-return, destructuring, nested-member, namespace-constructor and reflection cases from Agent 10's suite. Both runs were focused workflows; the full `node22` job was skipped.

Agent 5's 51-case receiver-bound return suite [run 45688423395](https://github.com/FlareZ123/obfs/actions/runs/45688423395) also passed on Ubuntu and Windows, including strict project/external/paired-budget JSDoc. The full `node22` job was skipped.

The combined test-only aggregate [run 45688710893](https://github.com/FlareZ123/obfs/actions/runs/45688710893) imports the same 19-, 31-, 20- and 51-case suites (121 declared test cases) against one helper snapshot. Both Ubuntu and Windows focused jobs passed, as did all strict JSDoc steps; the full `node22` job was skipped. The component suites establish 120 executable passes and one TODO; the aggregate run's log summary should be retained when Actions log access is available again.

The current Agent 5 candidate's separate 12-case prototype own-shadow review [run 45687921204](https://github.com/FlareZ123/obfs/actions/runs/45687921204) failed on both platforms. The run is a precision-boundary check, not evidence of unsafe false negatives; its detailed test summary remains to be retrieved after Actions log access recovers. The earlier 9/12 result is not asserted as the current run's exact count.

The test-only branch used for these replays is `agent4/review-agent5-latest-member-flow-20261125` at `984fc4cc37c8b70c6aeea9024330d6f1015bef97`. It adds test files only; it does not modify either donor or production `src/`.

The older property-specific prototype review [45666296679](https://github.com/FlareZ123/obfs/actions/runs/45666296679) is now confirmed **failed** (not pending). Its failed-job log tail listed at least twelve false-negative cases across spread/computed keys, `this.callback` returns and side effects, factory-return destructuring, namespace construction and nested factory chains. Subsequent Actions log retrieval returned HTTP 403 after retries, so do not assert an exact test summary for that older run.

Agent 5's separate 20-case explicit-this receiver/call/apply suite [run 45687327103](https://github.com/FlareZ123/obfs/actions/runs/45687327103) also passed on Ubuntu and Windows. Both focused jobs passed the test step plus strict project, external and paired-budget JSDoc; the full `node22` job was skipped.

These are helper-level focused results only. The Agent 5 candidate still inherits the known prototype own-property shadow precision limitations described above, and none of these focused runs is production integration, full-suite acceptance, runtime source-observation proof, or a 2.5× budget qualification.
