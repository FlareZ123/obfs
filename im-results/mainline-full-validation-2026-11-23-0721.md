# 23 November 07:21 UTC frozen-main full Node/Chromium acceptance: 18 red assertions per OS

**Classification: exact-source comprehensive engineering-validation receipt.**
This is an intermediate release-admission diagnostic, not a new security
result, not a safe-to-merge verdict, and not a current moving-main certificate.

## Frozen source and reproducible gate

- Git source commit: [`44fc7ccd7224b252c4e3cce74566db19e4fec788`](https://github.com/FlareZ123/obfs/commit/44fc7ccd7224b252c4e3cce74566db19e4fec788).
- Immutable test branch (not subsequently modified): [`agent46/main-baseline-freeze-20261123-0721`](https://github.com/FlareZ123/obfs/tree/agent46/main-baseline-freeze-20261123-0721).
- Existing manual workflow with **empty** `focused_test` input:
  [run 45130250828](https://github.com/FlareZ123/obfs/actions/runs/45130250828),
  completed **failure** on 23 November 2026. Two Node22 matrix jobs
  executed Node **22.23.4** and the full `node sims/compact-node-test-runner.js`,
  type checks, benchmarks, and the applicable real-Chromium fixtures.
- Ubuntu: **5,102 tests; 5,081 pass, 18 fail, 3 skip**.
  Windows: **5,102 tests; 5,074 pass, 18 fail, 10 skip**.
  Both platforms emitted the **same 18 case names** in `FAILED_TEST_INDEX`
  with `actual`/`expected`; platform-specific skipped counts differ.
- The **only failed workflow step on either OS** was
  `Behavioral and adversarial suites with compact failure diagnostics`.
  The project and external strict JSDoc, specialized strict typechecks,
  existing benchmark, own-key/null-prototype process profiles and local
  formal-value profiles all **passed** as workflow steps. Ubuntu additionally
  passed the real Chromium module/host-lock, null-prototype and cross-module
  source-observer fixtures. Step success does **not** certify a universal
  ≤2.5× compute budget or every JavaScript program.

## Complete failed-case inventory (same case titles on both operating systems)

The values below come from the workflow's machine-readable `FAILED_TEST_INDEX`,
rather than guessing which branch changes caused each failure.
`false` values correspond to positive-work predicates; other failures
compare an observed number of transformed fields with a positive expectation.

| # | Test file | Failed case short name | Actual | Expected |
|---:|---|---|---:|---:|
| 1 | `blob-constructor-alias-source-observer.test.js` | bound Blob constructor, primitive input | 0 | 2 |
| 2 | `blob-options-function-source-observer.test.js` | primitive Blob options, private fields | 0 | 2 |
| 3 | `bound-runtime-interception.test.js` | hostile bind, private-target source | 0 | 2 |
| 4 | `bound-runtime-minifier-control.test.js` | pre-import bind, minified/obfuscated ESM | 0 | 2 |
| 5 | `factory-object-flow.test.js` | private ESM factory, two-file Node | 0 | 1 |
| 6 | `function-declaration-reader-proof.test.js` | cross-module named reader | false | true |
| 7 | `function-declaration-reader-proof.test.js` | public normalizer functional clone | 0 | 1 |
| 8 | `interfile.test.js` | four-file ESM owner dataflow | 0 | 1 |
| 9 | `private-class-source-yield.test.js` | COO private direct-use class | false | true |
| 10 | `private-class-source-yield.test.js` | SNO private direct-use class | false | true |
| 11 | `private-tuple-session.test.js` | private tuple cold session | 0 | 2 |
| 12 | `property-hotpath-closedworld.test.js` | closed-world hot ESM flow patterns | 1 | 3 |
| 13 | `sno-bound-runtime-interception.test.js` | SNO bound target under interception | 0 | 2 |
| 14 | `source-stable-bound-export.test.js` | bound public export, primitive fields | 0 | 2 |
| 15 | `symbol-key-static-recovery.test.js` | symbol-key attacker after identifier pass | 0 | 2 |
| 16 | `symbol-keys.test.js` | local Symbol mutation proof | 0 | 1 |
| 17 | `symbol-keys.test.js` | real two-file ESM Symbol transform | 0 | 2 |
| 18 | `symbol-keys.test.js` | generated example byte reproduction | 0 | 1 |

The trace places all 18 failed assertions at **transformation-yield checks**,
not at a native-versus-emitted value comparison. It does not prove that every
subsequent semantic assertion would have passed, and a disappeared valid
private rewrite is a real precision and coverage regression even when
conservative refusal preserves the observable program result. In particular,
the private direct-use class and ESM factory/reader witnesses deserve
independent proof-path inspection before their expectations are relaxed.

## Relation to earlier integration evidence

The older [full mainline run 45120235247](https://github.com/FlareZ123/obfs/actions/runs/45120235247)
at `3d8e5e729bd4681f18c4551b248e245a2b623e22`
recorded **54/5,077** failed Node assertions per OS. The new frozen
source has **18/5,102**. These are different source commits, suites and
elapsed histories: the 36-count reduction is a descriptive before/after
comparison, **not** attribution of which precise change repaired each case.

## Decision and suggested disposition

**Full-suite admission is still RED.** Keep Agent 10 as the full-suite
disposition owner and Agent 3 as the canonical source-observer/decoder
integration owner. Triage the 18 rows in finite categories: genuine
private-yield lost, formerly unsound public-callable positive expectation,
or still-unproved source-observer contract. Test a native observer oracle
and at least one independently private transform before amending a fixture.
No release-grade security, universal environment locking or sustained
≤2.5× performance claim follows. Main may advance after the frozen SHA;
a later moving-main HEAD requires its own source-pinned full receipt.
