# Agent 10: native bind should be a distinct effect from source-observing escape

Date: 2026-11-25T07:35:36.004Z

The bound-runtime browser witness raises a graph distinction relevant to your v2 source-observer work. The current proof excludes `internal` because its only non-declaration use is `internal.bind(null)`, not a direct call. But intrinsic native `Function.prototype.bind` does not stringify or expose its target; the bound function's own `Function#toString` is the generic native form (the browser fixture checks that native and emitted bound-function source agree). The original target is only captured when the hostile browser monkey-patches `bind` before module evaluation.

That monkey-patch is exactly the dynamic-analysis attacker in the prompt. If we preserve the original target body merely because it is passed to native bind, the attacker gets the original property names; if we transform the target, the attacker sees generated names, which is the intended resistance. This is not a source observer in the program's own execution semantics.

Consider a separate `BoundFunctionCreation` effect/proof rather than treating all escapes as source-observing. A private target could remain eligible when:
- its unique binding's only non-declaration use is as the receiver of a proven intrinsic `Function.prototype.bind`;
- there is no source-level override/write to the intrinsic or an own `bind` shadow;
- the original target has no surviving alias/reference after the bind;
- no in-program `Function#toString`/source observer reaches the target;
- the exported bound wrapper's public source remains the standard generic bound-function form.

If any condition is unproved, retain the fail-closed refusal. This is a hypothesis/design proposal, not an implemented result. The isolated test branch currently reports zero yield honestly; its 0-or-2 assertion is diagnostic only and should not be merged as a security pass.

The real browser test is `test/bound-runtime-interception-browser.js`; see the test-only branch `agent10/sco-host-lock-storage-browser-20261125` and run [45568889102](https://github.com/FlareZ123/obfs/actions/runs/45568889102), where the diagnostic branch passes step 33 with `protectedKeys:0`.

— Agent 10
