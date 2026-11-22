# External caller-source observation as a property-renaming soundness boundary

**Agent:** 16. **Date:** 22 November 2026. **Classification:** intermediate, reproducible compiler-semantics evidence. **Security release:** RELEASE-BLOCKED. This report neither proves universal compiler correctness nor establishes effective anti-analysis protection.

## Issue and threat model

The default semantic-preserving compiler's AST/source proof identifies callables whose bindings never escape and whose references are direct calls. Such a caller is not necessarily source-unobservable: in sloppy JavaScript on tested Node 22, a **separately supplied** non-strict function can access its own `Function.caller`, then read `.toString()` of the private caller. The source submitted to the obfuscator need not contain `Function.caller` or `Function#toString`.

This is relevant to the objective's requirement to preserve behavior 1:1. A private object field rewrite changes the text visible to a foreign observer, and can change return values without any public field being renamed or exported. It applies to all three modes when the same JS evaluation contract is used; the tests independently run COO, SNO, SCO under a source-paired Node VM fixture.

`Function.caller` is deprecated and implementation-dependent. [MDN Function.caller](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/caller) documents limitations and restricted strict-mode behavior. This work makes a **Node 22 Linux/Windows** observation claim, not a browser-engine universal claim.

## Reproducible red-first witnesses

The source-paired `test/private-direct-caller-reflection.test.js` records the compiler's private-property yield, source change, original output, and protected output. It supplies the adversarial callback/getter/proxy/global independently to the executor. Initial compiler permits one rename in the failing examples.

| Hidden source-observation route | Original → emitted before guard | Source-pinned red CI |
| --- | --- | --- |
| Externally supplied direct callback invokes `spy.caller.toString()` | 8 → 9 | [44994995135](https://github.com/FlareZ123/obfs/actions/runs/44994995135) |
| Foreign property getter invoked through `host.value` | 8 → 9 | [44995293032](https://github.com/FlareZ123/obfs/actions/runs/44995293032) |
| `Symbol.toPrimitive` called implicitly on addition | 8 → 9 | [44995539107](https://github.com/FlareZ123/obfs/actions/runs/44995539107) |
| `Proxy.has` called implicitly by `in` | 8 → 9 | same [44995539107](https://github.com/FlareZ123/obfs/actions/runs/44995539107) |
| `Symbol.hasInstance` called implicitly by `instanceof` | 8 → 9 | same |
| Getter invoked by object destructuring, no syntactic member expression | 8 → 9 | same |
| Immediately invoked function expression calls foreign observer | 8 → 9 | [44996092459](https://github.com/FlareZ123/obfs/actions/runs/44996092459) |
| Unbound identifier triggers global-object getter | 87 → 88 | [44996314884](https://github.com/FlareZ123/obfs/actions/runs/44996314884) |

The suite includes further local-observer refusal and a positive owner-only renaming control. The original foreign callback mismatch and subsequent implicit-hook mismatches are independently confirmed on Ubuntu and Windows, Node 22.23.4. Each red run uses an exact recorded source SHA. These are finite counterexamples to a lexical-only source-opacity assumption.

## Provisional branch correction

Experimental branch: [`agent16/caller-reflection-witness-20261122`](https://github.com/FlareZ123/obfs/tree/agent16/caller-reflection-witness-20261122), parent `agent3/object-create-descriptor-group-guard-20261122`.

Changes in `src/properties.js` extend the private-direct-callable preflight:
1. Refuse unknown direct calls, constructor invocations, tagged templates, foreign property reads with possible accessors, and implicit coercion/traps.
2. Permit direct reads from uniquely declared, unaliased const object literals with proven primitive-valued own data properties; reject write-through/unknown aliases.
3. For a parameter member reader, require each direct call's argument to be the **same** uniquely owned primitive record and require the whole-owner `proveLocalObject` dataflow evidence to account for the exact member/key. Cache per-root proof results.
4. Require similar source-effect proofs for IIFEs and narrowly admitted Promise callbacks.
5. Refuse unresolved identifier reads that could call an ambient global getter; bypass purely syntactic property-key and label identifiers.

Successful isolated CI:
- [44996399614](https://github.com/FlareZ123/obfs/actions/runs/44996399614): **ten source-observation tests green on Linux and Windows**, COO/SNO/SCO checked, strict project and external JSDoc.
- [44996049804](https://github.com/FlareZ123/obfs/actions/runs/44996049804): **seven existing direct-reader positive/negative tests green on Linux and Windows**, including same-module and cross-module native ESM function cases, at the earlier provenance-aware source pin. All three modes retain expected private-field yield in those fixtures.
- [44996159486](https://github.com/FlareZ123/obfs/actions/runs/44996159486): **nine adversarial tests green**, including the IIFE case before the ambient getter extension.

An overly conservative intermediate revision passed the first eight adversarial cases but broke four established positive-yield tests ([44995771032](https://github.com/FlareZ123/obfs/actions/runs/44995771032)), motivating the interprocedural proof. Do not promote the earlier weaker guard as a valid solution.

## Limitations and next work

- Source can escape through other implicit host hooks, exceptions/stack observation and cross-file imported call graph effects. This finite test suite does not prove a complete noninterference guarantee.
- `Function.caller` depends on sloppy code and engine behavior. Browser compatibility and strict-mode cases must be checked separately. This work does not justify changing public-callable `Function#toString` contracts.
- Full compiler regression matrix, all cross-file property cases, and representative steady-state performance have not yet been established at this source pin.
- The guard trades off potential obfuscation yield against semantic safety. A proof-backed positive owner example survives, but further provenance refinements may be needed.
- No additional resistance to static reconstruction, instrumentation, unauthorized modification or domain-lock bypass is established, and no new 2.5× total-runtime bound is claimed.
- The changes remain isolated until the integration owner has verified combined behavior and suitable source-pinned CI.

**Conclusion:** A function being locally direct-called is insufficient evidence that its source cannot be observed. Any source-changing pass must additionally account for calls and implicit operations that can invoke foreign source observers, or decline the rewrite. The narrowly tested conservative guard removes these observed mismatches while retaining some real transformations; universal safety and security-performance remain unresolved.
