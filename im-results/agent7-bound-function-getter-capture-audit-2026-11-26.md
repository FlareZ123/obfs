# Bound-only function proof: inherited-bind getter and hostile pre-load capture audit

**Agent 7, 26 November 2026. Status: intermediate adversarial evidence against a review-only prototype.** This is not a finding about the current production branch, and it is not an academic result.

## Scope and pinned artifacts

- Agent 2's review-only branch: `agent2/pr379-review-probe-candidate-20261125`, base/head inspected at `3693bf0a227003cd61f111dea1bb3823e1a222e6`.
- Agent 7's independent review-only probe branch: `agent7/bind-getter-capture-probe-20261126`, final probe head `a17b538819e56de851a37eb58749130c0816157d`.
- Probe: `test/agent7-bound-bind-getter-capture.test.js`.
- Runs used the repository's focused-test workflow on both Ubuntu and Windows.

No production source was changed on either branch.

## Main observation

The prototype extends the private-function proof to treat a top-level arrow function as private when its only explicit identifier use is a direct, noncomputed `.bind(primitiveLiteral...)` call. That AST shape does not establish that the `.bind` lookup is an intrinsic data-property read.

A getter installed on `Function.prototype.bind` executes with the target function as its implicit `this`. It can capture that target even while returning the genuine native bind:

```js
const nativeBind = Function.prototype.bind;
Object.defineProperty(Function.prototype, 'bind', {
  configurable: true,
  get() {
    globalThis.leaked = this;
    return nativeBind;
  },
});
const internal = (a, b) => ((a + owner.secretField) ^ owner.otherField) + b;
export const hot = internal.bind(null);
```

Agent 7's Node runtime probe confirmed the getter receives `internal` and stores a live function reference. It restores the native descriptor after the call.

### Hostile pre-load instrumentation

The stronger test installs the getter in a separate runner **before dynamically importing the emitted module**. The source module itself does not mutate `Function.prototype`. The getter captures the target function, returns the genuine native bind, and the runner restores the original descriptor after import.

Focused run **4184 / 45749634850** passed on both OSes. It verifies:
- the emitted target is captured as a live function;
- the exported bound wrapper and captured target produce the same primitive result as native execution;
- the native target's `Function#toString` source contains the original `secretField` / `otherField` references;
- the emitted target's source is directly available through the captured handle and contains the rewritten property keys instead.

This is a demonstrated runtime-instrumentation / target-privacy weakness under the SCO and COO threat models, not a demonstrated native-versus-emitted behavioral mismatch. It shows that the bound target is not private against a hostile pre-load environment.

## Non-vacuous mutation matrix

The first version of Agent 2's negative tests did not contain owner-member reads in the custom-bind cases. A zero property metric in those fixtures was therefore vacuous: no owner-member candidate was available to rewrite.

Agent 7 added concrete `owner.secretField` and `owner.otherField` reads. Focused runs **4179 / 45748333359**, **4181 / 45749089829**, and **4183 / 45749386356** show five mutation forms still admitted two property rewrites on both OSes:

| Mutation form | Result with owner reads |
|---|---:|
| Getter on `Function.prototype.bind` captures `this`, returns native bind | 2 rewrites |
| Same getter installed in a separate imported setup module | 2 rewrites |
| Direct `Function.prototype.bind = customBind` | 2 rewrites |
| Aliased `const fp = Function.prototype; fp.bind = customBind` | 2 rewrites |
| `Object.defineProperty(Function.prototype, 'bind', { value: customBind })` | 2 rewrites |

These are not five independent production vulnerabilities; they are five reproducible cases where the **review-only proof's private-target assumption is not established**. In the primitive-returning fixtures, no behavioral mismatch was demonstrated.

## Positive controls and boundaries

The same probe suite also establishes useful fail-closed behavior:

- Direct bound arrows returning the owner, including array/object aggregates, are refused.
- The tested `Promise.resolve(owner)`, `Object.create(owner)`, `new Proxy(owner,{})`, `new Map(...owner...)`, and object-spread return shapes are refused.
- A getter that performs `target.toString()` through its `this` alias is refused.
- A separate reachable module performing `Function.prototype.toString.call(globalThis.leaked)` also blocks entry-module property rewrites.

The source-observer controls show that explicit in-program source reads are detected in these tested forms. The unresolved gap is the implicit target capture itself when no in-program source read occurs; an external attacker can inspect the captured function through DevTools or equivalent runtime instrumentation.

## Test-harness note

Agent 2's first runtime-parity attempt (run 4168) failed because it deep-compared stderr paths containing two different `mkdtemp` directory names. The semantic outputs and error signature matched. Restoring the native bind before writing output / normalizing the temporary path resolved this harness issue; run 4169 passed. This is separate from the target-capture finding.

## Interpretation and recommendation

Do not describe the bound target as private or use this proof as a security boundary in SCO/COO. A hostile client can replace or accessor-wrap `Function.prototype.bind` before module evaluation, capture the target through implicit `this`, and then inspect or instrument it. A static AST check of the call expression cannot establish pristine intrinsics in an attacker-controlled runtime.

If the optimization is retained, separate its claims:
1. **Semantics-only property-flow optimization:** may be acceptable if all object-return and source-observer escape paths are conservatively proven and regression-tested.
2. **Runtime privacy / extraction resistance:** not established. It requires a separate trusted-intrinsic strategy or runtime integrity admission check, and even such a check must be evaluated against pre-load instrumentation.

At minimum, replace the vacuous mutation negatives with non-vacuous owner-read fixtures. Consider disabling the optimization in modes where an attacker controls the runtime unless a trusted bind-intrinsic precondition is available.

Agent 7 sent the reproduction and recommendations to Agent 2 in `communications/agent2/`. At the time of this report, Agent 2's review branch had not yet incorporated or answered the getter-capture findings. Preserve this as intermediate evidence pending independent reproduction and design decision.


## Follow-up: scope refinement after further escape tests

Run **4185 / 45750174654** adds a positive owner-escape control: a bound arrow that assigns `globalThis.leaked = owner` and returns a primitive is refused (zero property rewrites). Together with the earlier direct/aggregate return tests, the tested owner-object escape forms are all refused. The five bind-mutation cases that admit two rewrites are not, by themselves, proof of a semantics bug.

The hostile pre-load getter result should be interpreted narrowly. It demonstrates that a target function can be captured and inspected as transformed source by an attacker who controls the runtime. This is consistent with the stated SCO/COO hostile-client threat model and is not a new ability to recover the original source; the obfuscated module already contains the transformed function. The result does mean the bound target must not be described as runtime-private. Whether this is acceptable depends on whether the bound-only proof is intended solely as a semantics-preserving property-analysis optimization or is also being relied on for runtime privacy.

The source-observer positive controls remain important: explicit `target.toString()` through a `this` alias and a reachable cross-file `Function.prototype.toString.call(globalThis.leaked)` both cause rewrites to be refused. No native-versus-emitted behavioral mismatch has been demonstrated for the primitive-returning getter cases. Future work should prioritize non-vacuous semantic parity tests and preserve the distinction between target capture, source observation, and owner-object escape.
