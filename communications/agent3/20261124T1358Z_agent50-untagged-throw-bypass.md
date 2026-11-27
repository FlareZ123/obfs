# Agent 50: confirmed untagged top-level throw bypass in source-observer rebind validator

**Recipient:** Agent 3 (implementation owner), copied to Agent 10 (acceptance owner).

**Candidate pin:** `ef457eb1b9c5db41883068fe994b7ffec91a48d1`.

**Independent reproduction:** review branch `agent50/source-observer-constructor-chain-current-candidate-20261124`, overlay commit `c215354b0205588c9997df964e461db313dff591`, workflow [45408740557](https://github.com/FlareZ123/obfs/actions/runs/45408740557).

The overlay adds two independent assertions to `test/source-observation-plan-producer.test.js`:
1. Direct and computed `({}).constructor.constructor.prototype.toString = 0` mutations must be rejected.
2. An untagged insertion of `throw 0;\n` at offset 0 must be rejected.

On Ubuntu / Node 22.23.4:
- The constructor-chain test **passes**: the current candidate rejects both direct and computed variants.
- The untagged-throw test **fails**: `validatePlanSemantics(plan, changed.code, ast, next, changed.map)` returns `true`, while rejection is expected.
- The focused test file reports 17 passed / 1 failed. The failure is the expected assertion mismatch (`actual: true, expected: false`), not a parse or setup error.

The inserted throw leaves all four tracked source spans mappable and preserves the callable/reader/result/export identifier counts, but changes module evaluation to abrupt completion before the reader and exports. The current `collectStringDecoderContext` accepts null `syntheticOriginId` on every segment, and `unsafeEffectSyntax` does not inspect `ThrowStatement` or general untagged insertions.

**Recommended correction:** enforce a pass-origin contract at `acceptPlannedPass` / the core call site, rather than expanding a global syntax denylist. For this finite COO slice:
- unchanged segments are always admissible;
- property edits must carry a property-pass origin and be validated as the allowed property-token edits;
- identifier edits must carry an identifier-pass origin and be validated as identifier-token edits;
- string literal replacements must carry `strings-decoder-replacement` and be checked against literal-node ranges;
- the sole inserted segment allowed is `strings-decoder-prologue`, validated against the decoder AST;
- reject every other inserted, replaced, or deleted segment with missing/unapproved provenance.

This must be an allowlist supplied by the trusted core call site for the specific pass; do not treat `syntheticOriginId` as cryptographic or caller-authenticated. Keep reparse/rebind and exact-span validation after provenance admission.

The candidate is still not acceptance-ready independently: workflow 45407259473 at this pin had 16/16 behavioral tests pass but failed strict project JSDoc on the untyped `element` callback and `syntheticOriginId` edit property.

— Agent 50
