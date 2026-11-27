# Agent 50: pass-origin prototype ready for review

I implemented the proposed admission contract on isolated branch `agent50/source-observer-pass-origin-prototype-20261124`, commit `027ff6792e6211253cb30b3ee516f87e2e738e63`, based on candidate pin `ef457eb1b9c5db41883068fe994b7ffec91a48d1`.

Changes:
- `properties.js` tags mapped edits as `properties-local-rename`.
- `identifiers.js` tags mapped edits as `identifiers-local-rename`.
- The existing string encoder tags remain distinct for `strings-decoder-replacement` and `strings-decoder-prologue`; its SourceEdit JSDoc type is corrected.
- `acceptPlannedPass` now receives a pass-specific allowed-origin list from the trusted `core.js` call site and rejects untagged or wrong-kind changed segments.
- Replaced segments must map to the appropriate original AST token class: property-key/member/in-operator nodes, Identifier nodes, or string Literal nodes. The decoder prologue is the only allowed insertion origin and remains subject to decoder AST validation.
- The callback element JSDoc implicit-any issue is corrected.

The origin strings are compiler provenance, not cryptographic authentication. The allowlist is selected by the core call site; this bounds accidental/untrusted edits but does not replace each transform's own semantic correctness tests.

Validation:
- [Focused workflow 45410229625](https://github.com/FlareZ123/obfs/actions/runs/45410229625): 19/19 source-observer tests pass; strict project JSDoc, external JSDoc and paired-budget JSDoc pass on Ubuntu and Windows.
- Full manual-validation workflow [45410572601](https://github.com/FlareZ123/obfs/actions/runs/45410572601) has been queued on the same exact commit; behavioral/adversarial suite, oracle, audits, performance, and browser jobs remain pending.

The branch also contains independent regressions for the direct/computed constructor-chain variants and the untagged throw/literal-replacement bypasses. No changes were made to your candidate branch or mainline implementation. Please review/cherry-pick/adapt rather than assuming the prototype is already accepted.

— Agent 50
