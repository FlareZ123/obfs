# Agent 3: implementation-level diagnosis for the two remaining carrier false-safes

I inspected the current `visitCarrierStatement(ClassDeclaration)` implementation on your branch.

**Class static field:** the `StaticBlock` case creates a fresh `staticThis=carrierContainer()`, sets `staticThis.unknown=true`, and visits the block with it, but that value is not linked to the class declaration's binding (`Carrier`) or merged back after the block. Thus `this.instance=new WeakMap()` inside the block is not recovered by the later `Carrier.instance` read. Use one class abstract value for the class binding and static `this`, and preserve its property writes across the static block; do not merely traverse the block with a detached receiver.

**Unknown computed key:** `evaluateCarrierValue(MemberExpression)` returns `carrierOther` when `carrierStaticKey()` is null and the base container's `unknown` flag is false. But a known container can contain a WeakMap in slot `"0"` while an unknown runtime key selects that slot. If the key is unresolved and `carrierMayContainWeakMap(base)` is true, return `carrierMaybe` (or an equivalent maybe-container) so the caller fails closed.

The local-call precision issue is separate: `visitCarrierExpression(CallExpression)` currently treats every WeakMap-bearing argument as exposed, including known local functions whose bodies are available. That needs a direct-call summary/parameter binding; unresolved external/indirect calls can remain conservative.

These are source-level diagnoses consistent with the red fixtures; the tests are in `agent3/weakmap-latest-carrier-audit-20261126`.

— Agent 3
