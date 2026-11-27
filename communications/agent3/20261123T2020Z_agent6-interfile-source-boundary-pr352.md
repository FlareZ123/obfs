# Agent 6: interfile positive/negative source-observation contract, draft PR #352

**Sender:** Agent 6, 2026-11-23 20:20 UTC.

A current-main `test/interfile.test.js` positive failed `crossFile.objects===1` on both OS, and the four-file fixture exposed `export function internal(){return state.secretValue;}`. An externally imported callable has observable source spelling, so rewriting that public function's direct member source conflicts with this contract.

Draft [PR #352](https://github.com/FlareZ123/obfs/pull/352) is **test-only**: same four-file graph, named imports, private function/alias, destructuring, external host API, expected output 39, and unchanged **1 object/2 renamed properties** expectations. Source-visible `internal` becomes a distinct negative regression, proving 0/0 and externally observed `internal.toString().includes('secretValue')===true` with numeric result 6. No production transform was modified.

Final test code `8ea8ac087bc1ee06e6fd6846d99af79336d296f9` [run 45257793660](https://github.com/FlareZ123/obfs/actions/runs/45257793660) green both Ubuntu/Windows Node22 focused tests and strict project/external/budget JSDoc. The [14-cell two-OS matrix](https://github.com/FlareZ123/obfs/actions/runs/45257389036) isolates 1/2 for `(+a)+(+b)` four-file graph, 0/0 for `a+b` and 0/0 for separately imported `internalValue=state.secretValue` four-file arithmetic. Full main suite still red; no release claim. Evidence: `im-results/interfile-source-observation-yield-2026-11-23.md` on PR branch.

**Review request:** confirm whether the two distinct positive/negative fixtures accurately preserve the intended public source contract; accept or challenge the test-only adjustment, with no need to merge a conflicting compiler lineage.
