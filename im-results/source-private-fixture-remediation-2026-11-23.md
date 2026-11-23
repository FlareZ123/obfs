# Source-private positive controls after callable-source parity, 23 November 2026

**Classification:** intermediate correctness/test-fixture remediation; **not** a release-grade security or performance finding. **Author:** Agent 11.

## Failure and exact boundary

The 23 November PR #322 regression inventory (`im-results/pr322-full-suite-integration-gap-2026-11-23.md`) reported 58 failed Node tests at postmerge SHA `9d793f3f83e88059d9207702aa8dfdd9db16a8de`. A class of positive controls expected field rewriting inside an exported, source-observable callback or otherwise source-unproved function. That expectation conflicts with the compiler's conservative Function#toString parity policy. A green transformation counter must be supported by a genuinely nonescaping property owner.

We changed only fixture source and explanatory comments. No compiler guard was removed or relaxed. Negative source-observer cases and their exact native/emitted equality assertions remain in place.

| Focused test file | Formerly red positive cases | Fixture repair |
| --- | ---: | --- |
| `test/fetch-constructor-function-source.test.js` | 16 | Move `secretField` into directly called `privateRead`, outside the published Promise callback |
| `test/web-idl-record-source-observation.test.js` | 4 | Same for record constructor and redirect primitive controls |
| `test/implicit-comparison-source.test.js` | 1 | Keep `inspect` function source stable; move owned field into separate private direct-call helper |
| `test/object-from-entries-source-observation.test.js` | 1 | Keep Map function identity independently stable; private field in helper |
| `test/property-key-source-observation.test.js` | 1 | Keep function-key source stable; separate private helper |
| `test/bound-native-constructor-source-observer.test.js` | 1 | Keep returned public arrow source stable; move two owner keys into local helper |
| `test/indirect-native-bind-source-observer.test.js` | 1 | Same, with native indirect bind primitive control |
| `test/inline-bound-native-coercer-source.test.js` | 1 | Same, with native bound coercer primitive control |

The original tests still require native/emitted value parity and **nonzero private-key transformation**, including their original exact `metrics.properties` assertions, so the repair is not a change to permit zero-obfuscation passes.

## Source-pinned focused validation

The existing `.github/workflows/manual-validation.yml` `focused` job runs on **Ubuntu and Windows with Node 22**; it is deliberately narrower than full mainline validation.

- Fetch/File fixture source `03e77b72bd0d6aa8416e08e8b8af108f1113b972`: [run 45123472513](https://github.com/FlareZ123/obfs/actions/runs/45123472513), passed.
- The WebIDL record, comparison and Object.fromEntries fixtures at source `2d91e9859dfc2cad95919d16b61636825f7249df`: [45123621097](https://github.com/FlareZ123/obfs/actions/runs/45123621097), [45123626195](https://github.com/FlareZ123/obfs/actions/runs/45123626195), [45123631176](https://github.com/FlareZ123/obfs/actions/runs/45123631176), all passed.
- Map-key fixture at source `98f0e48ceebd1364185ee3c64705ba6d3a8a191b`: [45123706473](https://github.com/FlareZ123/obfs/actions/runs/45123706473), passed.
- Bound-native suite at source `028d0015dc680f89074c9647368e248cd3b0de0e`: [45123852254](https://github.com/FlareZ123/obfs/actions/runs/45123852254), [45123857485](https://github.com/FlareZ123/obfs/actions/runs/45123857485), [45123862900](https://github.com/FlareZ123/obfs/actions/runs/45123862900), all passed.

Thus eight focused runs with two operating systems each passed their own named suites, covering **26 originally red test cases** in the pre-repair inventory. This count does **not** establish that the current full-mainline failure inventory decreased by exactly 26, because other agents' concurrent modifications and changes in full-run source pins must be reconciled separately.

## Scope and next acceptance action

These controls correct an invalid test premise and preserve the independent source-observation negatives. They do not prove arbitrary property dataflow safety, exposure resistance under uncontrolled runtime instrumentation, or the universal 2.5× runtime bound.

**Agent 10 remains the full integration acceptance owner.** Before any stronger claim, rerun and inspect the complete current-mainline two-platform Node/Chromium/typecheck/benchmark matrix at one exact frozen source commit. Keep the global **RELEASE-BLOCKED** decision until the unrelated source-parity and attacker/performance blockers are resolved.
