# Non-strict CommonJS caller-source observation across an uncompiled module boundary

**Status:** Source-pinned, two-operating-system **negative compatibility evidence** against Agent 3's draft PR #299; not a security theorem or production release claim.  
**Date:** 2026-11-23 UTC. **Investigator:** Agent 16.  
**Candidate parent:** `b826c10e3c59c2210c00448a0645bb8751a87758` (`agent3/source-parity-main-integration-20261122`).  
**Reproduction branch:** `agent16/cjs-caller-source-20261123`, file [`test/cjs-caller-source-boundary.test.js`](https://github.com/FlareZ123/obfs/blob/94cc7aaed30e56aae61043de692a41a90ba83b63/test/cjs-caller-source-boundary.test.js) on that branch, first six-case SHA `3738b1a745d046f48f21c77b90b0083a854fc3ab`; expanded eight-case SHA `94cc7aaed30e56aae61043de692a41a90ba83b63`.

## Observed behavior, not a conjectured attack

A function whose lexical source includes private owner fields remains observable even when it is never passed as a value and all of its named references are direct calls. Node 22's non-strict CommonJS `Function#caller` path lets a separate helper retrieve its *currently executing caller*; the same source text can be obtained when a foreign accessor descriptor is evaluated. The helper is **not** included in the compiler's input file set. Under that admitted SNO input boundary, the proposed `collectPrivateDirectCallables` proof treats the numerically private owner as safe for property renaming and changes the caller's function text.

Minimal shape (the exact runnable test uses `entry.cjs` and `observer.cjs`):

```js
// observer.cjs -- a normal external CommonJS dependency; excluded from input
function inspectCaller() {
  return Function.prototype.toString.call(inspectCaller.caller);
}
module.exports = inspectCaller;

// entry.cjs -- compiler input
const inspectCaller = require('./observer.cjs');
function compute() {
  const state = {secretField: 17, bonusField: 5};
  return [state.secretField + state.bonusField, inspectCaller()];
}
process.stdout.write(JSON.stringify(compute()));
```

Native and transformed executions return numeric `22`, but the original string contains `secretField` and `bonusField`, while transformed source contains `_p...` keys. Both processes exit successfully. This is a **full stdout parity failure**, not a thrown exception or a source-only heuristic.

Second shape substitutes a property read for the direct helper call:

```js
// observer.cjs
function inspectGetterCaller() {
  return Function.prototype.toString.call(inspectGetterCaller.caller);
}
Object.defineProperty(exports, 'text', {get: inspectGetterCaller});

// entry.cjs
const foreign = require('./observer.cjs');
function compute() {
  const state = {secretField: 17, bonusField: 5};
  return [state.secretField + state.bonusField, foreign.text];
}
process.stdout.write(JSON.stringify(compute()));
```

The separate descriptor getter can access the non-strict caller source despite the absence of an explicit `CallExpression` in the getter-consumption expression. Neither fixture modifies built-ins, patches the host, instruments the generated file, or requires introspection of the Node loader.

Third shape uses **implicit ToPrimitive execution**, with no foreign call or getter inside the observed function:

```js
// observer.cjs -- excluded from compiler input
let seen;
function coerce() {
  seen = Function.prototype.toString.call(coerce.caller);
  return 3;
}
module.exports = {
  value: {[Symbol.toPrimitive]: coerce},
  seen() { return seen; }
};

// entry.cjs -- compiler input
const foreign = require('./observer.cjs');
function compute(input) {
  const state = {secretField: 17, bonusField: 5};
  return state.secretField + state.bonusField + input;
}
process.stdout.write(JSON.stringify([compute(foreign.value), foreign.seen()]));
```

Native and generated `compute` return numeric `25`, but `foreign.seen()` contains different function source text because `+` performs an externally supplied object-to-primitive conversion. Merely banning unproved explicit calls and getter reads is therefore **still insufficient**: implicit coercions and other synchronously reentrant effects must be addressed.

## Reproduction matrix

```text
source SHA 3738b1a745d046f48f21c77b90b0083a854fc3ab (6-case)
source SHA 94cc7aaed30e56aae61043de692a41a90ba83b63 (8-case)
focused workflow manual-validation.yml with test/cjs-caller-source-boundary.test.js
run 45106822119 / Ubuntu & Windows Node 22.23.4: 4 pass, 2 fail / OS (6-case)
run 45107155036 / Ubuntu & Windows Node 22.23.4: 5 pass, 3 fail / OS (8-case)

  unbundled ordinary helper                 FAIL expected parity
  bundled ordinary helper                   PASS
  unbundled descriptor getter               FAIL expected parity
  bundled descriptor getter                 PASS
  unbundled implicit ToPrimitive callback    FAIL expected parity
  bundled implicit ToPrimitive callback      PASS
  strict caller with foreign helper         PASS; two renamed own fields
  private non-observing arithmetic caller   PASS; two renamed own fields
```

[Two-platform eight-case exact-source CI run](https://github.com/FlareZ123/obfs/actions/runs/45107155036) and [original six-case CI run](https://github.com/FlareZ123/obfs/actions/runs/45106822119). An earlier, separately source-pinned 3-case run at `914a359026e57cca072fab722c36e2e21ee9f520` showed the same ordinary-helper split on [Ubuntu and Windows](https://github.com/FlareZ123/obfs/actions/runs/45106643061).

Both red cases are intentional witnesses, so the focused job's overall status is failure. An entire test suite has **not** been run on this candidate; no universal runtime-cost bound is inferred. The full input files and deterministic CLI-free `obfuscateFiles` options are pinned in the branch test. The reference branch should remain unmerged while the negative cases are unresolved, rather than destabilizing `main`.

## Mechanism and proof boundary

PR #299's `src/properties.js::collectPrivateDirectCallables` accepts a callable when all same-spelled uses are direct calls and no local self-source observer appears. It does not prove that the executable body lacks untracked *transitive* source readers, including foreign calls and inherited/accessor property reads that may invoke a non-strict callee. `collectSourceExposedBodies` then omits that admitted callable from the protected source set, and owner member/property edits rewrite its observable `[[SourceText]]`.

The **bundled** helper controls passed on the same tested candidate because its source observer was visible to whole-graph checks; this is not a proof that every bundled cross-call flow is protected. The **strict** caller control passed and retained two renames, showing that the blind spot depends on a specific non-strict caller-introspection mechanism. A genuinely private function with neither helper nor getter also retained two successful renames.

## Suggested review action

Do not merge the draft PR's callable-source proof until it refuses unproved foreign call *and getter* source-observation boundaries, or until the full private-callable exposure proof can justify safe cases under a declared ambient environment. Consider a conservative known-pure expression grammar for non-strict callable bodies with uncompiled dependencies, leaving more aggressive analysis opt-in only under a closed, verified source graph. A lexical `CallExpression` ban alone does not cover accessors; an accessor ban would still miss implicit `Symbol.toPrimitive` execution. Retain positive-yield controls so the guard does not turn into unconditional refusal of all private key renames.

This is a bounded **correctness** counterexample for non-strict Node CommonJS and the exact draft PR; the six-case witness was also independently reproduced on a current-main-based branch at `370808ea25eed8807e0669c4a5deaac093e3a5bd` in [run 45107017246](https://github.com/FlareZ123/obfs/actions/runs/45107017246) (4 pass/2 fail per OS). It neither demonstrates an SCO server compromise nor proves any source secrecy under attacker runtime control, and it does not change the repository-wide **RELEASE-BLOCKED** decision.
