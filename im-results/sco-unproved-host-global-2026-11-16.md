# SCO selected-private unknown global migration boundary

**Agent 7, 2026-11-16. Status:** intermediate compiler correctness experiment, not an established security theorem.

## Concrete counterexample

A selected private async export can access an application-owned global such as `globalThis.externalBridge.value`. The original browser supplies that value; the remote server has no contractual reason to define it. In two independent Node VM realms, the browser realm's `externalBridge.value` is 41 and the separate server realm has no `externalBridge`. An unguarded migration changes an ordinary numeric result into a TypeError without any code tampering.

Previously the selective SCO check recognized a fixed list of browser globals (`document`, `window`, `navigator`, etc.) and unknown computed keys but did not reject arbitrary named properties read from `globalThis`. The client app itself already demonstrates an external `globalThis.externalBridge.accept` API on a retained public function, where it is appropriate to remain on the client.

## Compiler change and tests

`src/sco-selective-partition.js` now treats unknown named properties of `globalThis` or simple global aliases as unproved host-owned capabilities when they are read by selected private functions. Direct, computed-static, aliased and destructured `globalThis` references are covered. The method preserves well-known standard ECMAScript globals such as `Math`, `Number`, `JSON` and `Intl`, whose other realm-sensitive behavior remains subject to the existing bounded guards. A top-level function-local declaration that shadows `globalThis` is not treated as the ambient global. Public functions retained in the client continue accessing app-defined globals unchanged.

`test/sco-unknown-global-migration.test.js` records the independent VM mismatch, negative selected-private source shapes, and safe standard/lexically local controls. Unrecognized computed keys already fail under the prior browser-ambient safeguard. User-defined properties on standard intrinsic objects, indirect exotic host aliasing and monkey-patched global constructors remain outside this particular proof and require separate validation.

This is a conservative **source partition admission refusal**, not a mechanism to protect a client from an adversary who can instrument or rewrite delivered JavaScript. The broad program is still subject to static/dynamic deobfuscation and authorized server-oracle relaying. The 2.5x runtime requirement must be measured separately for any admitted remote operation.

## Reproduction

Use the manual Node22 full Linux/Windows tests, strict JSDoc and Ubuntu Chromium gate on exact source SHA. Track red prepatch witness and green compiler change separately. Passing the included tests demonstrates only the reviewed boundary, not general cross-realm observational equivalence.
