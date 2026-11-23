# TypeScript binder as a development-time reference for host-global resolution

**Date:** 23 November 2026. **Agent:** 3. **Classification:** intermediate tooling observation, not a production resolver or security result.

## Question

Can the TypeScript compiler already installed as this repository's devDependency serve as a useful reference oracle while a binding-aware resolver is designed for source-observer analysis? The current production helper in src/properties.js is a partial name-to-scope map, and src/ast.js currently treats globalThis/window/self/global as host roots by identifier spelling alone.

## Reproduction

The canonical probe is sims/typescript-binding-reference.js, with a focused node:test wrapper at test/typescript-binding-reference.test.js. The probe uses TypeScript's checker with allowJs/checkJs, ES2022 plus DOM library declarations, and checker.getSymbolAtLocation for the tested reference. It creates temporary fixture files and removes them after each case. Both files are included in jsconfig.external.json. No runtime dependency or workflow was added.

Local execution: Node v22.16.0, TypeScript 5.8.3; **23/23 assertions passed**.

Cross-platform focused CI: run **45192132319**, exact source a3d9b3c35f174950f345d187f03866e8375dd20, Node 22.23.4, lockfile-installed TypeScript 5.9.3. The focused test passed on Ubuntu and Windows, as did strict project JSDoc and strict external JSDoc. The full node22 job was skipped because this was a focused dispatch; this is not full-suite acceptance. Agent 1's complementary ancestor-eval oracle also passed on both OS at 45189988681 and its cases have been folded into this single canonical probe.

## Observed decisions

The script asserts **23/23** expected decisions: 8 ambient host-global candidates, 11 shadowed locals and 4 conservative unknowns.

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
| window inside a with body | No symbol; Unknown |
| Direct eval in the current function | Checker still resolves ambient DOM Window; ancestor-scope scan marks Unknown |
| Direct eval in an enclosing function, reference in a nested closure | Outer function's direct eval taints the nested closure; Unknown |
| Direct eval in a sibling function | Does not taint the separate nested closure; host-global candidate |
| A local parameter named eval | Not treated as the builtin direct eval; no dynamic-scope taint |
| Top-level var window in a classic script | Ambient and source declarations merge; conservatively Unknown |
| Top-level var window in a module | Module-local binding; shadowed local |

## Interpretation and limitations

This is useful evidence that TypeScript's binder can act as a **development-time comparison oracle** for several cases the current helper omits. In particular, it distinguishes parameter/catch/class/named-function/destructuring/var/block bindings from unshadowed DOM globals, and the added ancestor-scope pass models an important direct-eval boundary: an outer function's eval can affect a nested closure, while a sibling function's eval does not.

The probe scans each enclosing function scope for direct eval while skipping nested function bodies, and checks ancestor WithStatements. It treats a local binding named eval as an ordinary callable rather than the builtin direct eval. This remains a bounded test oracle, not a complete dynamic-scope implementation.

It is not a production proof:

- TypeScript's default library declarations describe a type environment, not the actual host. A preloader, monkey-patch, alternate realm or compromised runtime can replace globals and methods.
- The checker alone does not model direct eval's runtime binding effects. The separate scope scan is necessary; unsupported or ambiguous eval resolution must remain Unknown.
- with introduces dynamic name lookup and must remain Unknown.
- A classic-script top-level var declaration merges with the ambient global in this probe; the result is kept Unknown rather than guessing whether a particular browser global binding is the same host object.
- The globalThis intrinsic has no ordinary declaration list in this API path and needs a distinct rule.
- This probe does not cover all Annex B function-declaration behavior, import/export alias graphs, dynamic imports, proxies, decorators, private names, or host trust. The Node global identifier was not tested because the probe deliberately loaded only the ES and DOM default libraries.
- Creating TypeScript Programs per file is a test/reference technique, not a proposal to put TypeScript in the obfuscator's runtime path. Any production use must separately justify dependency, memory and compile-time cost.

## Harness corrections retained

The initial 20-case wrapper assumed local TypeScript 5.8.3, but CI installed 5.9.3 under the repository's declared version range; that assertion was generalized to major version 5. A subsequent strict external JSDoc run caught three implicit-any callback parameters, which received an explicit JSDoc report shape. The 23-case extension then caught a stale expected label for with (now unknown-with) and a stale unknown-count filter; both were corrected before the final successful run 45192132319. Earlier red attempts are retained as harness fixes, not hidden.

## Recommended use

Use this script as a reference matrix when reviewing a custom BindingId resolver. The production resolver still needs explicit sourceType/script/module semantics, correct var hoisting and lexical scopes, destructuring, catch/class/named-function bindings, imports, and fail-closed Unknown results for with/direct eval or unsupported constructs. Compare custom per-reference decisions against this matrix and add native execution differentials wherever TypeScript's type model is not a runtime guarantee.

This artifact supports the host-root precision row in workplace/agent3-source-observer-decoder-intake-2026-11-22.md. It does not change the release decision: **RELEASE-BLOCKED**.
