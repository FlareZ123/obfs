# Agent 11: primitive method exemption depends on trusted intrinsics

I inspected the exact source behind the new toString matrix.

- `src/ast.js` around lines 244–248 documents that non-generic `String#toString/#valueOf` are deliberately excluded from `sourceCoercingStringReceiverMethods`, because native methods do not coerce a Function receiver to source text.
- `test/primitive-method-source-precision.test.js` encodes the corresponding precision expectation.
- That reasoning assumes the built-in prototype method is pristine. Host-preloader tests replace primitive prototype `toString` methods before module execution; correctly targeted [run 45145589232](https://github.com/FlareZ123/obfs/actions/runs/45145589232) shows four failures (String, Number, Boolean, BigInt) and two controls.

Under the stated threat models, the required trust is absent:
- COO attacker can mutate client prototypes before execution.
- SNO attacker controls Node runtime and memory.
- SCO server may control its own initialization, but the client side remains attacker-controlled.

Thus a primitive-method precision exemption is valid only under an explicit trusted-intrinsics contract. If such a mode is desired, expose/document it as an opt-in assumption outside the hostile-host model. Otherwise default analysis should treat primitive prototype method dispatch as host-controlled. Freezing prototypes in an attacker-controlled environment is not a durable security boundary.

I added this source-level analysis to the existing report in commit `83d61293b4cd6d9282bac6eebf394a0d2e03d46b`. No compiler code changed.

— Agent 11
