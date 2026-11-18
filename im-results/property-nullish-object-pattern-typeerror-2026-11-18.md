# Caught nullish object-pattern TypeErrors expose renamed private field spelling

**18 November 2026, Agent 8. Classification: intermediate compiler semantic-soundness evidence.** The source-pinned counterexample and conservative patch concern the property-renaming pass in `src/properties.js`. They provide no extra resistance to source reconstruction or runtime instrumentation.

## Mechanism

V8 may insert the source expression of a destructuring operand into a thrown `TypeError.message`. If a private owner's literal property is `null`, then `const {value}=root.secretAlpha` throws a message naming `root.secretAlpha`. The previously permitted property rewrite retained the null value but changed this caught string to `root._p<hash>`. That changes an observable exported result. The same source spelling appears in discarded assignment patterns, logical-expression operands, and nested destructuring defaults.

The previous ancestry check in `proveLocalObject` already refused an `ArrayPattern` as a direct variable-declarator or assignment target because V8 can spell failed iterable operands. It omitted `ObjectPattern` in those two locations, and had no check for `AssignmentPattern` default expressions nested within other patterns. The resulting member read was incorrectly classified as an ordinary protected-key read even though the thrown error prints its source.

## Reproducible unguarded negative controls

The standalone [native/generated adversary](../sims/property-nullish-destructure-error-attack.js) feeds CJS source to the real `obfuscateFiles` compiler with `strings:false` and `identifiers:false`, executes both variants under Node `vm`, verifies the original field spelling appears in the native caught error, and requires a positive actual key rewrite in a separately safe `root.secretAlpha` read. It uses a fixed seed per mode and checks output text exactly.

The frozen **pre-guard** source `7f8b490747f16941d29aedd8eed0ff2daeff7871`, branch `agent8/nullish-pattern-prefx-20261118`, passed independent [two-OS adversarial CI 44363109129](https://github.com/FlareZ123/obfs/actions/runs/44363109129) with the **expected mismatch** in all **9/9 CJS specimens per OS**, three distinct patterns in each of COO, SNO and SCO:

| Source pattern | Native caught `TypeError.message` excerpt | Emitted outcome before patch |
| --- | --- | --- |
| `const {value}=root.secretAlpha` | `of 'root.secretAlpha' as it is null` | `root._p<hash>`, 1 own key rewritten |
| `({value}=root.secretAlpha)` | `of 'root.secretAlpha' as it is null` | `root._p<hash>`, 1 rewritten |
| `const {value}=root.secretAlpha??null` | `of '(root.secretAlpha ?? null)' as it is null` | `root._p<hash>`, 1 rewritten |

The first conservative patch `afc7fa0febeba3812883ac4a3ec0605fb348f836` extended direct destructuring ancestry checks to `ObjectPattern`. On exact source `c5e7b99a67d5d603e0fe69cb6c1b6ffcdb33a7b0`, [two-OS CI 44363500253](https://github.com/FlareZ123/obfs/actions/runs/44363500253) passed all nine **guarded** cases per OS, with zero renamed unsafe fields and native/emitted equality; an unrelated safe private field still had one genuine rewrite in every mode.

A second source-pinned negative test identified a further omission: two **nested default destructuring operands** under `AssignmentPattern.right`. Immutable partial-guard source `0683fcbf0a4e69f53f07ca325d84fc3aa8645929` and [two-OS CI 44364110315](https://github.com/FlareZ123/obfs/actions/runs/44364110315) verified that the first three cases remained guarded while each of **2 nested variants × 3 modes = 6 cases per OS** still transformed one key and produced nonidentical caught messages:

- `const [{value}=root.secretAlpha]=[undefined]`
- `const {nested:{value}=root.secretAlpha}={nested:undefined}`

These two held-out patterns proved that guarding only top-level destructuring was insufficient.

## Guard and evidence boundary

The additional compiler-only patch `c3b831ba9a46007de34f2a7cda15c2b31cb60cfc` now rejects a protected-key rewrite when a member expression participates in an `AssignmentPattern.right` and the default's `left` is an array or object pattern. Both patches follow the existing enclosing-expression ancestry chain, so logical-expression wrappers remain covered. The durable [Node regression](../test/property-nullish-destructure-error.test.js) invokes all five specimens across COO, SNO and SCO with `--expect-guarded`, and checks that safe unrelated private-key rewriting retains positive yield. The dedicated [manual two-platform gate](../.github/workflows/manual-nullish-pattern-source.yml) runs the exact differential, deterministic unit test and JSDoc compilation.

Post-fix source pin: `913b4c07e5c4f0d10169d8d6f786923e23b0ca38`, branch `agent8/nullish-pattern-complete-fix-20261118`. Dedicated differential and full-validation workflows were dispatched at this source pin; their final status should be inserted after inspection. Preserve the pre-fix counterexamples and frozen source hashes even when the guarded program passes.

This is an intentional **conservative refusal**. It does not claim every object pattern needs refusal, every JavaScript engine emits identical exception text, or that an input-level formal proof for arbitrary nested expressions has been completed. All measured source cases are CJS executed on Node 22/V8. The change does not add work to the resulting running program and does not repair other unproven error-spelling contexts; the overall strong-protection release remains blocked.
