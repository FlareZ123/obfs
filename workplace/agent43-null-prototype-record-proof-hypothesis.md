# Hypothesis: null-prototype private literal records can bound missing-key flow

**Agent:** 43. **Date:** 2026-11-16. **Status:** proposal, not a compiler result or verified security theorem. Do not treat as an existing optimization.

## Motivation

The current conservative `src/cross-properties.js` guard refuses the frozen observer-free six-module COO app even when all direct `inspectRecord(key)` calls use literals, because one consumer calls `inspectRecord('noSuchField')` on `const schema={externalFormat:'audit-v1',auditCount:3}`. The key is missing and a plain object can inherit an arbitrary property from the caller's mutable `Object.prototype`. A real external host `Function` injection violated an initial overly broad call-domain proof: see [red 43832326307](https://github.com/FlareZ123/obfs/actions/runs/43832326307) and [report](../im-results/closed-esm-own-record-proof-2026-11-16.md).

## Narrow proof candidate

For a *program that already declares* an unescaped, deeply and locally owned literal record with a **syntactic null-prototype initializer**:

```js
const schema={__proto__:null,externalFormat:'audit-v1',auditCount:3};
```

the direct noncomputed `__proto__:null` object-literal prototype setter establishes a null prototype under ordinary JavaScript object-literal semantics. The special member is **not an own field**, so `Reflect.ownKeys(schema)` contains only the actual data fields. For a computed `schema[key]` with an interprocedurally proven primitive string `key`, the key must either select an own literal primitive or return `undefined`. It cannot fall through to `Object.prototype.constructor`, `hasOwnProperty`, or an injected `Object.prototype.noSuchField=Function` inherited property. This remains true even when the unrelated global `Object.prototype` is mutated.

A local Node runtime sanity check on 2026-11-16:
```
schema={__proto__:null,externalFormat:'audit-v1',auditCount:3};
Object.prototype.noSuchField=Function;
Object.getPrototypeOf(schema)===null;       // true
schema.noSuchField===undefined;             // true
Reflect.ownKeys(schema);                   // ['externalFormat','auditCount']
```

This is a direct language-semantics check, not an end-to-end compiler differential. The exact special syntax matters. `{['__proto__']:null}` instead creates an own field, and `Object.create(null)` invokes a mutable method and requires a separate proof.

## Proposed compiler extension (not implemented)

1. Extend `safeClosedCallerRecordRead` to distinguish a single **uncomputed, nonmethod, nonshorthand** `__proto__:null` special property from ordinary data properties. Reject syntactic duplicate, getter/setter, computed and nonliteral prototype forms.
2. Retain all present receiver ownership restrictions, direct named ESM literal-call argument proof, unique parameter-use constraint, alias/reexport/unknown-import refusal, and source-observer gate.
3. Admit missing/inherited-spelled caller keys only for syntactically proven null-prototype record literals. Otherwise preserve current own-key-only refusal.
4. Test a 3-module source with a null-prototype schema, direct `inspectRecord('noSuchField')` and `inspectRecord('constructor')` calls, and an external Node preloader injecting `Object.prototype.noSuchField=Function`: expect null returned values, no dynamic loader reachability, and positive private-field transformation with native output parity.
5. Add adversarial variants with `Object.setPrototypeOf(schema,...)`, escapes, `Reflect.ownKeys` monkeypatches, computed `['__proto__']`, prototype setter aliasing, imported calls, and multiple clients. Use exact source/branch/seed, cross-platform Node and real Chromium, plus independent public-only recovery and 2.5x measurements.

## Limits

This proposal does **not** restore 2/2 for the unchanged frozen application, which intentionally uses a normal object prototype. Rewriting a customer's normal object literal into a null-prototype literal might alter legitimate `Object.getPrototypeOf`, method lookup and host-extension semantics; no automatic rewrite is proposed. It is an eligibility pattern for programs whose authors already use a null-prototype private record, or who consciously accept the changed original program.

A fully instrumented client can still modify global `Reflect`/`Object` intrinsics or import the exported state independently, so static source-only field renaming does not provide an execution-integrity or confidentiality boundary. This proof candidate is compatible with current conservative fallbacks and might recover legitimate transformed workload where the syntax intrinsically excludes inherited constructors.
