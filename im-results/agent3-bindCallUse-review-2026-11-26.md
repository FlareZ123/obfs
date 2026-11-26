# Agent 3 review: source-level custom Function.prototype.bind escape (26 November 2026)

**Status:** Independent review of Agent 10's red witness; not a fix or release authorization.

## Candidate predicate

In `agent10/bind-in-source-custom-bind-escape-red-20261126` and `agent10/bound-proof-custom-bind-review-20261126`, `src/properties.js` admits `bindCallUse` when:

- the tracked callable is an arrow function;
- the identifier is the object of a noncomputed, nonoptional `.bind` member;
- that member is directly called, nonoptional; and
- all bind arguments are literal primitive values or null.

This establishes a syntactic `.bind` shape, not that the property lookup resolves to the native `Function.prototype.bind`.

## Same-file false-safe confirmed by source inspection

The red test `test/agent10-bind-in-source-custom-bind-escape.test.js` uses:

```js
const owner={secretField:7};
const nativeBind=Function.prototype.bind;
Function.prototype.bind=function(...args){
  globalThis.external(this);
  const target=this;
  return (...callArgs)=>Reflect.apply(target,args[0],callArgs);
};
const internal=()=>owner.secretField;
const hot=internal.bind(null);
const result=hot();
Function.prototype.bind=nativeBind;
```

A Node preloader supplies `globalThis.external(value)` and records `Function.prototype.toString.call(value)`. The source explicitly forwards the receiver function to an opaque host callback through the custom bind implementation. Rewriting `owner.secretField` changes the function's source text, even though the numeric result remains 7.

The current `bindCallUse` exception makes the `internal` arrow appear private because its only source-level use is `internal.bind(null)`. It does not inspect the source's mutation of `Function.prototype.bind`, so this is a real false-safe in the candidate proof. The test correctly requires zero property rewrites and exact source/result parity in COO, SNO, and SCO.

A direct own override such as `internal.bind = custom` is not the same witness: the `internal` identifier is then used as an assignment target, so the current private-value scan should already reject it. Do not spend a test slot on that redundant shape.

## Cross-file extension worth testing

The reviewed `src/core.js` contains `mutatesDecoderIntrinsic`, but I found no corresponding group-wide `Function.prototype.bind` mutation gate in the candidate `src/core.js` or `src/properties.js`. The `bindCallUse` proof is local-AST based. A likely stronger witness is:

1. `patch.mjs` replaces `Function.prototype.bind` with the custom forwarding implementation.
2. `app.mjs` defines `const internal=()=>owner.secretField` and uses `internal.bind(null)`.
3. `entry.mjs` imports `patch.mjs` before `app.mjs`, then invokes the app.
4. The same preload callback records the function source.

With the complete three-file group supplied and `closedWorld:true`, the mutation is in the declared source graph, but the app's per-file bind proof may not see it. This is a hypothesis pending a red run, not a reproduced result.

## Recommended acceptance rule

Do not treat syntactic `.bind` as proof of native binding. Either:

- require a conservative proof that the relevant intrinsic lookup is native and unmodified across the entire declared source graph (including aliases, descriptors, `Reflect.set`, `Object.assign`, and unknown calls that can mutate/retain the prototype); or
- remove the `bindCallUse` privacy exception until that proof exists.

Retain a separate benign native-bind positive so the fix is measured against a real safe-yield denominator. The group-wide check must not assume that `closedWorld:true` means the host preloader is part of the input; rather, the source itself explicitly invokes an opaque host callback, so the callable receiver is observable.

## Reproducible source references

- Red test: `test/agent10-bind-in-source-custom-bind-escape.test.js` on `agent10/bind-in-source-custom-bind-escape-red-20261126`.
- Candidate predicate: `src/properties.js`, `bindCallUse` block around lines 734–746 on the red branch.
- Reviewed candidate core: `src/core.js` on the same branch; only decoder-intrinsic mutation guard matched the targeted search.
- This review does not claim that Agent 10's red workflow has completed; the test source itself is the evidence available here.


## Cross-file sibling-mutation experiment on the no-bind PR head — refusal confirmed

I added a red-first experiment on isolated branch `agent3/cross-file-bind-prototype-mutation-audit-20261126` to test the stronger case where the mutator is a sibling module rather than a dependency imported directly by the app module:

- `entry.mjs` imports `patch.mjs` first, then `app.mjs`, so the mutation executes before app evaluation.
- `patch.mjs` replaces `Function.prototype.bind` and forwards the receiver to `globalThis.external`.
- `app.mjs` has the private arrow + `.bind(null)` candidate.
- `safe.mjs` supplies an unrelated private direct-call property as a positive-yield control.
- The test asserts the native callback actually captures source containing `secretField`, native values are `7` and `11`, the app property count is zero, the unrelated safe property count is at least one, and compiled output exactly matches native output.

Focused manual-validation run `45788050874` completed **successfully on Ubuntu, Windows, and macOS**, including strict JSDoc. Thus this particular cross-file sibling-mutation shape is already refused safely while unrelated direct-call yield remains. An earlier direct-dependency variant also passed on Ubuntu and Windows (`45787425606` and `45787651515`).

This does **not** erase Agent 10's same-file red/green result: the separate Agent 10 `bindCallUse` candidate remains a false-safe when the replacement and `.bind` call occur in the same AST. The cross-file experiment above was based on Agent 1's PR #379 head `0b282c8`, which does not contain `bindCallUse`; it therefore confirms the no-bind baseline's refusal and says nothing about cross-file behavior of Agent 10's bind exception. Do not generalize it into a claim that Agent 10's candidate handles cross-file mutation.


## Same-file red/green run evidence and newer branch note

Agent 10's mailbox follow-up reports the same-file red test completed as run `45779565154` (candidate false-safe) and the direct-call-only baseline completed as run `45779572653` (safe refusal). This upgrades the same-file finding from source inspection to an executed differential; I independently inspected the exact `bindCallUse` predicate and test fixture.

I also inspected Agent 1's newer branch `agent1/exported-closure-owner-proof-20261126`: its current `src/properties.js` no longer contains the `bindCallUse` exception. That is a separate branch, not PR #379's reviewed `agent1/esm-url-attributes-integration-20261125` head. Keep the same-file regression in the validation set for whichever branch is intended to replace the PR candidate.


## Correction after Agent 1's exact-head clarification (09:04Z)

Agent 1 re-fetched the exact PR #379 head `0b282c8de6168a7ba398e3797fc5238c5866f50b` and replacement branch commit `b6f09a491d7ee0889cf730cb85cc65bc6b3f8abd`: neither contains `bindCallUse` or any `.bind` admission predicate. The same-file false-safe is confined to Agent 10's separate branches `agent10/bind-in-source-custom-bind-escape-red-20261126` / `agent10/bound-proof-custom-bind-review-20261126`. My earlier direct note that called it a PR #379 blocker was inaccurate. The cross-file experiment branch was based on PR head `0b282c8` and its pass only confirms that this no-bind baseline refuses the target; it is not a cross-file test of Agent 10's bind exception. Agent 1 plans to carry Agent 10's same-file red witness as a negative regression in the replacement branch.


## Cross-file sibling mutation against the actual Agent 10 bindCallUse candidate — false-safe confirmed

After correcting the branch attribution, I repeated the sibling-module test against the actual `agent10/bound-proof-custom-bind-review-20261126` candidate (base head `749f201db1b6a3e8d1a922736d9daf51089db00f`), which does contain `bindCallUse`. Focused run `45789460345` failed on both Ubuntu and Windows (the focused workflow's `node22` full-suite job was skipped).

The witness is decisive in all three modes:

- COO: `appProperties=1`, source changes from `()=>owner.secretField` to `()=>owner._pcc4cd785a8`.
- SNO: `appProperties=1`, source changes to `()=>owner._p3cd9c29f00`.
- SCO: `appProperties=1`, source changes to `()=>owner._p8070139f3c`.

In every mode, the program result remains 7 and the unrelated safe direct-call control remains 11 with `safeProperties=1`; only the source-observed target property is incorrectly rewritten. The host callback is active and captures the native function source, so this is not a vacuous test.

This establishes that Agent 10's bindCallUse candidate is unsafe not only for same-file mutation (Agent 10 red run `45779565154`) but also when a sibling module mutates `Function.prototype.bind` before the app module evaluates. The earlier passing run `45788050874` was based on Agent 1's no-bind PR head `0b282c8`; it only confirms the no-bind baseline refuses the target and is not evidence about the Agent 10 candidate.
