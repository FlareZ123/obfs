# Opaque external source readers defeat a purely syntactic source-observer guard

**Date:** 2026-11-15, Agent 50. **Class:** intermediate reproducible **compatibility counterexample**. **Pinned commit:** `e064f1fc8d0355d93228d506888542f6572388d8`. **Cross-platform green research-run:** [43717875329](https://github.com/FlareZ123/obfs/actions/runs/43717875329) on Ubuntu and Windows, Node 22. The run passed by affirmatively detecting the expected mismatches; it does **not** certify native semantic equivalence for these cases.

## Context

The shared `src/ast.js` syntactic observer conservatively declines transformations when a supplied source file reads `Function.prototype.toString`, function string coercions, `Error.stack`, or several related reflection patterns. Agent 50's earlier `test/error-stack-observation.test.js` added exact stack-coordinate regression coverage. These guards protect observations **visible inside supplied files** and certain cross-file relationships in a supplied closed-world group.

The specified research contract, however, includes external `window.*` and opaque application APIs. Such an external callback is allowed to inspect an argument's function source or error stack even when the compiler never receives its implementation. The compiler's AST cannot establish that an arbitrary untrusted callback will preserve function source invisibility.

## Reproducer

[`sims/external-function-source-contract.js`](../sims/external-function-source-contract.js) compiles a tiny CommonJS file in SNO mode, disables property renaming and string encoding to isolate identifier rewriting, and executes native and obfuscated source with the **same host-injected** `hostBridge`. The host implementation is never supplied to the compiler.

1. An external bridge receives a local function `compute` and returns its computed number and `Function.prototype.toString.call(compute)`. Native and transformed numeric values remain 37. The exact function-source strings differ because the compiler changes local names.
2. An external bridge calls a supplied function that invokes an injected `raise`. That host function throws an Error. The bridge extracts a frame matching `opaque-source.cjs:line:column`. No `.stack` property occurs in the supplied source, yet shortening local identifiers changes the externally captured frame.
3. The ESM module declares a function, then publishes it with `export {exported}`. The separately loaded external consumer (not included in the compiler input group) calls the exported function and inspects `Function.prototype.toString`. The return value matches; exact source differs.
4. A host bridge that only invokes a function and uses its computed number receives equal native/transformed results. This is a positive functional-equivalence control.

## Measured output

Both Linux and Windows returned exactly:

| Observation | Result |
| --- | --- |
| Opaque function's computed value preserved | true |
| Exact function-source spelling changed in opaque host bridge | **true** |
| Exact Error stack-frame coordinate changed in opaque host bridge | **true** |
| Exact source spelling of separately exported ESM function changed | **true** |
| Exported function's numeric result preserved | true |
| No-source-observer external callback received equal value | true |

An initial trial [run 43717707884](https://github.com/FlareZ123/obfs/actions/runs/43717707884) was red because the internal fixture used the built-in `Error(...)`, which the existing source-coercion guard already recognized and declined. Moving the error creation into the genuinely opaque injected `raise` clarified the intended **outside-the-input** observer scenario. This is a correction to the test design, rather than evidence that the original guard failed on the built-in case.

## Implications for the product

Under an unmodified standard `Function.prototype.toString`, if a compiler changes the source text of an externally inspectable function, an external consumer can distinguish original and transformed results by returning that source text. Therefore **exact source-observing 1:1 behavior and changed source text are mutually incompatible for the same exposed function under this observation contract**.

The present compiler should not claim strict 1:1 semantics for arbitrary external callbacks or consumers of transformed exported functions. The reported positive behavioral regressions cover known observations of supplied programs, not unknown consumers. Compatibility policies that could resolve the conflict include:

- an explicit **strict external observability mode**, refusing to transform source for functions whose use may escape to opaque APIs;
- a per-function effect/escape analysis to retain transformations in internal-only functions while protecting externally source-visible ones;
- a documented weaker functional-equivalence contract that excludes exact `Function#toString` and error-frame coordinates when callers choose to obfuscate exposed functions.

Any strict-mode implementation must account for aliases, containers, callbacks, generated exports, cross-file imports, and source consumers outside the closed-world input graph. Global blanket refusal of all files with functions would preserve more cases but sacrifices substantial transformation coverage. Runtime spoofing of `Function.prototype.toString` or error stacks cannot guarantee a trust boundary under a client that controls intrinsics and can instrument execution.

**Open work:** Design a precise interoperability policy, implement the selective escape proof, and rerun these fixtures as *equality* checks with a denominator of still-transformable internal functions. This report intentionally preserves a falsifying counterexample and makes no positive obfuscation-security claim.
