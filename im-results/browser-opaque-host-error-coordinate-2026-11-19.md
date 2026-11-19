# Opaque browser host error-coordinate boundary

**Agent 8, 19 November 2026. Status: intermediate semantic-boundary evidence.**

## Finding

A browser page can observe source coordinates from an obfuscated script even when
the supplied JavaScript contains no error observer at all. Because the observer
can live in host HTML outside the compiler's input set, a source-local scan for
`onerror`, `ErrorEvent.lineno`, `Error.stack`, or related APIs cannot prove
that source-coordinate-changing rewrites are unobservable.

This extends the earlier browser-global error-coordinate result, which repaired
source-visible handlers and registrations. The boundary here is intentionally
opaque: the host installs `window.onerror` before dynamically loading the
candidate script, while the candidate source itself has no such registration.

The retained reproduction is
`sims/browser-opaque-error-coordinate.js`.

## Real-Chromium reproduction

Manual workflow run
[44471152779](https://github.com/FlareZ123/obfs/actions/runs/44471152779)
executed the witness under Google Chrome 157.0.8103.50 at source commit
`858a9cb2a0767404643f1e738f6d3704e0375135`. The run completed successfully,
including `npm run typecheck:external`.

Two independent transformations were exercised.

### Host-lock prefix

The first specimen is a classic browser script with no source observer. COO
host locking for `127.0.0.1` prepends the authorization wrapper.

The host supplies either a safe object or `null` and observes uncaught runtime
coordinates externally:

```text
native safe:     ok:73
generated safe:  ok:73
native failure:  1:52
generated failure: 3:52
coordinate parity: false
```

The safe execution remains behaviorally equal. The failing execution exposes
the two-line host-lock displacement through the host-owned `window.onerror`.

### Ordinary ESM property rewrite

The second specimen is an ESM module so local property renaming is admissible.
It contains one locally owned long property and then calls
`[0].forEach(...)`. The host page, outside the supplied source, selects the
runtime state by either leaving `Array.prototype.forEach` intact or replacing
it with `null` before loading the module.

The compiler admitted one property rewrite:

```text
property rewrites: 1
native safe:        ok
generated safe:     ok
native failure:     1:113
generated failure:  1:81
coordinate parity:  false
```

Thus the boundary is broader than the hostname wrapper. A normal admitted
obfuscation rewrite can change the coordinate of a later host-induced
exception, and an opaque host listener can observe that change.

## Interpretation

This is a semantic-contract result, not an obfuscation-strength result.

For browser code, exact runtime diagnostic coordinates are an ambient
observable. If 1:1 behavior includes those diagnostics, analyzing only the
distributed JavaScript cannot establish preservation when the surrounding
page, browser extension, embedding framework, test harness, or other host code
may register the observer.

The result does not establish that source-changing obfuscation is impossible.
It establishes a proof-envelope boundary for the current source-local
admission strategy. Viable contract or architecture choices include:

- explicitly excluding opaque host diagnostics from the semantic-equivalence
  contract;
- preserving source coordinates for protected rewrites;
- requiring the complete observing host environment as part of a closed-world
  input;
- moving transformations behind a loader or execution boundary whose
  diagnostic behavior is separately specified.

A source scan alone cannot distinguish an unobserved deployment from the
validated external-listener deployment because the supplied JavaScript is
identical in both cases.

## Relationship to prior evidence

`im-results/browser-global-error-coordinate-2026-11-18.md` established and
repaired source-visible global browser error observers. Its scope section
explicitly left opaque host consumers unresolved.

`im-results/dynamic-input-host-exception-source-boundary-2026-11-19.md`
independently demonstrated the analogous general shape in Node: host-provided
runtime state can trigger a later exception whose diagnostic coordinate is
changed by an earlier admitted rewrite.

The present Chromium witness closes the browser-side gap with an observer that
is fully outside the compiler input.

## Reproduction notes

The harness dynamically appends the candidate script and finalizes observation
from the script load event, avoiding deferred-module ordering races. The safe
arm is checked before the failing arm for both specimens. The property specimen
uses a module because local property renaming is intentionally disabled for
classic `script` inputs.

Earlier branch attempts are intentionally not evidence:

- run 44470565646 used a classic script for the property specimen, so the
  compiler correctly admitted zero local property rewrites;
- run 44470773240 still used a classic script after removing free globals and
  was again correctly refused;
- run 44471039540 admitted the ESM property rewrite but sampled the host result
  before deferred module evaluation completed.

Only run 44471152779 is the final green reproduction for both specimens.

## Release impact

No release verdict changes. This finding does not improve resistance to static
reconstruction, dynamic instrumentation, tampering, or unauthorized execution.
It narrows what can honestly be claimed about exact browser semantic
preservation when host diagnostics are outside the compiler's closed world.
