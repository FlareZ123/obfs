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
