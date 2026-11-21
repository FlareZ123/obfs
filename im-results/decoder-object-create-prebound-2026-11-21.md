# Saturating bound-argument provenance for Object.create decoder safety

**21 November 2026. Agent 1. Status: intermediate source-pinned compatibility research.**

## Why first-class detection is insufficient

The native `Object.create(proto, propertyDescriptors)` function can be partially applied through `Function.prototype.bind`. A compiler summary that knows only "this callable may be Object.create" still cannot tell which later argument occupies the descriptor position. In particular:

```js
const factory = Object.create.bind(null, null);
const box = factory({ref: {get() {return String.prototype;}}});
box.ref.charCodeAt = () => 0;
```

The descriptor occupies **argument zero** of `factory` because its prototype was supplied during `bind`. An eager long-string decoder that assumes `String.prototype.charCodeAt` remains untouched can then emit incorrect output after a separate CommonJS module mutates it.

## Differential proof, source-pinned

`test/decoder-object-create-prebound.test.js` runs a native/emitted three-module Node 22 graph, comparing exact exit status, stdout and stderr before decoder-transform metrics. Seven call paths cross two modes (COO and SNO) and two getter values (unsafe `String.prototype`, harmless `Number.prototype`), for 28 cases. It checks immediate/captured bound-prototype calls, a pre-bound descriptor, nested binding, `Reflect.apply` and `.call` on bound functions, and an already-supported bound-`.apply` control.

Unpatched first-class source `b76dc63d9689bb4aa1c99d7d1506afe4009fa7dc`, [Linux/Windows run 44932917808](https://github.com/FlareZ123/obfs/actions/runs/44932917808), yielded **12 actual native/emitted stdout mismatches on both systems**: six unsafe partially bound call shapes times COO/SNO. All 14 harmless Number controls and two already-supported String call-shape tests passed. Ubuntu's broad Node suite: 4,174 passed / 19 failed / one skipped; Windows: 4,171 passed / 19 failed / four skipped, out of 4,194. The seven other failures recur in earlier, independently pinned compiler candidates. Full-workflow success is not established.

## Finite abstract summary candidate

The experimental `src/core.js` patch `860a64d95df960e0735daa6067350e4d58c6518e` on `agent1/object-create-alias-red-20261121` records for each local callable alias and object-held function field a set of possible counts of already-bound native arguments. The abstract count domain is:

```
{ 0, 1, >=2 }
```

`bind(thisArg, ...args)` increases the bound-argument count by `args.length`, saturated at two. The domain is finite: every alias or field can accumulate at most three count facts, including across cycles such as `factory = factory.bind(null, null)`. A monotone worklist/fixed-point pass therefore terminates.

The native descriptor occupies index one in the original argument list. With `k` arguments already bound, a direct call consumes the descriptor at argument index `1-k` if `k <= 1`. For `.call` and `.bind`, the explicit `thisArg` shifts the descriptor index by one. For `.apply` and `Reflect.apply`, it is located within the passed argument array. When at least two native arguments are already bound, the descriptor was supplied to an earlier `bind`, so that binding call must be inspected.

The candidate reuses the existing decoder-sensitive getter-provenance test. It adds compile-time analysis only, and no emitted runtime decoder work. The test at [manual validation 44933493638](https://github.com/FlareZ123/obfs/actions/runs/44933493638) was dispatched; it had not completed when this report was drafted. No green repair is asserted in advance of actual logs.

## Limits and future controls

The lattice represents finite local syntax-visible aliases and fields. It does not prove purity or safety when reflective call methods are themselves overridden, function references are returned by opaque helpers, property names are unknown, external modules supply callable values, or a `Proxy` manufactures the effective factory. Results remain bound to source pins, environments and sample fixtures. A true universal one-to-one JS semantics or 2.5x program runtime guarantee is not established.

For future evaluation, keep `Number.prototype` positive-yield controls and add safe objects in the prototype argument to detect avoidable over-refusal. The primary strong-obfuscation release status remains **RELEASE-BLOCKED**.
