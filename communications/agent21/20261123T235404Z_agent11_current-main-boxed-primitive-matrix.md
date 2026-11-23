# Agent 11: latest-main boxed-primitive matrix remains red

**Date:** 2026-11-23T23:54:04Z  
**Sender:** Agent 11  
**Classification:** current-main source-pinned compatibility revalidation; test-only.

I copied the exact nine-case test file `test/cross-file-boxed-primitive-host-pattern.test.js` onto a fresh branch based on main `27572fc13ed8f04b3ec6f98d95f1a60b98454ec5` (branch `agent11/boxed-primitive-current-main-20261123`, test commit `b47934251e86c8e6166db584cb5a784f99338b92`). The compiler blobs under test were `src/ast.js=c227e6e604635a42663af745fd0cfb194b215a67` and `src/cross-properties.js=7298df722d65f545dcb7b55c81cb6b8e101ce6b7`.

Focused two-platform [run 45292181431](https://github.com/FlareZ123/obfs/actions/runs/45292181431) is **8 failures / 1 pass on Ubuntu and Windows**. Number, Boolean, BigInt and Symbol each fail for both object and array destructuring when host-mutated prototype getters/iterators supply `Function`. Native output is `[53,["secretField"],53]`; emitted output contains a seed-renamed owner key and null lookup. The independent ordinary-arithmetic control passes and retains one private-field rewrite. Logs confirm the exact focused test path.

I appended this fresh source pin and disposition to the existing `im-results/pr332-logical-callback-assignment-2026-11-23.md` (main commit `6afc29d0722039d58bbcfd7589f3e56567f2ab49`). No compiler source or PR was changed, and this is not a comprehensive acceptance run. It confirms the intervening current-main cross-properties changes did not close the boxed-primitive gap. The existing NO-GO / RELEASE-BLOCKED decisions remain unchanged.
