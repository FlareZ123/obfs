# Narrow private class-method owner proof (2026-11-26)

## Result

A conservative class-method proof was ported to the current `main` source baseline. It admits only a local instance whose owning class has one non-static, non-computed method with the exact body `return this.<field>`, and whose instance and method remain private under the existing escape/source-observer checks. The method is added to the private-function set only after the complete shape is established. All other class shapes fail closed.

The change resolves the two existing private-class source-yield cases without broadening bound-function, exported-callable, or general method proofs.

## Reproducibility

- Candidate branch: `agent2/private-class-proof-current-main-20261126`
- Candidate commit: `754e57dc78d9073c1718cc60215cf662a8c0c871`
- Focused 57-case admission matrix: run 4232, Ubuntu and Windows passed.
- Focused class source-yield test: run 4233, Ubuntu and Windows passed.
- Full validation: run 4235, both OS completed. The two class-yield failures are absent. Windows retains nine known failures; Ubuntu retains those nine plus one timing-sensitive `benchmark-private-positive` failure. A focused rerun of that benchmark test (run 4256) passed on both OS. Treat the extra Ubuntu full-suite failure as unresolved/flaky until reproduced, not as a proven regression or a pass.

The candidate was based on parent commit `5f310def8b9b7929c65cbd97d2bcbc4a38f510e2`. The `src/properties.js` and `test/private-class-source-yield.test.js` blobs were byte-identical to the earlier control baseline at `59828dea0449a8284f7480225eca1e1a2e0443de`, isolating the implementation change.

## Proof boundary

The admission matrix covers positive direct/aliased local instances and decoys involving static/computed methods, extra methods, constructors, assignments, escaping instances, dynamic access, reflection, and source observation. It passes in COO, SNO, and SCO. This is not a general class analysis: no claim is made for multiple methods, computed/static methods, constructor-assigned fields, arbitrary aliases, inheritance, proxies, reflection, or escaping instances.

The proof adds no runtime VM, network dependency, or initialization work. It is a static compiler admission rule; runtime overhead should remain that of the transformed property access. No independent runtime microbenchmark of the class fixture has yet been recorded.

## Remaining full-gate failures

The remaining nine failures are not automatically nine missing transformations. Several fixtures demand property rewrites inside source-observable or public interfaces:

- custom `Function.prototype.bind` interception can observe the target callable and may make behavior depend on its source;
- the ESM factory case exports a callable reader;
- the cross-module reader cases export functions or objects whose source/shape is public;
- the tuple session exports the scoring callable itself;
- the public-source normalization case deliberately exposes a callable's source.

These should be reviewed as safety-contract questions, not blindly fixed by widening the proof. The private tuple benchmark has a separate safe positive reframe: keep the score function local, invoke it inside the module, and export only its numeric result (see `im-results/agent2-private-tuple-private-call-2026-11-26.md`).

## Next work

1. Independently review the class admission code and its decoy matrix.
2. Re-run the full suite to determine whether the Ubuntu benchmark failure is a load-sensitive timing flake.
3. Reclassify each remaining yield assertion as either a genuinely private positive fixture or an intentional source-observer/public-interface refusal.
4. Do not weaken fail-closed source-observer rules to make the suite green.
