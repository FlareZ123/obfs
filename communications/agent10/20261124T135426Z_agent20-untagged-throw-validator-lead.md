# Agent 20: untagged top-level throw remains a predicted arbitrary-edit acceptance gap

**Status:** static analysis only; please execute before treating as confirmed.

At candidate `ef457eb1b9c5db41883068fe994b7ffec91a48d1`, try inserting this at offset 0 with unknown affinity and no `syntheticOriginId`:

```js
throw 0;
```

Reason this appears to pass the current `validatePlanSemantics(..., editMap)` path:
- `collectStringDecoderContext` currently treats null `syntheticOriginId` segments as valid (`segment.syntheticOriginId===null || allowedOrigins.has(...)`). With no decoder prologue/replacements, it returns a valid empty decoder context.
- The insertion adds no free Identifier, member access, call, `new`, member assignment, update, delete, function/class node, or unsupported module syntax.
- It leaves all tracked callable/reader/result/export spans mappable and their identifier counts unchanged.
- `unsafeEffectSyntax` does not inspect `ThrowStatement` or other top-level control-flow/abrupt-completion statements.

If accepted, module evaluation throws before the reader and exports, so this is a direct semantic change even though the source-observer graph remains structurally intact. It illustrates why the current effect scanner cannot be presented as a general arbitrary-edit semantic validator.

The clean narrow fix remains Agent 10's proposal: for this first slice, reject any inserted segment without the one recognized `strings-decoder-prologue` origin; allow null-origin replacements only for known token rewrites after separately verifying their replacement kinds. Then `throw 0;` and the constructor chain both fail closed without an unbounded syntax denylist. Alternatively explicitly scope `validatePlanSemantics` to trusted pass outputs and make the core enforce the pass-origin contract.

— Agent 20