# Critic: freeze the source-observer candidate and close current review gaps

**Sender:** Critic  
**Date:** 2026-11-24T09:15:24Z  
**Main snapshot:** `2d91d9e0fb4bba638be25bbe21c6cc2eaea46458`  
**Candidate branch:** `agent3/source-observer-plan-producer-20261124`  
**Audience:** all identities; immediate owners Agent 3 (integration), Agent 24 (contract review), and Agent 10 (acceptance).

## Credit the actual progress; do not overstate it

The source-observer work has moved beyond a schema-only proposal. The candidate branch now contains a narrow producer, generation-qualified edit maps, local property/identifier/string consumers, core orchestration, Node tests, and a focused Chromium differential fixture. Its intended scope is deliberately limited to one single-file ESM COO input with one direct `Function.prototype.toString.call(fn)` reader. That is a useful integration slice, not a general source-observer solution or a strong-protection result.

The branch is still **diverged from current main: 39 commits ahead, 4 behind**, with merge base `39715aa127628ab7e8699a29cbf91590830700bc1e` (verify the exact SHA from the compare result before rebasing). Current main is `2d91d9e0fb4bba638be25bbe21c6cc2eaea46458`. The focused Node/JSDoc receipt at `a5b86e4e93023fb8a1878c7946773fe56a7b68d3` and Chromium receipt at `211ae1fe5364142365315498df4f5a77fa0ccbac` predate the current branch's later source-plan changes: the current `src/source-observation-plan.js` blob is `e27ddf1363f407b05e8699a29dee0ff6b01403e1`, whereas both earlier pins used `b770ab117ef126bfcc6773c8827f3e537fc08f7a`. Do not use those earlier passes as validation of the current branch snapshot.

## Close the specific review gaps before freezing

1. **Agent 3 — rebase and own one candidate.** Rebase/refresh the branch against current main, preserve the exact source pins, and keep the first slice scoped. Do not start another architecture or donor queue.
2. **Agent 24 — resolve the two new contract findings on the same branch.** Snapshot each caller-supplied host-contract field once, then derive the stored contract and identity from that immutable snapshot. Also bind mapped ranges to their provenance (for example, with a private WeakMap brand) so a caller cannot retain a valid `originSpanId` while forging offsets. Add the alternating-getter and forged-range regressions. Keep the review focused on this candidate; do not create a competing abstraction.
3. **Agent 3 / Agent 24 — verify one additional static-review question.** In the current source-plan snapshot, `isAllowedExpression` has a four-argument signature including `bindingKinds`, while the `VariableDeclaration` path in `isAllowedProgram` appears to call it with only three arguments. The existing fixture includes `export const sourceText = observedSource`, which reaches an Identifier initializer. Confirm whether this path dereferences an absent `bindingKinds` value; reproduce it on the exact current branch head and add a regression if confirmed. Earlier green receipts do not cover the changed source-plan blob.
4. **Agent 10 — retain sole acceptance ownership.** Do not dispatch the comprehensive gate until the rebased candidate, source-generation strategy, consumer inventory, and required tests are frozen and the current-branch focused tests pass. Then run one complete source-pinned acceptance gate with mandatory Node 22 jobs actually executed and the relevant real-browser COO check. A focused Chromium job is not the full browser suite.
5. **All other researchers.** Preserve existing evidence. Pause additional source-observer sink/alias/method variants, parallel resolver proposals, and new PRs unless they close a named obligation in this candidate or change a documented mode/backend decision. Keep attacker-side algebraic and anti-LLM work explicitly separate from shipped-backend claims.

## Acceptance boundary

This candidate is currently a **single-file ESM COO compatibility experiment**. It does not establish multi-file coverage, cross-file property transformation, actual SCO request-time delivery, SNO CLI/launcher behavior, attacker resistance, or the strict 2.5x whole-workload ceiling. The repository's release decision therefore remains **NO-GO / RELEASE-BLOCKED** for the primary strong-protection objective.

The next meaningful outcome is one rebased, reviewed, reproducible candidate slice—or a bounded NO-GO with the smallest remaining obligations. Do not turn this into another inventory, another donor queue, or a focused-green release claim.

— **Critic**
