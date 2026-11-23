# Dynamic Error.stack computed source observation, 23 November 2026

**Classification:** intermediate compiler correctness / source-observation evidence. **Scope:** Node 22.23.4 COO ESM, conservative AST refusal, two-platform focused CI. The global strong-obfuscation release remains **RELEASE-BLOCKED**. This is a source-preservation correction, not an attacker-cost or integrity result.

## Mechanism and witnessed failure

A module can assemble an unknown property name with `['st','ack'].join('')` and read `error[key]`. At runtime this selects `Error.stack`, whose frame string reports generated source positions, including the constructor call column. A private owner-field rename earlier on the *same source line* shifts that column even if the program's ordinary numeric result stays exactly 47. The prior `observesFunctionSource` scanner recognized direct static `.stack` and literal `['stack']` but did not recognize this computed-name path on a known Error object.

- Initial unpatched scanner red: [run 45146661908](https://github.com/FlareZ123/obfs/actions/runs/45146661908) at test-only `6315f5b36a0fd2f4ba2b32d76b6b8f591c196125`, 2 passing safe controls, 1 detection failure.
- Source-edit red: [run 45146779068](https://github.com/FlareZ123/obfs/actions/runs/45146779068) at test-only `ff789a5b8f989dfd757c58a02c10723a694a45ab`. The compiler actually emitted `{"_p7b6a9f9a6b":47}` and `owner._p7b6a9f9a6b` in place of `longPrivateField`, before the observable `new Error('source-location')` call.
- Direct computed-Error fix green: [run 45146919372](https://github.com/FlareZ123/obfs/actions/runs/45146919372) at `eeee14b04e0842cbaecd550645162d61504a917e`, Ubuntu and Windows focused tests and required JSDoc checks pass.
- Added alias/sequence/destructuring/real Node ESM test run [45147204808](https://github.com/FlareZ123/obfs/actions/runs/45147204808) was red on one **test assumption** about unrelated dynamically computed destructuring: the existing scanner also refuses this opaque pattern on an inert record. The expected pre-existing conservative refusal was recorded instead of weakening the compiler; 7/8 expanded checks had passed.
- Immutable `const LocalError=Error; new LocalError(...)` constructor-alias red: [run 45147674051](https://github.com/FlareZ123/obfs/actions/runs/45147674051) at `cdfc364aaeff86ce75d6fa7b49a2839cf68dca46`, the new alias test failed while prior eight cases passed.

## Bounded correction

The proposed change is isolated to `src/ast.js`, using `containsStackError` rather than a universal computed-key prohibition:

1. Unknown computed `MemberExpression` key on a known Error instance triggers source-observer refusal.
2. Sequence expressions resolve the final operand for known Error values.
3. Computed ObjectPattern destructuring of a known Error instance triggers refusal when the key cannot be proven statically.
4. Direct Error constructor identifier aliases enter the existing monotone Error-alias discovery; constructed instances are then recognized.

The nine-case focused `test/dynamic-error-stack-source-observer.test.js` includes an actual native/emitted ESM comparison. An intentionally unsafe source rename yields identical numeric value but a different Error-frame column. The guarded compiler output preserves the original source and measured frame column. Other positive controls still rename an unrelated private owner field with known `Error.message` and with unknown computed reads from an inert plain record. A separate deliberately opaque plain-record destructuring case retains the scanner's existing conservative refusal.

**Final checked candidate:** branch [agent39/dynamic-error-stack-source-20261123](https://github.com/FlareZ123/obfs/tree/agent39/dynamic-error-stack-source-20261123), source `48a0ec6926b1473cb980cf2b1e6b0ef7cc360e8f`, [two-platform focused run 45147813041](https://github.com/FlareZ123/obfs/actions/runs/45147813041) **green**, all nine focused Node tests plus strict project and external JSDoc on Ubuntu and Windows. The full two-platform mainline suite is **not** shown green by this gate. This source is intentionally on a research branch pending canonical integration.

## Scope and future review

This identifies one real source-parity leak for compiler output under Node's native Error stack behavior. General arbitrary user-defined constructors, unknown function-returned Errors, hostile intrinsics, and host callback stack inspection remain outside this source-local proof; the scanner already has separate, broader source-observer refusals for several of those patterns. These assumptions require independent review before claiming general source preservation.

The stack-coordinate observability premise follows [V8's documented stack trace API](https://v8.dev/docs/stack-trace-api) and [MDN's Error.stack reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack). A green focused test is a correctness sample and cannot establish source confidentiality, tamper resistance, universal environment locking, or strict 2.5x cost compliance.

**Integration request:** send the exact red witness, bounded patch and safe positive controls to Agent 3's canonical source-observer intake, with Agent 10 reviewing full-suite disposition. No parallel release/acceptance PR is asserted.
