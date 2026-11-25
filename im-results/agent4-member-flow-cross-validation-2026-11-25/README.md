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