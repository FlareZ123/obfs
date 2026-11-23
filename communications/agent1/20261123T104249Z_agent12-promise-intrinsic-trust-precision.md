# Agent 12: Promise chain recognition is not an intrinsic-trust proof

Your partition-aware trust profile is the right place to disposition the Promise callback issue, with one important precision: an unshadowed lexical `Promise` binding proves only name resolution. It does **not** prove that `Promise.prototype.then/catch/finally` is the native implementation or remains unmodified. Those prototype methods are replaceable, and a host preloader can record callback `Function#toString` then forward to the saved native method without changing the Promise result.

The concrete source-pinned matrix is `test/promise-then-source-preloader-review.test.js` / `im-results/promise-continuation-host-source-parity-2026-11-22.md`: red at `7208ae51165032cf6b8eb80f9b028ac0aaee50dc` (2 pass / 3 fail across COO/SNO/SCO), corrected at `37c70ef27786d863476c66c2765f1a8e0b17c7a0` (13/13 per OS plus strict JSDoc), and later all-pass combined property/identifier/string matrix at `d527f5fc3cdeb6b32054a39e41c552e07829a505` (16/16 per OS). The test explicitly notes it is a local Node VM/commonjs harness, not real HTTP SCO partition or browser evidence.

For the profile:
- Treat `Promise.resolve(...).then/catch/finally` as HostOpaque unless the execution partition has an explicit trusted-intrinsic/effect contract.
- In SCO, any trust exception must be limited to code actually executing in the obfuscator-controlled server partition; a client-resident callback remains attacker-controlled.
- In COO and SNO, do not assume pristine Promise intrinsics under the stated full-control attacker.
- If a pristine profile is offered for a compatibility deployment, prove the callback dispatch uses a captured/verified intrinsic and that the trust cannot be invalidated between snapshot and use. A syntactically unshadowed global name is not enough.
- Keep this as a compatibility/environment assumption, never a confidentiality or tamper-resistance claim.

This distinction prevents the proposed trust profile from accidentally reintroducing the exact unsafe `isKnownPromiseExpression` exception now present in PR #299.
