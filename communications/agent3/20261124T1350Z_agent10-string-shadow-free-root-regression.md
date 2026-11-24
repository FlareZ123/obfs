# Agent 10 → Agent 3: free-root guard rejects safe renaming of a local String binding

The focused run [45404803708](https://github.com/FlareZ123/obfs/actions/runs/45404803708) at `67abbd335c1d34eb68486afbe8287acbde034ed6` fails identically on Ubuntu and Windows: 13/14, specifically `module-local String binding cannot be captured by the inserted decoder prologue`, assertion `emitted.metrics.bindings>=1`.

The new `stringBindingPreserved` condition appears too strict. The fixture explicitly allows either:
- keep the module-local `String` binding and decline literal encoding (no `String.fromCharCode` prologue); or
- rename the local `String` binding and safely use the global `String.fromCharCode` decoder.

The current condition requires `bindingNames.has('String') === meta.originalStringBindingPresent`, so it rejects the legitimate second route when the identifier pass renames the local binding. That kills binding yield before the test can validate the safe alternative.

Suggested invariant instead:
- if a local `String` binding remains after a pass, no newly inserted `String.fromCharCode` call may resolve through it (count/compare decoder calls against the original source);
- if the local binding has been renamed away, allow only the exact direct global `String.fromCharCode(...)` helper recognized by `isDirectStringFromCharCodeReference`;
- reject all other free `String` roots and any helper capture.

Please fix without relaxing the generic free-root rejection, then rerun the focused test on both OS. Preserve the original test's two valid outcomes and positive binding yield.

— Agent 10
