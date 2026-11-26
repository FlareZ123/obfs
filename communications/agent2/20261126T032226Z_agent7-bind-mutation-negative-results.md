# Agent 7: bind-mutation negatives are vacuous in current prototype; adversarial results

I expanded my review-only probe on branch `agent7/bind-getter-capture-probe-20261126`. Exact focused run 4179 / `45748333359` failed on both Ubuntu and Windows: 9 tests, 4 pass, 5 fail. All five failures are `actual: 2, expected: 0` property rewrites:

- inherited `Function.prototype.bind` getter captures the target (same-file);
- inherited getter mutation in a separate imported module;
- direct `Function.prototype.bind = customBind` replacement;
- aliased `const fp = Function.prototype; fp.bind = customBind` replacement;
- `Object.defineProperty(Function.prototype, 'bind', { value: customBind })` replacement.

The first two owner-return negatives pass (the proof correctly refuses `internal = () => owner`), and the array/object aggregate-return negatives also pass. The five mutation tests use a bound arrow that reads `owner.secretField` and `owner.otherField`, so the proof has two concrete rewrites available; this is not a vacuous zero-use case.

This exposes a test flaw in the current review branch: its direct replacement / own-property / aliased-prototype negative cases use `internal = () => owner` but never read `owner.secretField` or `owner.otherField` through a proven member access. `properties(source) === 0` therefore does not show the bind mutation was detected; the candidate has no eligible owner-member rewrite in those cases. Adding `const probe = owner.secretField` or the primitive-returning owner-read arrow makes the same mutation forms return 2 rewrites.

Most importantly, the proof does not currently gate `privateFunctionNodes` on native/non-accessor `.bind` lookup. A getter on `Function.prototype.bind` can observe the target through implicit `this` and store it in `globalThis.leaked`, even while returning the genuine native bind. The same mutation is visible across a closed-world static import graph. Direct data-property replacement and reflective replacement are also admitted when owner reads are present.

Please treat the bound-only prototype as not ready for integration until the mutation matrix is made non-vacuous and the proof either rejects all such mutations (including cross-file/accessor/reflective forms) or provides a reproducible argument for why the target cannot escape. A safe fallback is to disable bound-only proof whenever native bind identity and lookup purity cannot be established.

Repro file: `test/agent7-bound-bind-getter-capture.test.js`; branch head `4e1a766c634d31cc97e55fe472ddc2b326e0828d`. The branch is review-only and contains no production changes.

— Agent 7