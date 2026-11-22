# Canonical source-compatibility reviewer: exhaustive two-platform integration-gate audit

**Date:** 22 November 2026 UTC. **Agent:** Agent 4. **Status:** intermediate validation evidence, not a release finding.

## Frozen source and exact full-run evidence

The full Node22 manual validation was dispatched on reviewer branch `agent4/review-classic-source-witness-20261122` at exact source SHA `23fb08cc31337014fd842b7d42a3d1aa39227d24`, derived from the pending Agent3 canonical source-preservation PR #299 `b826c10e3c59c2210c00448a0645bb8751a87758`. [Full GitHub Actions run 45080886889](https://github.com/FlareZ123/obfs/actions/runs/45080886889) completed **FAILED** on both operating systems. The suite's raw summary was:

| Node 22.23.4 host | Tests | Passed | Failed | Recorded duration |
|---|---:|---:|---:|---:|
| Ubuntu latest | 5,258 | 5,205 | 52 | 187,302 ms |
| Windows latest | 5,258 | 5,201 | 52 | 408,330 ms |

These counts include runner-defined pending/skipped cases; `passed + failed` is intentionally less than total. Both OSes showed **the same 32 failing test files**, even though their timing and some skip counts differ. Ubuntu separately failed a real browser module integration and a real Chromium public-source test. Windows Node suite stopped after its failed node-test step, so its later Chromium jobs did not run. Any current-release claim based on individual green tests would be incorrect.

## Failed test-file inventory (both OSes)

```text
test/array-owner-flow.test.js
test/array-owner-grid.test.js
test/array-owner-interfile.test.js
test/blob-constructor-alias-source-observer.test.js
test/blob-options-function-source-observer.test.js
test/bound-native-constructor-source-observer.test.js
test/bound-runtime-interception.test.js
test/bound-runtime-minifier-control.test.js
test/clone-exported-alias-esm.test.js
test/clone-source-esm-graph.test.js
test/esm-public-callable-source.test.js
test/factory-object-flow.test.js
test/implicit-comparison-source.test.js
test/implicit-source-mode-matrix.test.js
test/indirect-native-bind-source-observer.test.js
test/inline-bound-native-coercer-source.test.js
test/intl-cross-file-source.test.js
test/object-from-entries-source-observation.test.js
test/owned-constant-key-sample.test.js
test/primitive-coercer-sample.test.js
test/private-class-source-yield.test.js
test/private-record-grid.test.js
test/private-record-proof.test.js
test/private-tuple-grid.test.js
test/private-tuple-proof.test.js
test/private-tuple-session.test.js
test/property-key-source-observation.test.js
test/sco-interfile-source-observation.test.js
test/sno-bound-runtime-interception.test.js
test/source-stable-bound-export.test.js
test/symbol-key-static-recovery.test.js
test/symbol-keys.test.js
```

The leading failures are dominated by expected property renames that are **now declined** because the relevant key occurs in an externally source-visible function. For example, `test/private-record-proof.test.js` expects two renames even though its public `module.exports=function run(n){...right.secretDelta...}` exposes the field name in `Function.prototype.toString`; `test/private-tuple-proof.test.js` likewise expects rewritten `export function measure(n){return alias.hiddenCount*n+owner.privateDelta}`. Revising these to simply expect zero is insufficient for a meaningful obfuscation benchmark; replacing exported work with an independently source-paired, private direct-call-only helper lets the compiler protect the actual private field while leaving external function source untouched.

The opposite category also exists: `test/esm-public-callable-source.test.js` and the standalone Chromium test `test/esm-public-callable-browser.js` detected an *actual source-equivalence defect* on the current integration branch. The latter was blocked before browser launch at its positive private-yield/public-source assertions in the Ubuntu full-run log. These require source preservation in the compiler, not weakened tests. The many attacks on emitted private property labels in the original corpus also lose their intended genuine-transformation precondition when the compiler correctly declines source-exposed keys, so their source inputs require independent revisiting.

## Independently green, nonvacuous controls

Focused dual-OS strict-JSDoc tests on earlier exact reviewer heads separately established:

- Classic-script global function and global lexical function source matching with distinct independently encoded top-level string: [45079980553](https://github.com/FlareZ123/obfs/actions/runs/45079980553)
- Nonzero private hot-property rename with preserved exported wrapper source: [45079610876](https://github.com/FlareZ123/obfs/actions/runs/45079610876)
- Eleven sampled benchmarks, ten with authentic private-key renaming and exported source parity, all sampled ≤2.5×: [45079859192](https://github.com/FlareZ123/obfs/actions/runs/45079859192)
- One-hop exported reader → unary direct-only private helper with two fields renamed under `preservePublicCallableSource` and 10 fail-closed negative tests: [45080729536](https://github.com/FlareZ123/obfs/actions/runs/45080729536), [45080775036](https://github.com/FlareZ123/obfs/actions/runs/45080775036)
- Paired end-to-end native/emitted full ESM sessions on two *explicitly modified six-module inputs* (own-only and null-prototype records), each with two verified cross-file property changes and ratios 0.9609–1.0138 across 8 OS/workload combinations: [45080732944](https://github.com/FlareZ123/obfs/actions/runs/45080732944)

These are valuable intermediate positive evidence. None overrides the overall red full suite or defeats a hostile browser/Node attacker.

## Integration recommendation

1. Freeze source SHA and preserve legacy red tests in their existing form until the loss of their positive transformation is understood. Add separately named private-helper positive application contracts; test original exported source refusal and transformed private field yield independently.
2. Maintain adversarial attack reproduction on emitted actually transformed programs. An attack against unchanged input source is not evidence of robust or weak obfuscation.
3. Fix genuine source-parity defects and preserve public interface source when a second module/browser or host can obtain it.
4. Rerun the full Node22 Ubuntu+Windows suite and actual Chrome at a single matching head. The immutable 2.5× runtime requirement needs representative real workloads and additional distribution; 9-median or 11-benchmark green alone is not universal.
5. Keep the three-mode strong-security decision **RELEASE-BLOCKED**, pending static/dynamic extraction, tamper resistance and hostile environment tests, and a green complete compatibility gate.

The canonical integration owner is Agent 3. This is a reviewer audit with independently reproducible run IDs, not a proposal to merge a competing PR.

## Follow-up full Node validation and reproducible reductions (22 November 2026)

A later complete Ubuntu+Windows run [45082658100](https://github.com/FlareZ123/obfs/actions/runs/45082658100) at frozen reviewer SHA `a28a62d8d4f31da083e0f40b283885ca94d686f5` finished **FAILED on both operating systems**, but established substantial, source-paired compatibility improvement without removing failing tests from the runner. Counts in its original GitHub Actions Node TAP logs:

| Host | Tests | Passed | Failed | Skipped | TAP duration |
|---|---:|---:|---:|---:|---:|
| Ubuntu Node 22.23.4 | 5,258 | 5,229 | 28 | 1 | 287,318 ms |
| Windows Node 22.23.4 | 5,258 | 5,225 | 28 | 5 | 484,261 ms |

The two-platform failing test-file inventory declined from 32 to 23. Remaining names at that exact SHA: `array-owner-grid`, `blob-constructor-alias-source-observer`, `blob-options-function-source-observer`, `bound-native-constructor-source-observer`, `bound-runtime-interception`, `bound-runtime-minifier-control`, `clone-exported-alias-esm`, `clone-source-esm-graph`, `implicit-comparison-source`, `implicit-source-mode-matrix`, `indirect-native-bind-source-observer`, `inline-bound-native-coercer-source`, `intl-cross-file-source`, `object-from-entries-source-observation`, `owned-constant-key-sample`, `primitive-coercer-sample`, `private-class-source-yield`, `property-key-source-observation`, `sco-interfile-source-observation`, `sno-bound-runtime-interception`, `source-stable-bound-export`, `symbol-key-static-recovery`, and `symbol-keys` (paths all under `test/` with `.test.js`). This revised baseline still predates subsequent source-paired changes and the independently verified class and strict-comparison proof refinements.

The later focused Ubuntu+Windows strict-JSDoc runs each completed **SUCCESS**, demonstrating that the new source-paired tests preserve authentic private-field transformations while the public observable sources stay stable:

- Private-class owned-field proof plus 13-case fail-closed source-exposure matrix, including dynamic-method dispatch refusal and safe constant computed method invocation: [45083099176](https://github.com/FlareZ123/obfs/actions/runs/45083099176) (the earlier matrix [45082984049](https://github.com/FlareZ123/obfs/actions/runs/45082984049) had an overstrict expectation that constant computed method dispatch must refuse).
- Independent strict identity comparisons of otherwise private callables: [45082759056](https://github.com/FlareZ123/obfs/actions/runs/45082759056). Loose comparisons and source coercions remain excluded.
- The source-paired array-owner exhaustive grammar, hostile bind interception, standalone public-bound target refusal, Symbol-key recovery and checked-in deterministic sample, Map-source-key identity, imported ESM cloning, cross-module primitive logging and Intl guarded reads were all independently strict-green at source-pinned focused runs [45083262416](https://github.com/FlareZ123/obfs/actions/runs/45083262416), [45083314488](https://github.com/FlareZ123/obfs/actions/runs/45083314488), [45083517013](https://github.com/FlareZ123/obfs/actions/runs/45083517013), [45083579741](https://github.com/FlareZ123/obfs/actions/runs/45083579741), [45083671270](https://github.com/FlareZ123/obfs/actions/runs/45083671270), and [45083780141](https://github.com/FlareZ123/obfs/actions/runs/45083780141). Source control retains exact per-file branches and hashes.
- Real Chromium full 43-step workflow [45083138356](https://github.com/FlareZ123/obfs/actions/runs/45083138356) at reviewer SHA `528ac8265e6fd5a901bd314df68cb76be7301a3b` passed, now including classic-script lexical class and method `Function#toString` parity in an independent later script. All four earlier classic-function syntax families still pass with actual encoded unrelated string protection.

Two later full two-platform Node runs are underway at further reviewer SHA pins and have **no claimed outcome in this follow-up entry**: [45083944029](https://github.com/FlareZ123/obfs/actions/runs/45083944029) at `8715e1c8cdb8da15071c7c1aac143de44df601a6` and [45084079655](https://github.com/FlareZ123/obfs/actions/runs/45084079655) at `6775736b09364107d4ebc15f4ebaa6a9f827ed7c`, plus [45084135912](https://github.com/FlareZ123/obfs/actions/runs/45084135912) at `005ea5d075f6c903fc6ad26680b5b08921e75a29`. Only the full gate's actual per-SHA result may justify improving the integrated compatibility verdict. Strong SCO/COO/SNO adversarial release remains **RELEASE-BLOCKED**, irrespective of how many compatibility tests pass.
