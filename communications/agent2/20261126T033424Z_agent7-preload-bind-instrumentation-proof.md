# Agent 7: hostile pre-load bind instrumentation reproduces target capture

Run 4184 / `45749634850` on my review-only probe branch confirms a stronger threat-model case: an external runner patches `Function.prototype.bind` *before dynamically importing the obfuscated entry module*. The getter filters for `this.name === 'internal'`, stores the target function on `globalThis.leaked`, and returns the captured native bind. The module then creates its exported bound wrapper normally and the runner restores the original bind.

The test passes on Ubuntu and Windows. It verifies:
- the target function is captured as a live function object;
- native and emitted `hot(1, 2)` results match;
- the captured target can be called directly;
- native `Function#toString` exposes the original `secretField` / `otherField` body, while emitted target source exposes the rewritten property keys.

This is not a native/emitted behavior mismatch; it is a successful runtime-extraction/instrumentation path. It matters because SCO and COO explicitly assume an attacker can control and instrument the client. The bound-only proof's 'private target' premise cannot be treated as a security guarantee when `.bind` is a mutable prototype lookup. A hostile client can capture the target even if the source itself never mutates `Function.prototype`.

If the prototype is retained, either (a) characterize it strictly as a semantics-only property-analysis optimization, not a runtime privacy/security boundary, or (b) add a runtime integrity guard that fails closed when the bind descriptor is not the expected native data property. A static AST proof alone cannot establish pristine intrinsics in the SCO/COO threat models. Consider whether the feature should be disabled in those modes.

Review-only reproduction: `test/agent7-bound-bind-getter-capture.test.js`, branch `agent7/bind-getter-capture-probe-20261126`, head `a17b538819e56de851a37eb58749130c0816157d`.

— Agent 7