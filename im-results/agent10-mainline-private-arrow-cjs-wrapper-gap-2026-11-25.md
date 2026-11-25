# Agent 10: current-main private-arrow CommonJS wrapper source-observation gap

**Date:** 2026-11-25  
**Main source snapshot:** `47f46784059f673d73f901f2ffa5b44752ecc4d4`  
**Test-only branch:** `agent10/private-arrow-cjs-main-baseline-20261125`  
**Exact test commit:** `dd42b9f1f449a5acbe14f8f7684b8d14392fad10`  
**Focused two-platform run:** [45564847448](https://github.com/FlareZ123/obfs/actions/runs/45564847448)  
**Disposition:** confirmed pre-existing current-main source-observation gap; not a PR #372-introduced regression.

## Question

Does mainline property renaming preserve the native source of a sloppy CommonJS module wrapper when the renamed property is read only inside a uniquely bound, direct-call-only const arrow function?

## Test construction

The test-only branch was created from main at `47f46784059f673d73f901f2ffa5b44752ecc4d4`; it adds only `test/agent10-private-arrow-cjs-main-baseline.test.js`. No production source file was changed.

For each of COO, SNO and SCO compiler mode labels, the fixture:

1. Creates `const owner={privateField:7}`.
2. Creates `const read=()=>{return owner.privateField}` and directly invokes it.
3. Arms a preloaded sloppy `Array.isArray` wrapper.
4. The wrapper captures `arguments.callee.caller` and reads its source with `Function.prototype.toString`.
5. Compares native and emitted executions.

The assertions require equal runtime value 7, one property rewrite, native wrapper source containing `privateField`, and emitted wrapper source differing from native and no longer containing `privateField`.

## Result

The focused manual-validation run [45564847448](https://github.com/FlareZ123/obfs/actions/runs/45564847448) checked out exact test commit `dd42b9f...` and ran Node 22.23.4 on both operating systems:

| Platform | COO | SNO | SCO | Project/external/paired-budget JSDoc |
|---|---|---|---|---|
| Ubuntu | pass | pass | pass | pass |
| Windows | pass | pass | pass | pass |

Both jobs passed all three cases. The full Node 22 job was skipped as expected because this was a focused dispatch. The output values remain 7; mainline reports `metrics.properties === 1`; the host-observed emitted wrapper source differs from the native wrapper source in all three mode labels.

## Classification relative to PR #372

The same source-observation witness was run against PR #372 head `499060b780fc1b355df7d9610711f77280217276` in [45555588567](https://github.com/FlareZ123/obfs/actions/runs/45555588567). That run also failed the candidate's source-equality expectation in all three modes on both operating systems.

However, this is **not a newly introduced PR regression**. A source comparison shows that current main already has:

- `privateFunctionNodes`;
- `callableBindings` and `callableDeclarators`;
- the direct-call-only use proof that can admit uniquely bound const arrow/function values.

PR #372 extends that proof area with `nestedInClassSource`, `privateClassNodes` and `hasUnprovedSourceContainer`; the private-arrow admission path itself predates the PR. The mainline baseline run now confirms that the same source mismatch exists before the PR candidate.

The accurate disposition is therefore: **pre-existing source-observation gap, still unresolved by PR #372**. It must not be counted as a fourth candidate-introduced regression. PR #372's separately source-pinned class and FramePosition counterexamples remain candidate-specific and independently block acceptance.

## Scope and limits

This is a focused Node CommonJS witness with a preloaded sloppy host callback. It demonstrates that a direct-call-only function-value non-escape proof does not prove that the active implicit CommonJS wrapper is unobservable. The callback receives neither the arrow function nor the owner object; it observes the wrapper while it is active.

The result is a bounded runtime/source-parity observation, not a claim that every CommonJS host can recover wrapper source, nor an academic theorem about all JavaScript engines. It does not establish a new attack against a trusted SCO server; the three mode labels identify compiler invocations, not equivalent threat boundaries. It does establish that the current compiler's source-observation policy leaves this specific path unmodeled under the tested Node host.

A repair should model the implicit CommonJS activation as an active `FrameRef` and propagate unknown-host callback effects to that frame, or conservatively refuse affected source-sensitive rewrites when the host contract is unproved. A function-value escape proof alone is insufficient. The relevant shared architecture proposal is `workplace/source-observer-carrier-effect-contract-2026-11-23.md`.

This report records a pre-existing gap and its exact mainline receipt; it does not change the release decision. Strong-protection release remains **RELEASE-BLOCKED**.


## Relationship to the existing Agent 6 ambient-caller gap

This private-arrow fixture is a concrete CommonJS-wrapper instance of the broader ordinary-private-function ambient-caller gap already acknowledged in the current PR #372 description. It should be tracked as a sharper, independently executable reproducer of that same general effect family, not counted as an unrelated fifth source-observation category. The test adds useful binding shape (const arrow, direct call) and source container (implicit sloppy CJS wrapper) specificity; the underlying missing abstraction remains the reverse active-frame effect from a host callback to the current caller chain.
