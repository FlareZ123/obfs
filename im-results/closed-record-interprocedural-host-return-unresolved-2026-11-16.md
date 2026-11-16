# Unresolved interprocedural host-loader escape in the ESM property proof

**Date:** 2026-11-16. **Author:** Agent 21. **Status:** reproducible negative counterexample; explicitly *not fixed* on main. The failing tests are kept on an unmerged research branch so validated mainline semantics remain green.

## Reproducer

An actual Node 22 --require preloader provides globalThis.RUNTIME_FACTORY=Function outside the compiler's declared files. The compiler receives a three- or four-file static ESM graph containing state.mjs exporting state={secretField:41}, a record.mjs export inspectRecord(key) reading from a private own-key schema, and entry.mjs. The entry calls inspectRecord('auditCount'), a known own field, and obtains the opaque Function through a function return:

~~~js
// Local version in entry.mjs:
function getFactory(){return globalThis.RUNTIME_FACTORY;}
const ctor=getFactory();

// Separate-module version:
// factory.mjs:
export function getFactory(){return globalThis.RUNTIME_FACTORY;}
// entry.mjs:
import {getFactory} from './factory.mjs';
const ctor=getFactory();

// Both then execute:
const remote=await ctor("return import('./state.mjs')")();
const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];
console.log(JSON.stringify([state.secretField,result]));
~~~

The original program prints [41,[3,["secretField"],41]] in both variants. The current main compiler wrongly accepts a cross-file private owner rename because its narrow own-record proof does not track the capability through the function return. The transformed local variant prints [41,[3,["_pd1ddfb2908e5"],null]], and the separate-module variant prints [41,[3,["_pb31aa1f072c1"],null]].

## Exact evidence

The complete failing regression fixtures are in [unmerged research branch agent21/cross-module-host-return-witness-20261116](https://github.com/FlareZ123/obfs/tree/agent21/cross-module-host-return-witness-20261116), at source SHA 90c18ebcd56bce8b2f64518252e09ff88f5dc63e. [Targeted GitHub Actions 43848071490](https://github.com/FlareZ123/obfs/actions/runs/43848071490) on Windows reproduced both output mismatches while all earlier host-capability cases passed. The Ubuntu lane was still processing when these observations were written; the run result can be checked at that immutable URL.

**Important:** this is a documented limitation of the currently merged conservative guard, not a test that has passed. A future fix must demonstrate actual native/emitted parity for both modes and preserve 2/2 protected private-field transformation on the distinct known-own-key positive application, 0/2 on frozen negative variants, and the hostile reflection/alias/containment witnesses. A broad refusal that eliminates all transformed protected work does not demonstrate obfuscation improvement.

## Research implication

Full closed-world source-property ownership cannot be inferred from superficial direct callsite keys when any opaque host callable can dynamically import an owner. A sound acceptance rule needs a host capability trust contract or an interprocedural points-to and escape proof that tracks return values, aliases, calls, modules and dynamic loaders. Full-control COO adversaries retain public files and debugger access independently of this compiler-safety issue.
