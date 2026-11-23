# 23 November 22:41Z complete-main acceptance: exact 15 red cases on both OS

**Agent 7. Intermediate source-pinned correctness integration, 23 Nov 2026.**
This is **RED** evidence and does not modify the authoritative
**RELEASE-BLOCKED** strong-protection decision.

## Immutable receipt

Unfocused [main workflow 45282068819](https://github.com/FlareZ123/obfs/actions/runs/45282068819)
was dispatched on immutable source
`e9b1036d52b9c404214fddbecfdb0d6230899473`.
The workflow ran Node 22.23.4 on both Ubuntu and Windows via the
`sims/compact-node-test-runner.js` collector with complete
`FAILED_TEST_INDEX` records:

| Platform | Total tests | Pass | Fail | Skip | Behavioral-stage duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 5,334 | 5,294 | **15** | 25 | 285,959 ms |
| Windows | 5,334 | 5,287 | **15** | 32 | 618,113 ms |

The **same 15 named cases** failed on both. This is a **source-specific**
result and should not be silently attributed to earlier or later commits.
The newer test corpus also grew from 5,237 tests in the previous complete
[23 November red workflow 45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841);
its 26 failures per OS cannot be causally compared by raw count alone.

## Exact same-name failures on both platforms

1. `bound-runtime-interception.test.js`: hostile bind interception of
   private target source (expected 2 private-field transforms; observed 0).
2. `bound-runtime-minifier-control.test.js`: same private target in
   minified/obfuscated ESM (expected 2, observed 0).
3. `factory-object-flow.test.js`: private two-file ESM factory
   (expected one field rewrite, observed 0).
4. `function-declaration-reader-proof.test.js`: native cross-module
   named declaration reader (expected two changed keys; observed none).
5. `function-declaration-reader-proof.test.js`: public-only
   normalization/clone control (expected one changed key, observed 0).
6. `interfile.test.js`: four-file ESM dataflow with imports, nested calls
   and external APIs (expected one changed key, observed 0).
7. `private-class-source-yield.test.js`: COO private direct-use class
   (expected positive private field rewrite, observed none).
8. `private-class-source-yield.test.js`: same SNO source and expectation.
9. `private-tuple-session.test.js`: complete cold tuple session
   (expected two private-field rewrites, observed 0).
10. `sno-bound-runtime-interception.test.js`: host binds private target
    before SNO load (expected two rewrites, observed 0).
11. `source-stable-bound-export.test.js`: public bound function native
    metadata and private fields (expected two rewrites, observed 0).
12. `symbol-key-static-recovery.test.js`: seedless public-output recovery
    of static generated example (attempted calling no-longer-exported `calc`).
13. `symbol-key-static-recovery.test.js`: attacker with ordinary identifier
    lowering (expected two Symbol keys; observed 0).
14. `symbol-key-static-recovery.test.js`: runtime Symbol constructor
    interception (attempted invoking no-longer-exported `calc`).
15. `symbol-key-static-recovery.test.js`: runtime generated-Symbol
    collision (attempted invoking no-longer-exported `calc`).

All cases have exact native vs transformed/value/count assertions in their
named tests. A failed **positive-yield** assertion is distinct from a
demonstrated native-vs-generated runtime mismatch. A conservative refusal
may be the only 1:1 source-sensitive option; dropping the test without an
independent transformed positive would weaken coverage. Agent 9's
[unmerged class proof PR #357](https://github.com/FlareZ123/obfs/pull/357)
at this checkpoint is separate research; there is no automatic basis for
promoting or discarding the class failures.

## Immediate correction to one regression group

The four Symbol attacker failures were introduced by Agent 7's earlier
[Symbol fixture PR #360](https://github.com/FlareZ123/obfs/pull/360),
which changed the **documented example API** from an exported callable
to a privately computed numeric result vector while preserving two
actually generated symbols. The static attacker harness still assumed the
old exported callable. Agent 7 corrected the attack tests (no compiler
change) to recover the published numeric vector and preserve actual
seedless reconstruction, hostile Symbol interception and collision.
[PR #366](https://github.com/FlareZ123/obfs/pull/366) squash-merged as
`6703bb239fef40805227324e47e09fb1f8b199b7`.
The [branch focused check 45283118743](https://github.com/FlareZ123/obfs/actions/runs/45283118743)
and [post-merge main focused 45283386897](https://github.com/FlareZ123/obfs/actions/runs/45283386897)
passed the attacker test file and strict JSDoc on both platforms.

Those fixes are **outside** the `e9b103...` frozen 15-failure source.
A later unfocused
[workflow 45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363)
was dispatched on main source
`9e614760c75a293a37178fa6e63489d9b904b0ae` to remeasure
correctness after the repair. Its result must be recorded independently
before concluding how many full-suite failures remain.

## Release interpretation

The original **26-failure** main source had several stale positive-yield
expectations since corrected by independently passing focused regressions.
A full 5,334-test receipt is stronger coverage but this exact run still
fails on both OS. The independent 21 November confidentiality/runtime-cost
counterexamples also persist, so **RELEASE-BLOCKED** is unchanged.
Future triage should preserve the 11 separate uncorrected failure names,
and insist on a real source/private-owner eligibility proof before
claiming rewritten fields or improved obfuscation strength.
