# Private tuple direct-call source boundary (2026-11-26)

## Question

The existing `private-tuple-session` benchmark expects two owner-field renames while exporting the scoring function itself as `module.exports`. That exposes a callable to the host; the callable's `Function#toString` is observable and contains the original property spellings. The compiler's refusal is consistent with the source-observer preservation boundary.

Can the same tuple/owner dataflow be transformed when the scoring function remains private and only its primitive result escapes?

## Experimental branch

- Branch: `agent2/private-tuple-private-call-20261126`
- Initial test commit: `ab2216840a83e0c271cd2c82e7f832f06a188d9c`
- Reframed benchmark commit: `2987f280682bdcffb99a36218f3a796407d5f481`
- Test: `test/agent2-private-tuple-private-call.test.js`
- Focused CI run 4237: [45766410356](https://github.com/FlareZ123/obfs/actions/runs/45766410356)

The positive fixture is also now the actual `sims/private-tuple-session.js` cold-session benchmark: it keeps `score` private, invokes it inside the module, and exports only the numeric result. The operation count is injected as a primitive VM-context binding. The separate test file retains the paired public-callable refusal.

The positive fixture:
1. creates an owner record with `hiddenCount` and `privateDelta`;
2. stores the owner in fixed tuple slot 2;
3. binds `alias = tuple[2]`;
4. declares `score` as a uniquely bound `FunctionDeclaration`;
5. calls `score(operations)` directly inside the module; and
6. exports only the numeric result.

The score body has no host calls, callbacks, reflection, or function escape. The test asserts two property rewrites, absence of both original keys, and equal results for 0, 1, 100, and 10,000 operations in COO, SNO, and SCO.

A paired negative fixture exports the score function itself. It asserts zero property rewrites, byte-identical emitted source, and identical `Function#toString` output. This distinguishes the safe private-call shape from the source-observable public callable.

## Evidence

- Focused run 4237 passed the three-mode private-call positive and public-callable refusal matrix on Ubuntu and Windows, including strict project JSDoc, external JSDoc, and runtime-budget evaluator typechecks.
- Focused run 4243 passed the reworked `test/private-tuple-session.test.js` on Ubuntu and Windows, with the same JSDoc checks.
- The 500,000-operation cold-session profile now runs 11 alternating trials per workload. All observed medians were within 2.5x:

| Operations | Ubuntu ratio | Windows ratio |
|---:|---:|---:|
| 1 | 0.986x | 1.008x |
| 100 | 1.015x | 0.967x |
| 10,000 | 0.993x | 0.994x |
| 500,000 | 1.122x | 0.983x |

The output was 273 source bytes / 279 emitted bytes and reported two renamed owner fields. The benchmark logs `within2point5` but does not assert the 2.5x bound as a hard correctness condition; these are observed measurements, not a universal guarantee.

No full-suite result is claimed for the combined class/tuple branch.

## Proposed next step

If independently reviewed, reframe `sims/private-tuple-session.js` so the private scoring function is called within the module and only its primitive result escapes (for example, inject an immutable numeric operation count into the VM context). Preserve a separate explicit refusal test for the exported-callable shape. Re-run the full suite and the 1/100/10,000/500,000 cold-session profile, checking all outputs and the 2.5x runtime bound.

Do not broaden the generic direct-call-only proof based on this fixture alone. The fixture contains no host interaction; arbitrary direct-called function bodies still require the existing source-observer and escape analysis.
