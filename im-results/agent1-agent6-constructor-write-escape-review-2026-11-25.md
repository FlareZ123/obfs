# Agent 6 constructor-write escape-boundary review

**Status:** intermediate precision review of a research-only helper branch. Not a production regression or security result.

## Reproduction

- Candidate branch: `agent6/return-escape-boundary-20261125`
- Candidate source pin: `76cc99d4ab377dbc2a7c5f1e6d21b11dae4c009c`
- Independent review branch: `agent1/review-agent6-constructor-write-escape-20261125`
- Test file: `test/agent6-receiver-instance-override.test.js`
- Review test source: `f25e0faafd0923582b7e0fdb524e48857d375f74`
- Focused run: [45681450716](https://github.com/FlareZ123/obfs/actions/runs/45681450716)

The review added three runtime-backed cases to the candidate's 17-case constructor/receiver suite. The focused run was **RED on Ubuntu and Windows**, 20 tests per platform, 18 pass / 2 fail.

## Counterexamples

1. A class constructor writes `this.callback=hidden`, but the instance remains local and the callback is only invoked locally. Runtime does not expose the callable to a host, yet the summary reports `hidden.hostHeldCallable=true`.
2. A class constructor writes `this.callback=hidden` and then overwrites the same own property with `this.callback=1`; the instance escapes with the primitive final value. Runtime does not expose `hidden`, yet the summary reports it held.
3. Positive control: the instance escapes with its final constructor-written `callback=hidden` value. This case passes and is correctly marked held.

## Likely cause

The shared host-escape scan contains an unconditional branch for AssignmentExpression nodes whose left side has a this-member root. It marks callable right-hand values as HostHeldCallable without distinguishing a class constructor's newly allocated local instance from a host-supplied receiver, or determining whether that instance ever escapes. The new property-specific constructor resolver can identify the final own-property value, but the generic assignment sink still leaves a permanent reason for overwritten or local-only values.

## Recommendation and limits

Defer constructor this-member writes from the unconditional host-held sink and let the class-instance escape/value analysis mark only the final property value when the instance reaches a host boundary. Keep the conservative behavior for ordinary methods/functions whose this receiver may be host-provided.

This is a **precision/over-retention** finding, not an unsafe false negative. It affects the research helper and the safe property-renaming candidate set. No production src/ or bin/ files were changed. The separate intrinsic-trust limitation in the explicit-this call fast path remains applicable to this branch because it is based on Agent 5's donor.


## Inheritance-order follow-up

Expanded run [45681922145](https://github.com/FlareZ123/obfs/actions/runs/45681922145), source `30fe81983fa1b0de774995d20cf93b29086c65da`, is **RED on Ubuntu and Windows**, 23 tests per platform, 19 pass / 4 fail. The four failures are: local-only constructor callable write over-retention; callable write later overwritten by a primitive still over-retained; a base constructor primitive own write failing to shadow a derived prototype method in the analysis; and a derived primitive constructor write failing to clear a base constructor's earlier callable own write. The positive control where a base constructor callable own write shadows a derived prototype method passes.

This establishes a second precision issue beyond the unconditional this-member sink: class property resolution must respect instance initialization order across inheritance. A base constructor can install an own property that shadows a derived prototype method; derived fields and the derived constructor body execute later and may overwrite that base own property. The candidate currently checks the derived prototype method before inherited base-constructor own writes in the no-derived-field/no-derived-constructor case. A correct model should resolve the final own-property state in order: base fields, base constructor body, derived fields, derived constructor body, then prototype lookup only if no own property remains.


## Class-field arrow control

Added an escaped class-field arrow control at review-branch source `a7ab1caba027af15f1ab195fd2c4036d1b6c2713`: a field arrow `callback=()=>this.secret` captures the constructed instance, and invoking the escaped arrow returns the hidden function stored in the `secret` field. [Run 45682929388](https://github.com/FlareZ123/obfs/actions/runs/45682929388) passed this new case on both OSes. The same run retained the four constructor/initialization-order precision failures (24 tests, 20 pass / 4 fail). This narrows the finding: the tested class-field arrow receiver path is handled; the remaining issue is constructor this-write escape gating and inherited own-property ordering.


## Temporal escape caveat for any precision fix

Deferring constructor this-member writes until an instance is known to escape must be temporal, not a single post-construction check. A base constructor can pass `this` to a host before returning; the same object is then retained while derived fields and the derived constructor body run afterward. Any callable values assigned after that escape remain observable through the retained object. A safe refined model must record the first escape point and continue treating later writes to that same instance as host-visible. For derived construction, preserve the order of base fields, base constructor body (including any early escape), derived fields, and derived constructor body.


## Early-constructor-escape temporal control

Added a further positive control at review-branch source `8aada6dfa2dff5139a4ad52868021b362da0a103`: a base constructor passes `this` to an unknown host callback; the callback installs a setter on `callback`; the constructor then assigns `hidden`, the setter captures it, and a derived field later overwrites the final property with a primitive. The host has already captured the callable during construction. [Run 45683353378](https://github.com/FlareZ123/obfs/actions/runs/45683353378) passes this case on both OSes. The same run remains 25 tests, 21 pass / 4 fail, with the four precision failures unchanged. This validates the temporal caveat: once an instance escapes, subsequent writes can be observed or intercepted even if the final own-property value is primitive.
