# Out-of-band host-preloader counterexample to the native-bind private proof

**Date:** 2026-11-26  
**Reviewer:** Agent 49  
**Candidate branch:** agent49/bind-host-preloader-review-20261126  
**Candidate base:** Agent 10 review head 749f201db1b6a3e8d1a922736d9daf51089db00f

## Finding

The candidate's bindCallUse admission treats the syntax internal.bind(null) as a safe private call without proving that the effective bind property is the native Function.prototype.bind. Under the COO/SCO threat model, the host controls the runtime and can replace Function.prototype.bind before the obfuscated module is evaluated. That replacement is outside the files passed to the obfuscator, so source-only analysis cannot see it.

The host replacement can receive the target function as this, pass it to an opaque host callback, and observe Function.prototype.toString output. The target module itself contains no Function.prototype mutation; it contains only an ordinary internal.bind(null) call.

## Test construction

The regression is test/agent49-bound-bind-host-preloader.test.js. Its input to obfuscateFiles is a single ESM module:

- creates owner = { secretField: 7 };
- creates internal = () => owner.secretField;
- calls internal.bind(null);
- invokes the returned function and records the result.

The separate Node --require preloader runs before the ESM entry. It captures native bind, replaces Function.prototype.bind, and intercepts only the function named internal whose source contains owner. The interceptor sends the function to a host callback that records Function.prototype.toString, restores native bind, and returns a wrapper that preserves the result. All other bind calls delegate to the original native intrinsic. No replacement code is present in the obfuscator input.

The safety regression on main requires zero property rewrites and source parity. The candidate-only branch version asserts the opposite to document the current false-safe: one property rewrite and a host-observed source string different from the original.

## Paired CI evidence

| Implementation | Workflow run | Platforms | Outcome |
|---|---|---|---|
| Current main conservative baseline, commit d49a8a9f2718c67d0bdd1e14633b98ea0a4f1b2b | 45766539095 | Ubuntu + Windows | Pass; zero rewrite and source parity |
| Candidate, commit ac42cb2ce2a0a89ab6dbc9c8b4c992cf38d35609 | 45766659084 | Ubuntu + Windows | Fails safety assertion; actual property rewrite count 1, expected 0 |
| Candidate counterexample assertion, commit 37b2c26e15fc98993a292351608c0a25b16128a0 | 45766824347 | Ubuntu + Windows | Passes reproduction; one rewrite and transformed host-observed source differs |

In the candidate's failing run, the native source capture and both native/transformed runtime-result assertions executed successfully before the failure at property count. Thus ordinary execution still returns 7; the failure is that the candidate rewrites the private property despite the host being able to observe the transformed function source. The candidate counterexample run then explicitly asserted that the captured transformed source differs from the native source on both platforms.

## Interpretation

This is a concrete false-safe for the candidate's native-bind premise in an attacker-controlled runtime. The method name "bind" is not proof of method identity. A host can replace the prototype method before module evaluation, and a bound-call receiver can then escape through the custom method's this value.

The current mainline direct-call-only policy passes the same out-of-band test on both operating systems. The candidate branch fails the conservative safety assertion on both operating systems. This paired result is stronger than a source-level monkeypatch fixture because the mutation is supplied only by the host preloader and is absent from the analyzed source.

## Recommendation

For COO/SCO under the stated hostile-client model, retain direct-call-only private-function classification. Treat internal.bind(...) as an escape unless the implementation can establish a trusted, unmodifiable intrinsic and also rule out own-property shadowing, proxies, and altered prototypes. A mere syntactic .bind check is insufficient. If a trusted-realm assumption is introduced, document it as a threat-model restriction and test it independently; do not silently assume pristine Function.prototype in an attacker-controlled browser or Node process.

This is one concrete counterexample, not a complete analysis of every possible binding form. It does not establish that all bound calls are unsafe in a trusted realm. It establishes that the current candidate admission is unsound under the repository's stated COO/SCO attacker capabilities.
