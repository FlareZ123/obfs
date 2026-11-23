# TypeScript binder as a development-time reference for host-global resolution

**Date:** 23 November 2026. **Agent:** 3. **Classification:** intermediate tooling observation, not a production resolver or security result.

## Question

Can the TypeScript compiler already installed as this repository's devDependency serve as a useful reference oracle while a binding-aware resolver is designed for source-observer analysis? The current production helper in src/properties.js is a partial name-to-scope map, and src/ast.js currently treats globalThis/window/self/global as host roots by identifier spelling alone.

## Reproduction

The reproducible probe is sims/typescript-binding-reference.js. It uses the TypeScript 5.8.3 compiler API, allowJs/checkJs, ES2022 plus DOM library declarations, and checker.getSymbolAtLocation for the tested reference. It creates temporary fixture files and removes them after each case. The script is included in jsconfig.external.json so the next existing manual JSDoc gate will typecheck it. No runtime dependency or workflow was added.

Local execution environment: Node v22.16.0, TypeScript 5.8.3. The script's 20 assertions passed locally. A focused existing manual-validation run, 45190756332, then passed on Ubuntu and Windows at exact main source 48985580608502310e01f2011b97a233be18b82a using Node 22.23.4 and the lockfile-installed TypeScript 5.9.3; the focused test, strict project JSDoc and strict external JSDoc all passed. The workflow's full node22 suite was skipped because this was a focused dispatch, so this is not full-suite acceptance.

## Observed decisions

| Reference shape | Checker result / conservative decision |
| --- | --- |
| Unshadowed window in a module | Ambient lib.dom declaration; host-global candidate |
| Function parameter named window | Parameter binding; shadowed local |
| Catch parameter named window | Catch-local binding; shadowed local |
| Local class named window | Class binding; shadowed local |
| Named FunctionExpression named window | FunctionExpression binding; shadowed local |
| var window declared inside a nested block in a function | Function-scoped VariableDeclaration; shadowed local |
| Destructured window parameter | BindingElement; shadowed local |
| Block let window | Block-local VariableDeclaration; shadowed local |
| localStorage parameter vs unshadowed localStorage | Parameter is local; unshadowed reference resolves to lib.dom |
| Storage parameter vs unshadowed Storage constructor | Parameter is local; unshadowed constructor resolves to lib.dom |
| sessionStorage and self | Ambient lib.dom declarations; host-global candidates |
| globalThis | Checker exposes the intrinsic globalThis type/symbol with no declarations; special-case recognition is required. A parameter named globalThis resolves locally. |
| window inside a with body | No symbol; unknown |
| window after direct eval in the same function | Checker still resolves the ambient DOM symbol; an independent direct-eval/dynamic-scope veto is required |
| Top-level var window in a classic script | Ambient and source declarations merge; conservatively unknown |
| Top-level var window in a module | Module-local binding; shadowed local |

The script asserts 20/20 expected decisions: 6 ambient host-global candidates, 11 shadowed locals and 3 conservative unknown cases.

## Interpretation and limitations

This is useful evidence that TypeScript 5.8.3's binder can act as a **development-time comparison oracle** for several cases the current helper omits. In particular, it distinguishes a parameter/catch/class/named-function/destructuring/var/block binding from an unshadowed DOM global, including both local and global references in one module.

It is not a production proof:

- TypeScript's default library declarations describe a type environment, not the actual host. A preloader, monkey-patch, alternate realm or compromised runtime can replace globals and methods.
- Direct eval is not reflected in the checker result. The probe deliberately overlays Unknown for that fixture; a real resolver needs a dynamic-scope pass.
- with produces an unresolved symbol and must remain Unknown.
- A classic-script top-level var declaration merges with the ambient global in this probe; the result is kept Unknown rather than guessing whether a particular browser global binding is the same host object.
- The globalThis intrinsic has no ordinary declaration list in this API path and needs a distinct rule.
- This probe does not cover all Annex B function-declaration behavior, import/export alias graphs, dynamic imports, proxies, decorators, private names, or host trust. The Node global identifier was not tested because this probe deliberately loaded only the ES and DOM default libraries.
- Creating TypeScript Programs per file is a test/reference technique, not a proposal to put TypeScript in the obfuscator's runtime path. Any production use must separately justify dependency, memory and compile-time cost.

## Recommended use

Use this script as a reference matrix when reviewing a custom BindingId resolver. The production resolver still needs explicit sourceType/script/module semantics, correct var hoisting and lexical scopes, destructuring, catch/class/named-function bindings, imports, and fail-closed Unknown results for with/direct eval or unsupported constructs. Then compare the custom resolver's per-reference decisions against the reference matrix and add native execution differentials for cases where TypeScript's type model is not a runtime guarantee.

This artifact supports the host-root precision row in workplace/agent3-source-observer-decoder-intake-2026-11-22.md. It does not change the release decision: **RELEASE-BLOCKED**.


### Harness corrections

The first focused attempt (45190271480) failed only because the wrapper hard-coded local TypeScript 5.8.3 while CI installed 5.9.3 under the repository's declared ^5.8.3 range. The next attempt (45190476972) passed the 20-case test on both OS but strict external JSDoc caught three implicit-any callback parameters in the wrapper. The version assertion was generalized to major version 5 and the parsed report received an explicit JSDoc shape; final focused run 45190756332 passed both OS and both JSDoc checks. The earlier failures are retained here as harness fixes, not hidden.
