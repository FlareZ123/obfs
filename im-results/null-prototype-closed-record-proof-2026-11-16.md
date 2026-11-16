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

The candidate compiler and nine-case regression were committed at `44be4efe04904a95b642527bb82b13ef57b5f626`. [Manual full validation 43875169931](https://github.com/FlareZ123/obfs/actions/runs/43875169931) **completed successfully** at that exact SHA across Node22 Ubuntu and Windows, strict JSDoc, sampled benchmark and Ubuntu Chromium integration.

A later candidate branch revision adds a distinct full six-module application diagnostic: `sims/application-challenge-observer-ablation.js` constructs a null-prototype record variant after explicitly removing both source observers; `sims/application-challenge-refusal-yield.js` now requires **2 of 2** genuine owner-field rewrites in that variant while retaining `inspectRecord('noSuchField')`. It checks 84 native/emitted cases and 160 offline public-only held-out clone cases per variant. This application is **deliberately different from the original frozen source**, which stays at **0/2**. The later simulator changes were not part of full validation 43875169931 and require separate pinned confirmation.

## Independent full application and whole-process evidence

The extended [source-observer ablation](../sims/application-challenge-observer-ablation.js) includes an explicitly distinct `null-proto` six-module application. It retains the original `inspectRecord('noSuchField')` call, declares a syntactic null-prototype record and removes two source-observer expressions. The [refusal/yield simulator](../sims/application-challenge-refusal-yield.js), now exercised from the [default Node test suite](../test/application-challenge-null-prototype-yield.test.js), requires **2/2 private-key rewrites** and parity over 84 native/emitted cases plus 160 public-only held-out offline clone calls. Its frozen source-observing and observer-free plain-record negative controls remain at **0/2**. The changed own-key-only application is an independent 2/2 positive.

[Full application/test/performance validation 43877956853](https://github.com/FlareZ123/obfs/actions/runs/43877956853) passed on Ubuntu/Windows at exact SHA `889e1c9ba6ab4875e130eb58f4ab673d8d603aff`. Nine paired, alternating complete Node process trials per workload gave:

| Source variant | Workload | Linux emitted/native | Windows emitted/native |
|---|---|---:|---:|
| Own-key-only modified app | one-event startup | 0.99025× | 1.03346× |
| Own-key-only modified app | 80-case sustained session | 0.98992× | 0.96949× |
| Null-prototype modified app | one-event startup | **1.00747×** | **1.01495×** |
| Null-prototype modified app | 80-case sustained session | **1.00771×** | **1.04791×** |

Every sampled result met the 2.5× ceiling on these two runners. Including process startup does not remove the need to benchmark protected hot operations separately. Publicly delivered code remains clonable without private source, so the favorable runtime cost and 2/2 renamed-key coverage **do not demonstrate reverse-engineering resistance**.

The later [Chromium browser extension](../test/verified-record-browser.js) evaluates 64 cases on two real ESM pairs. It explicitly installs an inherited `Function` on `Object.prototype.noSuchField`, verifies that both native and generated null-prototype reads remain `undefined`, and checks that two owner fields are genuinely renamed. Its latest pinned run is pending; the preceding green 43877956853 did not include that browser-source revision.

## Boundaries

This extends behavior preservation for a narrowly proven original syntax form. It does not make a plain object safe if callers ask missing keys; changing its prototype would change semantics. It does not establish that arbitrary external preloads, custom loaders, Proxy traps, cross-realm callbacks or mutable builtins are inert. Under complete client control, COO public files remain inspectable, clonable and modifiable. A 2.5x runtime guarantee for all workloads is also not established. If successful, report the unchanged-original positive fraction separately from any deliberately modified source benchmark.
