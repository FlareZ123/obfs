# Real createScoHandler request-time Storage source differential (2026-11-23)

**Status:** Confirmed Chromium correctness counterexample; intermediate result only. No production compiler change or release claim.

**Recorded:** 2026-11-23T22:00:26.780Z

## Question

Does the actual server-controlled createScoHandler HTTP path preserve the source of a function passed as a DOM DOMString value to native localStorage.setItem, including its request-time literal-spelling pass?

The canonical source-observer intake explicitly distinguished the earlier host-locked obfuscateFiles({mode:'sco'}) browser fixture from the untested server handler path. This witness closes that experimental gap for one single-file ESM case.

## Reproduction and source pins

- Test-only branch: [agent19/sco-request-time-storage-source-20261123](https://github.com/FlareZ123/obfs/tree/agent19/sco-request-time-storage-source-20261123)
- Branch base: 9fc5542fb7d6accd5f1bfef3e320114a215e8ebe
- Final test-only branch head: f54bc818f6dfdb1ec1445905c26fc9b697ed011f
- Browser harness: [test/sco-request-time-storage-source-browser.js](https://github.com/FlareZ123/obfs/blob/agent19/sco-request-time-storage-source-20261123/test/sco-request-time-storage-source-browser.js), blob ed26bcd056e336cc08cf33e151fb6dc185e98ab5
- Pinned src/sco.js: blob c8f98b553172426559b21abaf0dc9a4fc3ea068e
- Pinned src/ast.js: blob c227e6e604635a42663af745fd0cfb194b215a67
- Manual workflow: [.github/workflows/manual-browser.yml](https://github.com/FlareZ123/obfs/blob/agent19/sco-request-time-storage-source-20261123/.github/workflows/manual-browser.yml), blob 6ac8a8002a03f02b2e64f08a6cc6a37c37f9589b
- Strict DOM-source JSDoc config: blob 410a72327035c24bd38651274e2f346120611935
- Focused workflow run: [45276781187](https://github.com/FlareZ123/obfs/actions/runs/45276781187), commit f54bc818f6dfdb1ec1445905c26fc9b697ed011f
- Browser: Chromium 157.0.8103.78 (Ubuntu GitHub Actions runner)

The fixture starts a real HTTP server around createScoHandler, requests the same /obfs/entry.mjs route twice with an allowed Host and once with a disallowed Host. It then executes the exact response bodies in Chromium beside the original native ESM module. The observed function is passed as both Storage.setItem arguments (first as key, then as value), and also through a captured Storage.prototype.setItem alias invoked by Reflect.apply. A same-named userland setItem stores a different function by reference without stringifying it.

## Observations

The focused browser step passed. Its captured report established:

| Observation | Result |
|---|---:|
| observesFunctionSource(parse(source, 'module')) | false |
| Allowed HTTP Host | 200 |
| Disallowed HTTP Host | 403 |
| Two request artifacts distinct | true |
| Function-valued Storage.setItem key argument | Source exposed |
| Function-valued Storage.setItem value argument | Source exposed |
| Captured native Storage.setItem via Reflect.apply | Source exposed |
| Same-named userland setItem | Function reference retained; private rewrite preserved |
| Native function result | 29 |
| First and second SCO function results | 29 |
| Native and both SCO marker values | Original marker preserved |
| Native and both SCO unrelated helper results | 7 |
| Function-source equality | Both SCO variants differ from native |

Native function source included:

~~~js
function inspect(){
  const privateLocal=29;
  const marker="sco-request-time-source-marker-0123456789abcdef0123456789abcdef";
  return {value:privateLocal,marker};
}
~~~

The first served variant exposed:

~~~js
function inspect(){
  const _v04c78307048c=29;
  const _v84df7635d2ae="\u0073\u0063\u006f-r\u0065\u0071uest\u002dt\u0069m\u0065\u002ds\u006f\u0075r\u0063\u0065-\u006dark\u0065r\u002d0\u0031\u0032\u003345\u0036\u003789ab\u0063d\u0065f\u0030\u00312\u0033\u0034\u00356\u00378\u0039abc\u0064e\u0066";
  return {value:_v04c78307048c,"marker":_v84df7635d2ae};
}
~~~

The second request used a different private identifier and a different mixture of raw and escaped characters. In each request, the function source returned as the Storage key matched the function source returned as the Storage value. Both variants returned the original marker value at runtime, plus value: 29, independent: 7, keyValue: 'key-position-control', and userlandValue: 11. The emitted source also renamed userlandOnly's private binding, so the same-named userland setItem did not cause a name-only veto.

The harness also passed the strict jsconfig.dom-source-evidence.json JSDoc check in the same run.

## Why the handler mutates this source

The pinned handler has two relevant gates:

1. Its group-level interfileSourceObserver expression only invokes observesFunctionSource when the normalized source group has more than one file. This fixture has one file.
2. varyLiteralSpellings separately calls observesFunctionSource on the file before varying string literals. The measured predicate is false, so the marker variable initializer is rewritten to per-request Unicode escapes.
3. The handler then calls obfuscateFiles with identifier/property transforms enabled because interfileSourceObserver is false. The private local and unrelated helper local are renamed.

The native Storage method converts the function value to a DOMString, exposing the changed function source. The preserved runtime values do not make this source-visible transformation behaviorally equivalent.

## Scope and interpretation

This is a direct, real-browser counterexample for the actual createScoHandler request-time path. It is stronger than a compile-then-serve fixture because the HTTP handler itself generated the per-request artifacts.

The allowedHosts result is only the handler's HTTP Host routing filter (200 versus 403); the source comment explicitly says this is not an authorization boundary. Do not present it as authenticated domain locking.

This is one Chromium version, one single-file ESM source, and one direct Storage receiver. It covers both Storage.setItem DOMString arguments, one captured-native Reflect.apply dispatch, and a same-named userland positive control. It does not establish cross-browser behavior, multi-file SCO behavior, Storage named-property setter behavior, own method overrides, prototype patching, all call/apply/bind variants, SNO or COO behavior, authorization-callback semantics, or a general capability-graph solution. No production compiler source changed.

The overall manual browser workflow remains red at the pre-existing test/bound-runtime-interception-browser.js:52 assertion (0 !== 2). That failure is separate from this focused step. The focused SCO request-time browser step and strict JSDoc step both passed; the overall workflow must not be reported as green.

## Required follow-up

- Add this receipt to the canonical source-observer intake as the actual createScoHandler request-time differential, distinct from the prior obfuscateFiles host-lock witness.
- Keep the failure as a source-observation counterexample, not a new .setItem name denylist.
- Any eventual admission/fix must model receiver, effective callable identity, value-side ToPrimitive, source spans, and closure reachability together; retain unrelated private-yield controls.
- Keep production compiler changes deferred until the broader capability-graph and mode-specific acceptance gates are satisfied.
