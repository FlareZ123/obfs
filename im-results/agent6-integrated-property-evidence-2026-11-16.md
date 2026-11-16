# Integrated main: bounded property-proof safety, protected-work yield and paired runtime

**Agent 6, 2026-11-16. Classification:** reproducible intermediate engineering evidence. This is an exact-source summary of three merged compiler changes, not a claim of academic obfuscation security.

## Frozen integrated source and cross-platform validation

Main after [PR #28](https://github.com/FlareZ123/obfs/pull/28), [PR #29](https://github.com/FlareZ123/obfs/pull/29) and [PR #30](https://github.com/FlareZ123/obfs/pull/30): **commit `35fb993888471a9c5fc87cdd239506fe187fd02d`**. [Integrated validation run 43880636281](https://github.com/FlareZ123/obfs/actions/runs/43880636281) completed **successfully** on Node 22, Ubuntu and Windows. Ubuntu counted **1697 Node tests, 1696 passed, 0 failed, 1 skipped**; Windows counted **1697 tests, 1695 passed, 0 failed, 2 skipped**. Both ran strict JSDoc, sampled benchmarks and full-process profiles; Ubuntu also ran real Chromium and reported `VERIFIED_RECORD_CHROMIUM` with **64 cases**, two private keys renamed for each eligible application, exact native/generated parity and publicly fetchable compiled source.

The underlying true semantic counterexamples had exact *pre-fix* source/CI pinned independently: declaration-form ambient reflection extraction, **2 failures** at [43872277758](https://github.com/FlareZ123/obfs/actions/runs/43872277758); assignment-form extraction, **3 failures** at [43879639756](https://github.com/FlareZ123/obfs/actions/runs/43879639756). The respective post-fix greens were [43876531480](https://github.com/FlareZ123/obfs/actions/runs/43876531480) and [43879794268](https://github.com/FlareZ123/obfs/actions/runs/43879794268). Each failure changed a host callback's observed ESM exported-owner key from `secretField` to a generated `_p...` name. The repaired proof declines renaming under source-visible native `Reflect.ownKeys` mutation.

## Meaningful protected work vs legitimate refusal

The separate six-module **null-prototype record** application starts with a syntactically null-prototype private local record, retains literal `inspectRecord('noSuchField')` and has two function-source observers explicitly removed relative to the frozen original. On this *different original-source contract*, the compiler correctly renames **2 of 2 private owner fields** while maintaining native/emitted parity across the application scenarios. The separate **own-key-only** variant also renames 2/2. The **unchanged frozen source-observing application** and observer-free **plain-prototype missing-key application** remain **0/2** for safety. Never report the 2/2 as coverage recovered on the unchanged frozen application.

At integration, real Chromium ran the two genuinely transformed six-module variants against the same host with `Object.prototype.noSuchField=Function`. Its null-prototype missing-key results remained undefined. Publicly distributed compiled owner code was fetchable and public-only offline cloning still matched all held-out cases. Positive rename count therefore demonstrates non-vacuous compiler work and **does not establish unauthorized-use prevention or reconstruction resistance**.

## Complete Node process duration, generated/native median ratios

All values below are **9 paired alternating-process trials**, from integrated main [run 43880636281](https://github.com/FlareZ123/obfs/actions/runs/43880636281) and `sims/verified-record-session-profile.js`. Durations include Node startup/ESM module loading and application execution. These are finite workloads on CI runners, and no universal bound is established.

| Deliberately changed application | Workload | Ubuntu ratio | Windows ratio |
|---|---|---:|---:|
| Own-key-only | One-event startup | 0.97994× | 1.01240× |
| Own-key-only | 80-case session | 1.00103× | 1.03282× |
| Null-prototype, missing-key retained | One-event startup | 0.99033× | 1.05815× |
| Null-prototype, missing-key retained | 80-case session | 1.02828× | 0.99060× |

All measured cases were within the requested **2.5×** budget on these exact workloads. Run does not establish hot-loop cost or arbitrary project performance.

## Research decision boundary

- **Verified:** correction of five concrete cross-platform native/emitted ESM key-observation failures, safe exactly null-prototype property-reflection eligibility, two positive transformed-owner fields on each distinctly modified source contract, and measured bounded full-process cost.
- **Still unproven:** soundness for general JavaScript and all host/realm effects; static/dynamic reconstruction resistance and anti-instrumentation; local execution authorization against full-control COO/SNO attackers; a universal 2.5× upper bound; and whether these property-name transformations substantially increase measured attacker effort over a native/minified control.
- **Next experiment:** evaluate a reusable binding-identity and call-effect provenance pass, as proposed in [workplace/ambient-capability-effect-proof-design-2026-11-16.md](../workplace/ambient-capability-effect-proof-design-2026-11-16.md), and then run a frozen, budget-matched public-only attack. Avoid further isolated CI greens without a protected-work fraction and independently measured attacker cost.
