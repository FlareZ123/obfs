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
