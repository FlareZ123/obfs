# Agent 50 — untagged post-pass insertion bypass

**Classification:** intermediate, independently reproduced correctness/acceptance counterexample. Not an established release result.

## Exact reproduction

- Candidate base: `ef457eb1b9c5db41883068fe994b7ffec91a48d1`
- Review branch: `agent50/source-observer-constructor-chain-current-candidate-20261124`
- Review overlay commit: `c215354b0205588c9997df964e461db313dff591`
- Workflow: [45408740557](https://github.com/FlareZ123/obfs/actions/runs/45408740557)
- Runtime: Node 22.23.4, Ubuntu and Windows
- Result on each platform: 17 passed / 1 failed

The review fixture built a genuine plan with `buildDirectFunctionSourcePlan`, inserted the following at offset zero with unknown affinity and no `syntheticOriginId`, reparsed, advanced every tracked source range, then called `validatePlanSemantics(plan, changed.code, ast, next, changed.map)`:

```js
throw 0;
```

All four tracked spans remained mappable. The validator returned `true`; the test expected `false`. The failure is an assertion mismatch, not a parser/setup failure.

In the same two-platform run, the direct and computed constructor-chain prototype mutation tests passed: the current candidate correctly rejects those variants. This separates the repaired constructor-chain issue from the remaining arbitrary-insertion gap.

## Why this matters

The throw changes module evaluation to abrupt completion before the source reader and exports, while leaving the tracked callable, reader, result declaration, export mirror, and their identifier counts structurally intact. The current effect scanner does not inspect `ThrowStatement`; `collectStringDecoderContext` treats null synthetic origins as valid for all segment kinds.

This is evidence that the AST-effect scanner is not a general semantic-equivalence validator. It should not be described as one. The narrower core boundary must admit only edits from known internal passes.

## Recommended admission contract

For the first single-file ESM COO slice:

1. Allow unchanged segments.
2. Require a pass-specific provenance origin for every changed segment.
3. Tag local property edits, identifier edits, string literal replacements, and the decoder prologue separately.
4. Validate replacement ranges against the appropriate AST token/node class; a generic replacement with an allowed label must not be able to replace an entire unprotected statement.
5. Permit the sole insertion origin `strings-decoder-prologue` only for the decoder pass, and validate its generated AST region.
6. Reject untagged or unapproved inserted/replaced/deleted segments before reparse/rebind acceptance.
7. Supply the allowed origin set from the trusted core call site for the specific pass. Treat `syntheticOriginId` as compiler provenance, not cryptographic authentication.

This avoids an unbounded global-root or statement denylist while retaining exact source-span mapping and semantic rebind checks.

## Other gate status at this pin

Workflow [45407259473](https://github.com/FlareZ123/obfs/actions/runs/45407259473) on the candidate pin reported 16/16 focused behavioral tests passing on both platforms, then failed strict project JSDoc:
- `src/source-observation-plan.js(605,62)`: implicit `any` for `element`.
- `src/strings.js(143,86)`: `syntheticOriginId` absent from the edit-array JSDoc type.

The candidate remains unaccepted. No changes were made to the candidate branch; this report and the review-only test branch preserve the evidence.


## Additional admission counterexamples on the same candidate pin

A second review overlay extended the reproduction. On candidate \`ef457eb\`, workflow [45410835586](https://github.com/FlareZ123/obfs/actions/runs/45410835586) confirms two further failures:
- An untagged replacement of the unprotected string literal \`'safe-literal'\` with \`'attacker-value'\` is admitted by \`acceptPlannedPass\`.
- A structurally copied \`SourceEditMap\` with a single unchanged segment can hide an appended \`throw 0;\`; \`acceptPlannedPass\` admits the forged map because the current map consumer checks generations and protected slices but does not brand the map object or verify segment coverage.

These are separate from the untagged insertion failure. A robust admission boundary must reject untagged replacements as well as insertions, and it must not trust a structurally reconstructed map that omits changed regions.

## Follow-up prototype

Prototype commit \`dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e\` adds a process-local WeakSet brand to \`SourceEditMap\`: only objects minted by \`applyEditsWithMap\` can be consumed by \`mapSourceSpan\`. It adds a regression for a forged unchanged-only map hiding an appended throw. Focused cross-platform validation is pending at the time of this update.

This WeakSet is an in-process provenance check, not cryptographic authentication. It prevents structural copying/forgery; pass-specific origins still constrain edits produced by the trusted core passes.
