# Agent 10: red-first composition repair for member-flow analysis

**Date:** 2026-11-25  
**Classification:** Intermediate experimental donor result; not a production obfuscator result  
**Branch:** `agent10/member-flow-counterexamples-20261125`  
**Base:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`  
**Validated head:** `398a7301b68ad02d360c8bf164ab1e7622fca955`

## Summary

Agent 5 supplied five unexecuted counterexample hypotheses against the property-specific member-flow prototype. Four were reproduced as false negatives in the donor and repaired in a separate experimental branch:

1. a computed/dynamic member key after an awaited local factory return;
2. destructuring a callable field from an expression-bodied factory result;
3. a nested static member chain after a factory-returned object;
4. construction through a statically named namespace member (`new namespace.Local()`).

The fifth hypothesis concerned class getters. It was **not established as an independent false negative**: the donor's generic return sink already treats callable return expressions as held. The first primitive-getter negative control was also invalid because a class containing an accessor method is conservatively excluded from deferred-field optimization, retaining sibling field callables. The final precision control instead uses an object-literal getter and confirms that reading a primitive getter does not retain an unrelated callable property.

## Red-first evidence

The initial eight-case suite at `72df8c82cf1257884e5a359605f32437383ecffb` was red on both platforms: 3/8 passed and 5/8 failed in [run 45601259419](https://github.com/FlareZ123/obfs/actions/runs/45601259419).

The four reproducible false negatives were the dynamic-key/awaited-factory, expression-bodied-factory destructuring, nested factory-return chain, and namespace-qualified class-constructor cases. The fifth failure was the invalid primitive-getter precision control described above, not a fifth confirmed false negative.

## Repair

The experimental helper `workplace/agent9-ambient-call-bindingid.js` now:

- unwraps `AwaitExpression` and follows local `CallExpression` return expressions in the generic callable-value resolver;
- composes statically known member reads through nested `MemberExpression` receivers;
- resolves class constructor values through local aliases and statically named object members;
- obtains property-specific values from class fields, methods, getters and inherited class members;
- treats getter return expressions as property values, rather than confusing the getter function with the value it returns;
- retains a conservative callable fallback for unknown function-constructor forms instead of silently dropping their local constructor value.

The new `test/agent10-member-flow-followup.test.js` contains ten cases, including paired static/dynamic factory controls, the four reproduced counterexamples, conservative function-constructor fallbacks, getter return-sink controls, and an object-literal primitive-getter precision control.

## Validation

| Run | Scope | Ubuntu | Windows | Additional checks |
|---|---|---:|---:|---|
| [45603390699](https://github.com/FlareZ123/obfs/actions/runs/45603390699) | 10 new red-first/follow-up cases | 10/10 | 10/10 | project, external and paired-budget JSDoc passed |
| [45603572123](https://github.com/FlareZ123/obfs/actions/runs/45603572123) | combined local-owner, class-field, Agent 4 ambient-throw/callable and Agent 9 BindingId bundle | 116/116 | 116/116 | project, external and paired-budget JSDoc passed |

The focused workflow deliberately skips its full Node 22 job. These runs validate the stated donor suites and type checks only; they are not full repository acceptance, a browser differential, a cross-file/import proof, an obfuscated-runtime benchmark, or evidence of the 2.5x target-runtime budget.

## Integration boundary

The branch is a research donor, not production integration. At comparison time, main was `588d53d12b2419e092fdeff7bd592084841c9c1e`; the donor branch was **150 commits ahead and 3,090 behind**. The branch comparison contains no `src/` or `bin/` changes. Its helper remains under `workplace/`, with tests and donor evidence.

The current research decision index still marks the primary strong-protection objective **RELEASE-BLOCKED**. This intermediate result does not change that decision and should not be promoted to `results/`.

## Next work

1. Obtain independent review of the value-flow composition and its conservative unknown-constructor fallback.
2. Keep this donor separate from Agent 3's current-main sibling-root proof and PR #374. Those are different proof extensions; sequence them rather than merging stale donor code into the active integration branch.
3. If production integration is later justified, port the minimal reviewed logic onto a fresh current-main branch and rerun the complete mainline gate plus the combined regression bundle.
4. Extend the value-flow matrix for cross-module factories, imported aliases, destructured assignment, proxy/reflection behavior, and dynamic evaluation before claiming general soundness.


## Follow-up 2026-11-25 11:27 UTC — nested dynamic-key receiver composition

Two additional red-first tests exposed gaps beyond Agent 5's original five hypotheses:

- `external(holder.nested[key])`, where `holder` is assigned an expression-bodied factory result;
- `external(create().nested[key])`, where the nested receiver is reached directly from a factory call.

At head `8ff4c18a06e75edf2694a9723918c074e2ad98c5`, both new tests failed (10/12) on Ubuntu and Windows in [run 45604182753](https://github.com/FlareZ123/obfs/actions/runs/45604182753). The fix resolves a non-identifier dynamic-key receiver expression through the generic callable-value resolver before applying the conservative AST fallback. This lets the dynamic-key policy compose through nested static member reads and local factory results.

At final head `2ec6234e13fecbdc54b8a33b8a146725d669391d):
- [run 45604316589](https://github.com/FlareZ123/obfs/actions/runs/45604316589): **12/12** focused member-flow cases on both Ubuntu and Windows; all focused JSDoc stages passed.
- [run 45604498372](https://github.com/FlareZ123/obfs/actions/runs/45604498372): **116/116** combined donor regression cases on both platforms; all focused JSDoc stages passed.

The focused workflow's Node 22 full job remains skipped by design. These remain donor-only static-analysis results.

## Coordination note — Agent 3 sibling-root proof

Agent 3's full manual-validation run [45602505354](https://github.com/FlareZ123/obfs/actions/runs/45602505354) on PR #374 head `12cf58878c0a9eb235aa91a343d427627b540ddf` completed with 12 Node 22 behavioral failures on each platform. The normalized failure-name set matched the 12 failures in mainline baseline run `45581201445`; no additional failure names were observed. Browser integration, verified-record Chromium (64 cases), and ESM-observer Chromium (9 cases; native browser parity true) passed. This is not a fully green acceptance run. It supports keeping sibling-root and member-flow proof work sequenced separately while Agent 3 decides PR #374 disposition.


## Follow-up 2026-11-25 11:39 UTC — optional chaining, reflection and dynamic-code controls

The focused suite was extended from 16 to 20 cases with:
- static nested optional chaining and optional dynamic-key reads;
- `Reflect.get` with static and dynamic keys;
- `Object.getOwnPropertyDescriptor`;
- direct `eval` and a `Function`-constructor-generated reader;
- a Proxy-wrapped class instance.

At head `951aa40b24a8056053a561e1a3d330f129d12fb6`, [run 45606181481](https://github.com/FlareZ123/obfs/actions/runs/45606181481) passed **20/20** on Ubuntu and Windows, with all focused project, external, and paired-budget JSDoc stages passing. The combined donor regression bundle at the same head, [run 45606349401](https://github.com/FlareZ123/obfs/actions/runs/45606349401), passed **116/116** on both platforms with all focused JSDoc stages passing.

These reflection, dynamic-code, Proxy and optional-chain cases are fail-closed test controls. They show that the tested callable values are not incorrectly treated as safe; they do not establish complete semantic modeling of Proxy traps, reflection, eval, generated functions, or arbitrary dynamic code.

At the latest comparison, main was `ad45298c978494f2a3c6d3f0997f925074bbe6b2` and this donor was `156` commits ahead / `3,114` behind. The branch comparison still contains no `src/` or `bin/` changes. It remains an isolated intermediate donor.


## Follow-up 2026-11-25 11:41 UTC — shared-reference and mutation controls

The focused suite now contains 24 tests. Four additional cases cover:
- direct instance aliasing (`alias = owner`);
- object-record aliasing followed by a nested property write;
- a local mutator receiving an object parameter;
- a local factory returning a shared object after nested mutation.

At head `940e3de3d515ecdef3d7a9dc5ffd9001da93aa7a`, run [45606705065](https://github.com/FlareZ123/obfs/actions/runs/45606705065) completed successfully on Ubuntu and Windows. The test file contains 24 cases; both jobs passed, and project, external, and paired-budget JSDoc stages all passed. The focused workflow skipped its full Node 22 job.

The direct alias, object-record alias, and factory-return cases provide useful shared-reference coverage. The local mutator-parameter case is only evidence of fail-closed behavior; it may be satisfied by the donor's conservative unknown-member-write handling and does **not** independently prove precise caller-argument-to-callee-parameter alias propagation.

The combined donor regression run [45606349401](https://github.com/FlareZ123/obfs/actions/runs/45606349401) remains 116/116 on both platforms. The helper source has not changed since that run; later commits only expanded the follow-up test file.


## Follow-up 2026-11-25 11:48 UTC — private mutator-parameter precision boundary

A red-first precision case was added for a private object whose only mutation occurs through a known local function parameter:

```js
function install(target) { target.nested = new Local(); }
function entry() {
  const holder = {};
  install(holder);
  const callback = holder.nested.callback;
  return 0;
}
entry();
```

The assertion that the callable should remain safe failed on both platforms in run [45607198001](https://github.com/FlareZ123/obfs/actions/runs/45607198001). The Actions log endpoint returned 403/rate-limit responses, so the exact assertion trace was unavailable. The isolated delta was this one new precision assertion; the prior 24 executable cases had passed. The donor's local-record proof explicitly rejects aliases/parameter bindings and treats an unproved member write as a host-held callable escape, which explains the conservative result.

This is a **precision limitation, not a safety false negative**. The red test was retained as a `test.todo` with its reproduction snippet, rather than leaving a failing CI test or weakening the fail-closed rule. At head `ec40069f62b4aacbf2b981adf5b7bbd6f673576e`, [run 45607688032](https://github.com/FlareZ123/obfs/actions/runs/45607688032) passed all **24 executable tests** on Ubuntu and Windows, with one documented TODO and all focused project, external, and paired-budget JSDoc stages passing.

Open optimization question: prove a private object remains private when passed by reference to a known local mutator, including all call sites, parameter uses, return/closure paths, and unknown escapes. Until that proof exists, keep the callable held. Do not treat the current test as evidence that parameter alias propagation is implemented.


## Follow-up 2026-11-25 11:53 UTC — local call-parameter and return composition

Three additional tests verify narrow, statically mapped local-call flows:
- `external(identity(owner).callback)`;
- `const alias = identity(owner); external(alias.callback)`;
- `external(wrap(owner).current.callback)`, where the wrapper returns an object containing its parameter.

At head `b35705bce332d0053f4189a0c351eaaf470aca19`, [run 45608129598](https://github.com/FlareZ123/obfs/actions/runs/45608129598) passed all **27 executable member-flow tests** on Ubuntu and Windows, with one documented TODO; all three focused JSDoc stages passed on both. The combined donor bundle [run 45608286990](https://github.com/FlareZ123/obfs/actions/runs/45608286990) passed **116/116** on both platforms with all focused JSDoc stages passing.

These tests exercise existing narrow parameter mapping: direct calls to a uniquely resolved local function with identifier parameters, where `hasUnmodelledArgumentAccess` is false, add actual arguments to the parameter's `bindingValueExpressions`. The generic call-return resolver then follows returned parameter identifiers and wrapper object properties. This is evidence for that bounded case, not arbitrary call-graph or callback parameter flow.

The private-mutator TODO remains distinct. Although argument-to-parameter values are mapped, `localRecordKeysForBinding` deliberately rejects aliases/parameter bindings for its private-record proof; writes such as `target.nested = new Local()` therefore remain conservative host-held escapes. Do not conflate call-value mapping with proof that a mutated object remains private.
