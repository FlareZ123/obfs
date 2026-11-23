# Mutable Promise continuation leaks an opt-in private callback's exact source

**Agent 44, 23 November 2026. Status: red/green reproducible compiler-correctness counterexample on the isolated source-parity PR integration branch. Intermediate; not a strong-obfuscation release claim.**

## Affected semantic promise

The draft canonical callable-source integration in [PR #299](https://github.com/FlareZ123/obfs/pull/299), source head b826c10e3c59c2210c00448a0645bb8751a87758, adds the explicit option preservePublicCallableSource. This guards transformations of callables whose Function#toString spelling can be observed outside the source graph, while allowing proven private direct-call-only functions to remain transformable.

The new collectPrivateDirectCallables analysis contained an exception declaring inline callbacks to syntactically unshadowed Promise.resolve().then/catch/finally chains private. This exception relies on the methods' native implementation even though Promise.resolve and Promise.prototype.then/catch/finally are writable from the same JavaScript program. A plain local assignment can replace then, receive the callback object, and publish its source without any direct lexical callback reference or explicit toString call in the source.

## Minimal runtime counterexample

A fixture similar to the source-pinned complete regression is:

~~~js
let capturedCallback = null;
const originalThen = Promise.prototype.then;
Promise.prototype.then = function intercept(cb) {
  capturedCallback = cb;
  return { then: originalThen };
};
Promise.resolve().then(() => {
  const privateMarker =
    "EXPORTED_PROMISE_CALLBACK_SOURCE_MARKER_0123456789_ABCDEF";
  return privateMarker.length;
});
module.exports = capturedCallback;
~~~

The test evaluates native and compiler-emitted CommonJS sources in separate Node vm contexts, so the monkey patch affects only the disposable fixture realm. The external caller then obtains exported callback source with ordinary String(function). This is a property of the observed program itself; it requires no DevTools, source file access or attacker-owned runtime mutation.

The compiler is invoked with the relevant option **preservePublicCallableSource:true**, mode SNO and strings/identifiers/properties enabled. In the pre-fix implementation, the callback was classified private and rewritten even though its Function#toString spelling was a public observable output.

## Source-pinned red and green

- **Before**: isolated exact SHA e476bac5cff46835aeb6e81bb574152f01b7b78a, [two-OS red run 45092179035](https://github.com/FlareZ123/obfs/actions/runs/45092179035). The original callback string was **119 characters** and retained a long inline string literal and binding privateMarker; the emitted callback was **79 characters**, read from an injected literal array and renamed its binding to _vaaa754866f4c. The test compared exact Function#toString strings and failed. The emitted program transformed at least one literal and two bindings.
- **After**: isolated SHA 8c37ba2150c7486c43f297eb80e8e8ec3fad3bbe, [two-OS green run 45092183439](https://github.com/FlareZ123/obfs/actions/runs/45092183439). Both Windows and Ubuntu passed callback source parity, a separate nonzero-yield direct-call-only private-helper positive control, and strict project and external JSDoc. This verifies the conservative correction on the focused cases, not all compiler behaviors.
- **Full regression**: the same post-fix SHA is entered into [full Node, browser and benchmark workflow 45092301603](https://github.com/FlareZ123/obfs/actions/runs/45092301603). The full workflow **failed on both operating systems**. In the source-pinned Ubuntu node22 suite, the uncorrected canonical PR source itself had **52 failures out of 5,250 tests** in [earlier run 45080557432](https://github.com/FlareZ123/obfs/actions/runs/45080557432); the Promise-only corrected branch had **72 failures out of 5,253 tests**, including its three new tests, at [run 45092301603](https://github.com/FlareZ123/obfs/actions/runs/45092301603). The 20 additional failed positive-yield expectations all belong to **two suites**: test/fetch-constructor-function-source.test.js and test/web-idl-record-source-observation.test.js. Their primitive-only cases route exports through native-looking Promise.resolve().then(callback) chains and expected private property rewrites even when callback source could escape through a mutated then implementation. The conservative fix deliberately refuses those rewrites. The already-failing original 52 tests and performance/Chromium gates remain unresolved in the draft PR. The total-red full-suite verdict must not be presented as release readiness; the 20 added yield regressions require an explicit policy and test-contract decision by the integration owner.

The exact complete source is [test/promise-then-callback-source.test.js](https://github.com/FlareZ123/obfs/blob/agent44/callsite-source-20261123/test/promise-then-callback-source.test.js). The isolated PR-descendant branch is [agent44/callsite-source-20261123](https://github.com/FlareZ123/obfs/tree/agent44/callsite-source-20261123), with the patch to src/properties.js and two minimal JSDoc signature repairs in src/properties.js and src/symbol-properties.js. The latter reconcile existing core.js calls that pass optional preserveCallableSource but were declared as options with seed alone. The uncorrected baseline hit TS2353 twice at core.js lines 2946-2947 in [run 45091777022](https://github.com/FlareZ123/obfs/actions/runs/45091777022); the two-OS post-fix strict typechecks pass.

## Why the correction is conservative

The fix removes the special-case Promise continuation callback certificate from collectPrivateDirectCallables. These callbacks are treated as source-exposed unless a separate sound proof exists. The local IIFE/direct-call-only function proofs remain available; the added positive test verifies string encoding remains active for one genuinely private helper under the same opt-in. This is a deliberate conservative admission reduction, not a new property hiding mechanism.

Any future positive Promise callback certificate would need an explicit and checkable assumption that the underlying then/catch/finally and Promise.resolve implementations are unmodified and cannot be intercepted through aliases, accessors, or a cooperating module. Simple syntactic recognition of Promise.resolve does not prove native method provenance.

The fix has been communicated to the canonical integrator in [the PR #299 discussion](https://github.com/FlareZ123/obfs/pull/299#issuecomment-7088829995) and [Agent 3's mailbox](../communications/agent3/20261123T0103Z_agent44_promise-then-source-escape.md). It was **not directly committed into the canonical PR**.

## Negative control: V8 CallSite.getFunction

A separate isolated test [test/callsite-source-provenance.test.js](https://github.com/FlareZ123/obfs/blob/agent44/callsite-source-20261123/test/callsite-source-provenance.test.js) used V8 Error.prepareStackTrace + CallSite.getFunction to obtain a previously local function without any lexical non-call use. This reached a source-observable callable, but the existing compiler refused the entire file and emitted an exact no-op, with zero changed binding/string/property metrics. It passed [two-OS focused run 45091892317](https://github.com/FlareZ123/obfs/actions/runs/45091892317) after the JSDoc signature repairs. Therefore it does **not** establish a second vulnerability; it is useful evidence of the existing conservative guard.

## Relevance and boundaries

This is a precise semantic preservation defect under an **explicit experimental opt-in**. It does not show malicious behavior, domain locking bypass, full program reconstruction, or incremental resistance over an equal-trust ordinary minifier. It does not justify a production release even if corrected. No universal 2.5x performance claim follows from the focused tests. The entire obfuscator remains **RELEASE-BLOCKED** until independently measured multi-file compatibility, dynamic adversary resistance and runtime ceilings meet the project objective.
