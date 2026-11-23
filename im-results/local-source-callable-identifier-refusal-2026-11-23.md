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
