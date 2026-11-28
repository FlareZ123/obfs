# SCO TextEncoder source-conversion relocation boundary (28 November 2026)

**Status: intermediate, branch-only compiler compatibility candidate.** This
does not establish confidentiality, hostile-client integrity, or a universal
2.5× execution budget. It is a next-version compatibility investigation; do
not change the frozen PR #384 acceptance source or represent this donor as a
release receipt.

## Concrete cross-host mismatch

On local Node **22.16.0** and real Chromium **144.0.7559.96** launched via
Playwright, the exact expression

~~~js
const dst = new Uint8Array(8);
new TextEncoder().encodeInto(null, dst);
~~~

throws a Node TypeError stating the source must be a string, whereas Chromium
returns {read:4,written:4} and writes UTF-8 [110,117,108,108] followed by
unchanged zeros. For numeric 42, Node throws the corresponding number-type
TypeError and Chromium returns {read:2,written:2} with bytes [52,50].
The string input 'hello' succeeds on both hosts. Browser
encodeInto(undefined, dst) coerces the literal undefined to its spelling;
Node rejects that source. These are **native measurements**, not yet an
emitted SCO differential. A selected private SCO body that evaluates the
literal itself is independent of RPC argument conversion.

The previous [Agent40 native TextEncoder survey](agent40-textencoder-native-2026-11-27.md)
contains 315 nonshared conversion/view pairs (254 unequal) and a large
fixed-view Unicode string positive oracle. That count does not imply all
valid-string encoding differs.

## Compiler admission hypothesis and bounded candidate

Mainline src/sco-selective-partition.js screens atob/btoa, networking,
workers, timers and selected other host APIs; its TextDecoder validator is
specific to TextDecoder, and TextEncoder is not a browser-only global. A
focused compiler test checks whether an unproved direct constructor is
actually admitted. Results must not be claimed until executed.

* Candidate branch: agent40/sco-textencoder-host-20261128, from main
  368ae4bc8bb0cf41ca1a22dfdb826f9a11d46652.
* Red-first compiler test-only source b64b38e54868170962c26a41297d64d9126b4bb5;
  focused [run 46112143867](https://github.com/FlareZ123/obfs/actions/runs/46112143867)
  was queued at this report's creation.
* Compiler patch and revised test at 3b1d970ea87106bf65a57b16bee5be2bc0bfc3b7
  add TextEncoder to the unproved host-API refusal, preserving separate
  preexisting globalThis-root diagnostics; focused
  [run 46112185942](https://github.com/FlareZ123/obfs/actions/runs/46112185942)
  was queued.
* Real Chromium native comparison and refusal test at
  668bba55cf20880b84fcedeaeb8773b5cf12fcba,
  test/sco-textencoder-native-browser.test.js;
  [run 46112296331](https://github.com/FlareZ123/obfs/actions/runs/46112296331)
  was queued.

The guard **conservatively rejects all unshadowed private TextEncoder
constructor usages**, including some safely typed fixed-string operations,
rather than claiming a complete flow-sensitive type proof. Direct local
function shadow, inert property-key spelling, public-side usage, and unrelated
private arithmetic remain eligible. It is a compile-time-only refusal:
otherwise admitted emitted programs have no added runtime CPU cost.

## Remaining obligations and threat boundary

Require exact-head two-platform compiler tests, strict JSDoc, real Chromium
comparison and integration-owner review before merging. Source name
shadowing/reflective constructor recovery remains outside this bounded test.
Under the primary SCO attacker model, legitimate online relaying and
inspection of public code are unaffected. The strong-protection release
decision remains **RELEASE-BLOCKED**.

## 05:43 UTC source-pinned test classification

The initial test-only [run 46112143867](https://github.com/FlareZ123/obfs/actions/runs/46112143867) finished RED on Ubuntu/Windows, but its test file failed to parse because of an accidental missing closing brace. **This is a fixture failure, not a proven compiler false-safe.** A parse-correct unpatched test-only branch at 323a295f3fc02146efbd1b5e7703e13b32b4b986 has [run 46112445795](https://github.com/FlareZ123/obfs/actions/runs/46112445795) queued and must be evaluated independently.

The corrected guarded candidate e352ebbc951b8c616884748dfc8d56cdab37547c completed [focused run 46112449374](https://github.com/FlareZ123/obfs/actions/runs/46112449374) **SUCCESS on Ubuntu and Windows** (both focused jobs successful; full node22 matrix intentionally skipped). This green is bounded to the new admission regression and the focused workflow's JSDoc gates. Real Chromium native [run 46112481550](https://github.com/FlareZ123/obfs/actions/runs/46112481550) remained queued at this checkpoint; do not report browser validation as completed.

A new **test-only candidate-derivative** eb c78e6c0c8b01cdec076c3771ae76e754362850 (remove the displayed space when using the SHA: ebc78e6c0c8b01cdec076c3771ae76e754362850) adds test/sco-textencoder-global-root-falsifier.test.js, with 12 semantically equivalent ways of recovering TextEncoder from the browser global object: direct, assignment, sequence, array, owned record, immediate arrow, optional self-member, computed self-member, destructuring, identity function call, conditional, and nested direct aliases. On locally instrumented Node 22.16.0 and Chromium 144.0.7559.96, all 12 native original programs returned 4 in Chromium and threw a source-type TypeError on Node. This is a **native matrix**, not evidence yet that the full compiler admits any of them. Candidate [run 46113176131](https://github.com/FlareZ123/obfs/actions/runs/46113176131) was queued.

An extracted exact-source usesUnprovedCrossRealmHostApi scanner was independently run under a synthetic ESTree walking harness: bare unqualified TextEncoder marked observed=true, but a MemberExpression with static property TextEncoder reached via a variable assigned from globalThis marked observed=false. This finding is deliberately **scanner-local**: downstream selected-partition checks could still reject the program. The 12-case full-compiler test resolves that uncertainty. A second local native witness showed an object source with toString side effects was converted once by Chromium and **not** called by Node, which rejected the input beforehand. This proves a host-observable effect difference, not merely error text divergence.
