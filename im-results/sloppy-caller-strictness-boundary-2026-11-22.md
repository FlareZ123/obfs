# Strictness boundary for host-observed CommonJS caller source

**Date:** 2026-11-22  
**Status:** Intermediate runtime-compatibility experiment; not a general source-privacy or security result.

## Question

Can a preloaded sloppy host callback inspect the source of a CommonJS module wrapper or a private direct-called function through legacy `arguments.callee.caller`, and does a top-level strict-mode directive block this specific source-observation path?

## Method

The reproducible test is `test/sloppy-caller-source-strictness.test.js`.

A real Node CommonJS preloader replaces writable `Array.isArray` with a deliberately sloppy function. While an explicit probe flag is set, it reads `arguments.callee.caller` and records `Function.prototype.toString.call(caller)`, then forwards to the native `Array.isArray`. The target module makes one call at top level (the Node CommonJS wrapper is the caller) and one inside a private direct-called `privateWorker` function. Both versions return numeric value 21.

The test then passes the same native source through `obfuscateFiles` with `properties:true`, `identifiers:false`, and `strings:false), separately for COO, SNO and SCO. It executes both native and emitted modules under the same preloader and checks the source observations, ordinary result, and positive own-key rename metric.

## Results

Source-pinned focused validation: [run 45014548191](https://github.com/FlareZ123/obfs/actions/runs/45014548191), commit `6141a9bdcfd4dd5ad68e866b85e72246db62f200`, Node 22.23.4, Ubuntu and Windows. Both platform jobs passed the focused test and strict project/external JSDoc.

- **Sloppy CommonJS:** the preloader observes both the entire Node module wrapper source and the private worker source. The emitted version has a mangled own-property spelling where native source contains `secretField`; the ordinary return remains 21. This occurs for all three modes, with positive own-key rewrite yield.
- **Strict CommonJS:** with `'use strict'` as the module's directive prologue, the same preloader records `[null,null]` for both native and emitted execution. The same own-key rewrite remains enabled in all three modes, and the ordinary return remains 21.

## Interpretation

On this tested Node/V8 runtime, strictness blocks this particular legacy caller-reflection path for both the CommonJS wrapper and a strict private function. In sloppy mode, a host-controlled replacement of a writable ambient built-in can recover source text even when the transformed function binding never escapes and the source itself contains no explicit observer.

This is a bounded host-compatibility distinction, not a universal theorem. It does not establish behavior for every JavaScript engine, every host hook, strict ESM, browsers, or arbitrary dynamic instrumentation. It also does not protect public exported callables from an importer directly calling `Function.prototype.toString`. The Promise continuation, accessor/proxy, coercion, and other host-source witnesses remain separate obligations.

## Integration implication

A proof based only on lexical direct-call use is insufficient for sloppy CommonJS/classic-script code when a hostile preloader can replace ambient APIs and inspect legacy caller source. A strict-mode cohort may retain more private transformation yield against this specific vector, but must still satisfy the public-callable source contract and other source-observer checks. The product must explicitly define whether this hostile-host behavior is inside its 1:1 compatibility contract; it must not silently claim universal source parity.

No compiler source was changed by this experiment. The test is on main as a reproducible boundary probe; the canonical public-callable integration remains owned by Agent 3. This material belongs in `im-results/`, not established academic `results/`.
