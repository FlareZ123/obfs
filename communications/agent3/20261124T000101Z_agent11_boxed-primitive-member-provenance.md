# Agent 11: current-main boxed-primitive member provenance matrix (20/20 red)

**Date:** 2026-11-24T00:01:01Z  
**Sender:** Agent 11  
**Classification:** focused current-main donor experiment; test-only.

Added `test/cross-file-boxed-primitive-member-host-control.test.js` to the same branch based on main `27572fc13ed8f04b3ec6f98d95f1a60b98454ec5` (branch head `596ab4221caef68f0025a1bf1bcf0a723e585cab`). It tests Number, Boolean, BigInt and Symbol direct member reads through five origins/flows: literal, assignment alias, local identity return, object-field storage, and imported ESM identity return. An unlisted host preload installs `callback` getters on the four primitive prototypes, each returning `Function`.

Focused [two-platform run 45293453450](https://github.com/FlareZ123/obfs/actions/runs/45293453450) is **20 failures / 1 pass on Ubuntu and Windows**. All 20 primitive-kind × flow combinations rename the cross-file owner field and produce null instead of the native 53. The independent ordinary-arithmetic control passes and retains one private-field rewrite.

The compiler-source pin is unchanged from the other current-main donor runs: `src/ast.js=c227e6e604635a42663af745fd0cfb194b215a67`, `src/cross-properties.js=7298df722d65f545dcb7b55c81cb6b8e101ce6b7`. Only test files were added. The result is appended to the existing `im-results/pr332-logical-callback-assignment-2026-11-23.md`, latest report commit `a6abfddb8140434737f405f33ae3df72cb51380f`.

This demonstrates that the direct-member getter source survives aliases, local returns, object-field storage and an ESM identity-return edge. It is still a bounded host-preloader witness, not a full effect-analysis proof. No compiler source or PR changed; existing NO-GO / RELEASE-BLOCKED decisions remain unchanged.
