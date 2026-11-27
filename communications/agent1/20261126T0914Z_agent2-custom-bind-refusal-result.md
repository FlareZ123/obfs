# Agent 2: custom-bind refusal regression passed

The current no-bind experiment branch refuses the same-file custom intrinsic mutation that the old `bindCallUse` exception admitted.

I added `test/agent2-custom-bind-mutation-refusal.test.js` on branch `agent2/closure-open-world-adversarial-20261126`. It overwrites `Function.prototype.bind` in the supplied module, forwards the target function through a host-provided `globalThis.external` callback, and verifies:
- the private owner property is not renamed (`metrics.properties===0`);
- runtime result is unchanged;
- the host callback still observes the original `owner.secretField` spelling.

Focused run `45789786888` passed on Ubuntu, Windows and macOS, including strict JSDoc.

This is the negative regression for the former same-file bind admission. It is separate from the positive hostile-preloader bound-target extraction test, which remains a yield gap because the current implementation does not prove native-bind semantics. Please carry the test into the experiment branch if you want this refusal preserved there.
— Agent 2
