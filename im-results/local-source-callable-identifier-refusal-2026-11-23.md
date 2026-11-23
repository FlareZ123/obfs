# Conservative identifier source-span guard with private direct-call positive

**Agent 38, 23 November 2026. Status: provisional compiler research candidate; not merged, not release-qualified.** Branch `agent38/source-exact-identifier-local-proof-20261123` directly based on main `70bf6f57dbfcfe577a01ea6dc43a322fef91f26f`; identical compiler patch at branch SHA `ede5ce6de9fdf70bf7d71e3075f0a197bfc7c3c6`. The change is confined to `src/identifiers.js`. Do not confuse this branch's focused tests with a full current-main integration gate.

## Source-parity failure addressed

The unmodified compiler mangles parameters and local identifiers of source-visible exported callables even when the file has no internal `Function#toString` calls. Unknown external CommonJS/ESM consumers can inspect their exported functions. The previously published [external CJS/ESM/Chromium red report](commonjs-public-callable-identifier-observer-2026-11-23.md) contains the exact native/emitted strings.

The experimental guard walks callable AST spans, records an exported ancestor, and declines lexical binding/parameter renaming inside callable source unless it can identify a named function with globally unique binding used **only as the direct callee in non-optional CallExpressions**, or a directly invoked function/arrow expression. ESM exported declarations are conservatively marked source-visible. Unnamed function expressions, object methods, class methods, aliases, returned nested functions and dynamic publication remain source-visible by default. Nested source-visible enclosing ranges veto changes inside private inner functions too. This deliberately prioritizes the public `Function#toString` contract over aggressive identifier yield.

This is a **bounded syntactic non-escape heuristic**. It has **no complete interprocedural or cross-file proof**, does not cover arbitrary runtime reflection or unknown host stack callbacks, and may be overconservative. In particular, a direct-call-only function may still be exposed by dynamic error-stack introspection, unusual callbacks or a host-specific API. Do not call it a sound universal escape analysis without further adversarial tests.

## Source-pinned two-platform regression results

At exact source SHA `ede5ce6de9fdf70bf7d71e3075f0a197bfc7c3c6`:

| Test | Prior compiler | Experimental guard | CI evidence |
| --- | --- | --- | --- |
| 14 CommonJS publication shapes × 3 modes × identifiers on/off | **39/84 native source mismatches** per OS | **0/84 mismatches**; 84/84 values preserved | [45130526319](https://github.com/FlareZ123/obfs/actions/runs/45130526319), Ubuntu/Windows both pass |
| 8 CJS observer/primitive forms × 3 modes × identifiers on/off | **3/48 mismatches** | **0/48**, genuine private property yield retained in all 3 modes | [45130531678](https://github.com/FlareZ123/obfs/actions/runs/45130531678), both OS pass |
| Unknown-importer ESM named export ×3 modes × identifiers on/off | **3/6 mismatches** | **0/6** | Same [45130531678](https://github.com/FlareZ123/obfs/actions/runs/45130531678) |
| Existing exported-callable regression suite | not retested in this comparison before patch | **133/133 focused Node cases pass** | [45130779988](https://github.com/FlareZ123/obfs/actions/runs/45130779988), both OS |
| Existing identifier TypeError-spelling suite | not retested in this comparison before patch | **13/13 focused cases pass** | [45130785563](https://github.com/FlareZ123/obfs/actions/runs/45130785563), both OS |

Every listed focused workflow also passed its strict project and external JSDoc steps. The 14th CommonJS shape is a genuinely private direct-call function exporting only a primitive result: `identifiers:true` still renames **2 local bindings per mode**, preserving nonzero protected work. The private-record control similarly retains one private property rename per mode. The cited checks are finite and focused; they are not the full 5,000-plus regression suite or a hostile browser/service audit.

## Outstanding safety and integration work

The source-span guard may leak source from a nominally private directly called function through a native host error stack, captured callback, reflected function value or unseen cross-file alias. These need explicit test cases and an owner-approved boundary before integrating a default behavior change. This patch itself does not confer static/dynamic deobfuscation resistance or environment locking, and no runtime/compile cost deltas have been measured. Independent attacker clone and the hard sampled 2.5× budget veto for a different Wasm-private facade remain described in [its report](wasm-i32-private-public-source-facade-2026-11-23.md).

**Disposition:** preserve as a code-and-test donor for canonical Agent3 source-observer/identifier integration. The existing release remains **RELEASE-BLOCKED**; avoid merging or claiming an 84-case green local slice as a full compiler qualification.

## Adversarial host-stack falsifier: direct-call-only does not prove source secrecy

The initial direct-call-only private escape criterion is **unsound under V8's ordinary `Error.prepareStackTrace` API**. The external host can register a sloppy-mode `getExternal` function and a host `Error.prepareStackTrace` callback, then invoke the public API. The module under test contains no source-observer syntax:

```js
function hidden(){const privateLocal=17;return privateLocal+getExternal();}
function publicReader(){return hidden();}
module.exports=publicReader;
```

The only in-file reference to `hidden` is the direct call `hidden()`. The compiler therefore treats it as private, renaming `privateLocal`. However, the externally supplied sloppy `getExternal` throws a host `Error`. When the caller examines `error.stack`, its registered `Error.prepareStackTrace` receives V8 CallSite frames; `frame.getFunction()` returns **the supposedly private `hidden` function object**. `Function.prototype.toString.call(hidden)` exposes the changed name. A strict-mode host callback may instead suppress getFunction on deeper frames, hence the test explicitly uses a sloppy callback constructed via `Function('throw new Error(...)')`; the original direct `throw new Error` fixture was conservatively vetoed by the pre-existing source observer and is not the counterexample.

The focused [Ubuntu/Windows run 45131267690](https://github.com/FlareZ123/obfs/actions/runs/45131267690) at exact branch SHA `0d6cfe513a4683d4a6937e286fbef361c97734fa` is **RED in both operating systems**, with test `test/agent38-v8-stack-private-callable-source.test.js`:

| Published observation | Native | COO | SNO | SCO |
| --- | --- | --- | --- | --- |
| `Function#toString` of host-captured private frame | `const privateLocal=17` | `const _v2f5259b22467=17` | `const _vc5ede3d5d1f8=17` | `const _vfdd84d04f62f=17` |
| In-file direct-call-only binding criterion | passes | passes | passes | passes |
| Local identifier rewrite count | 0 original | 1 | 1 | 1 |

The correct disposition is **do not merge this private direct-call-only proof as a sound default source-parity fix**. Its 84-case and 54-case green results above remain finite useful coverage for known export shapes, but the positive private callable admission fails under a legitimate unknown host observer. Future owners should require a much narrower proof that rules out all exception/callback/proxy/host coercion pathways capable of exposing V8 frames, and must verify the intended semantics for source inspection under their threat model. A conservative all-callable-source preservation fallback might restore this particular parity at the cost of losing private lexical yield; other non-callable transforms and truly server-retained computations can supply separate positive yield. Do not erase this red witness merely to preserve the earlier green matrix.
