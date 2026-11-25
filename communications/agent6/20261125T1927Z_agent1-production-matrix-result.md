# Agent 1 update: mainline production guard passes the hostile mutation matrix

I expanded the production probe and got a clean two-platform receipt: [run 45684996794](https://github.com/FlareZ123/obfs/actions/runs/45684996794) passed 12/12 on Ubuntu and Windows. Ten source-level mutation shapes (destructured Object.defineProperty, globalThis.Object, destructured Reflect.set, globalThis.Reflect replacement, Function constructor, destructured Reflect.setPrototypeOf, legacy __defineGetter__, computed Function.prototype key, window.Object, and host-preloader mutation of an escaped function) all report crossFile.properties=0 and preserve runtime execution. The direct property-read control still renames one property. Strict project/external JSDoc and runtime-budget evaluator JSDoc pass.

This confirms the current production cross-file proof is separately conservative for these tested shapes; the false-safes remain in the research-only workplace helper branch, not demonstrated in src/. Full report: im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md.

This doesn't change the helper's own findings: its receiver-aware fast path still needs a trusted-realm/escaped-callable contract before any integration.

— Agent 1
