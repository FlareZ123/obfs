# SCO native-origin provenance closure proposal

**Author:** Agent 8, 22 November 2026. **Status:** research design proposal, not a verified general algorithm. **Primary constraint:** semantic identity for approved browser/Node relocation, with protected runtime compute at most 2.5× baseline.

## Problem evidenced by independent tests

The selective SCO scanner already handles several native and platform-dependent operations. Multiple source-pinned independent failures on the same compiler family show a recurring limitation: a safe-looking AST form can produce, carry, or expose a host-owned value through a different AST form that the local scanner does not track.

The [combined regression report](../im-results/sco-reflect-blob-cross-host-2026-11-22.md) distinguishes the frozen red compiler baselines, green repairs, and bounded limitations. Crucially, [the opt-in two-OS browser/Node SFT](../test/sco-host-native-source-browser.test.js) directly compares four native observations. [CI 45079125382](https://github.com/FlareZ123/obfs/actions/runs/45079125382) ran Node 22.23.4 against real Chrome 157 on Ubuntu and Windows and passed. Strings for the Blob constructor, Blob.slice, a Blob.stream-produced ReadableStream constructor, and AbortSignal.timeout's TimeoutError stack each differed between engines. The source spellings of the first three also differed between the two Node OS builds.

Those are actual runtime observations; the source-gate red/green results demonstrate which selected programs were incorrectly admitted. Neither observation proves a general deobfuscation-resistance improvement.

## Proposed bounded analysis

A single lexical/AST origin graph would propagate an abstract state for the values whose source or host is semantically observable. The following classification is a **design sketch**, not an established complete type system:

| Abstract origin | Examples | Conservative handling |
|---|---|---|
| Stable scalar | Frozen numeric `Blob.size`; a vetted `Blob.text()` result after await | Allow when no unproved cross-host exception/result path exists |
| Tracked host object | Locally constructed Blob, AbortController and AbortSignal | Carry provenance through plain aliases and separately vetted method-return summaries |
| Host function | Global Blob constructor; extracted Blob.slice; ReadableStream constructor | Refuse first-class escapes to callbacks, coercion, reflection or unknown code, unless every destination is proved safe |
| Native result object | Blob.slice() returns Blob; Blob.stream() returns ReadableStream | Propagate specific object origin if supported; otherwise refuse when host semantics are unproved |
| Host clock or exception source | AbortSignal.timeout(), implicit abort reason, native DOMException.stack | Refuse relocation when the origin or timing cannot be reproduced on the target |
| Unknown | Dynamic property key, opaque call, getter, mutation, proxy, broad reflective transfer | Preserve the original public execution boundary or reject selective relocation |

Each origin transfer requires a proof of its **value** and **effect** behavior. Symbolic aliases must track `const Make=Blob` and `Make=Blob` only for the exact plain `=` operator. Treating `out+=Blob` as a plain alias caused an actual first-class source leak. Constructors cannot be recognized solely by `new Blob()`: `Reflect.construct(Blob,...)`, `.bind`, property registries and generic callbacks can invoke or expose the same native constructor.

Method-return summaries should be narrowly explicit. A direct `Blob.slice()` produces another Blob, and chained slices preserve that origin. `Blob.stream()` produces a ReadableStream with its own native prototype and constructor. A `Blob.text()` call eventually yields a string, but a first-class `Blob.text` function value exposes host source. A compiler needs distinct states for the method function, its invocation, its promise return, and its resolved result.

## A proof obligation for admission

For every selected private export, find an acyclic or conservative fixed-point closure of reachable values through local assignments, declarations, returns, calls, object fields, destructuring, and cross-file ESM references. Annotate host-native origins and effect creation sites. Refuse if an unknown/host origin reaches an observable operation without a domain-specific transfer proof. Examples of observations include:

- String conversion and Function.prototype.toString, native stack fields, constructor/prototype and shape reflection
- Export or RPC response serialization, call into public/foreign code, dynamic index, callback or proxy
- Host clocks, timeout scheduling, OS newline conversion, source filenames and stack coordinates

Proving a **primitive result** is insufficient when a method called to produce it also depends on realm-specific time, source, exception or side effects. Host assumptions must be explicit: Node version/OS, browser engine/version, locale, timezone, active-document time, and authorized server/client phase. The same source may be admissible within one fixed host configuration but unsafe for heterogeneous browser/Node relocation.

A compile-time-only rejection is preferable to adding runtime checks when the goal is pure equivalence. This preserves the protected code's runtime performance budget but can reduce the eligible program set. Enlarging eligibility requires a new witnessed transfer rule and end-to-end execution proof.

## Adversarial test matrix

Build and keep paired positive/negative cases for each native origin across the following shapes, with independent source pins:

1. Direct invocation and bare method/constructor value extraction.
2. Identifier aliases, mutable reassignments, compound/logical assignments, object registries, computed property keys, destructuring, return values and callback parameters.
3. Reflect.construct, Reflect.apply, Object/Reflect property reflection, bind, prototype lookup and new.target.
4. Nested result-producing methods such as `Blob.slice().slice()`, `Blob.stream()`, promises and async continuation.
5. Chromium and Node on Ubuntu/Windows, including a genuine browser-to-server RPC session where feasible, with primitive outputs, byte encodings, native stacks and call traces compared.
6. A breadth corpus of public contracts, inter-file imports, getters, proxies and instrumented host APIs, where rejection should be the outcome whenever proof is missing.

Every repair needs a red-first source pin, a minimal green patch, positive controls preserving accepted behavior, strict JSDoc, and a single full integration gate at the final canonical source SHA. The existing single-owner SCO PR #302 avoids competing integration heads. Each case should be measured against original compute; compile-time analysis cost belongs to the permitted initialization phase only where the objective's rules allow it.

## Boundaries and next decision

This proposal is a hypothesis about improving correctness *coverage*, with no claim that the complete general graph or a feasible high-yield proof strategy has been implemented. Whole-program native origin tracking is difficult in JavaScript because arbitrary proxies, dynamically computed properties and external callbacks may be indistinguishable from safe values. Under the requested semantics guarantee, those cases should remain unmodified or be refused for relocation.

The primary obfuscator currently remains **RELEASE-BLOCKED** on independent reconstruction, online relay, filesystem compromise and some >2.5× compute tests. Better host-origin safety prevents silent behavior drift but does not by itself strengthen resistance to an attacker who controls a client or server runtime.
