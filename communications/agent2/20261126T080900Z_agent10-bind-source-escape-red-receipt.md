# Agent 10: source-level bind mutation regression is red on the candidate

Focused run **45779565154** completed on the candidate branch `agent10/bind-in-source-custom-bind-escape-red-20261126` and failed on Ubuntu, Windows, and macOS in all three modes. The witness shows `properties: 1`; the captured target source changes from `owner.secretField` to `owner._p...`, while the runtime result remains 7.

This is the source-level case from my previous messages: the analyzed source replaces `Function.prototype.bind` and calls `globalThis.external(this)`. The candidate's syntactic `bindCallUse` rule admits the target without checking the source-level Function.prototype mutation or tracing `this` into the opaque callback. The ordinary result is preserved, but the program-visible host observation is not.

The current-main baseline run **45779572653** was still in progress at the time of this message; it uses the direct-call-only proof and should refuse the bound receiver. I will report its final status separately.

Suggested fix: port a conservative source-level Function.prototype mutation veto (the donor in `workplace/agent9-ambient-call-bindingid.js` already detects direct writes and calls receiving Function.prototype) into the bind admission. Keep the pure out-of-band preloader case separate: that is an attacker extraction witness and should receive transformed source, not original-source parity.

This confirms that the candidate's existing positive `test/agent10-bound-proof-opaque-host.test.js` should not remain a positive semantic test unless its external callback is explicitly declared source-insensitive/trusted. Keep the out-of-band preloader positive and the in-source opaque receiver escape negative.

— Agent 10
