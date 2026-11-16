# Syntactic null-prototype records extend verified ESM property-flow coverage

**Agent 6, 16 November 2026. Intermediate candidate, pending integrated CI.** This implements and evaluates [Agent 43's null-prototype record hypothesis](../workplace/agent43-null-prototype-record-proof-hypothesis.md). The property compiler remains a conservative, incomplete JS analysis; these tests are not obfuscation-hardness evidence.

## Semantic claim and explicit assumptions

A record initializer of the exact object-literal form:

    const schema={__proto__:null,externalFormat:'audit-v1',auditCount:3};

sets the new object's internal prototype to null without creating an own `__proto__` field. Consequently, `schema['noSuchField']`, `schema['constructor']` and `schema['toString']` are all undefined if the record is never mutated or escaped, even when the host has placed a callable `Function` on `Object.prototype.noSuchField`. This follows the [ECMAScript object-initializer rule documented by MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer), including its distinction from `{['__proto__']:null}`, which creates a normal own field.

The existing `safeClosedCallerRecordRead` proof admits a private record only when all callers are direct static ESM named imports, all call arguments are literal primitive strings, the record is an unescaped constant object, the value fields are simple literal primitives, and the reading function returns a tightly constrained result. For ordinary objects, every call key must be an own property of the record; unknown/inherited keys decline because `Object.prototype` is mutable.

This candidate adds an optional **syntactic null-prototype owner** proof. It accepts one noncomputed, nonmethod, nonshorthand `__proto__:null` or `'__proto__':null` setter. It also proves that every other record field is an ordinary, noncomputed, literal-valued property. For such a record, static direct callers may request missing or inherited-looking keys. With no prototype, these yield only an own literal primitive or undefined, and the exceptional cross-file record proof can safely proceed **under the existing ambient-intrinsic and host-closure assumptions**. No user source is rewritten to add a null prototype; the program must declare it itself.

## Native checks and compiled application fixtures

The new [nine-case Node ESM suite](../test/cross-file-null-prototype-record.test.js) checks a three-file application with a separately exported `state={secretField:41}`, an unrelated reflective record, and only real named ESM call sites. Original and emitted programs run in independent fresh Node processes with the same preloader setting `Object.prototype.noSuchField=Function`.

Cases explicitly compare:
- Positive `__proto__:null` and quoted prototype setters, with missing and inherited-looking literal keys; require **one** actually renamed exported private field and native/emitted output parity.
- Ordinary inherited record, computed own `['__proto__']:null`, and `__proto__:{}`; require **zero** property rewrites and exact native parity.
- Null-prototype record with a dynamic caller argument, mutated prototype, or escaped receiver; require refusal and parity.
- Ordinary record with two proved own keys; require the previous positive **one** rewrite, guarding against vacuous global refusal.

The source change is limited to `safeClosedCallerRecordRead` in [src/cross-properties.js](../src/cross-properties.js). It retains the source-visible ambient Reflect/Object mutation scan added in earlier work. The literal-prototype distinction was separately verified using Node v22.16 and Acorn parse trees, but this manual sanity check **cannot substitute** for cross-platform compiler CI.

## Validation

The candidate was committed at `44be4efe04904a95b642527bb82b13ef57b5f626`, including the nine-case fixture and code change. [Manual full validation 43875169931](https://github.com/FlareZ123/obfs/actions/runs/43875169931) was triggered against that exact SHA, with Node22 Ubuntu and Windows, strict JSDoc and Ubuntu Chromium. It was in progress at the initial report and must be marked passed only after inspecting its jobs.

## Boundaries

This extends behavior preservation for a narrowly proven original syntax form. It does not make a plain object safe if callers ask missing keys; changing its prototype would change semantics. It does not establish that arbitrary external preloads, custom loaders, Proxy traps, cross-realm callbacks or mutable builtins are inert. Under complete client control, COO public files remain inspectable, clonable and modifiable. A 2.5x runtime guarantee for all workloads is also not established. If successful, report the unchanged-original positive fraction separately from any deliberately modified source benchmark.
