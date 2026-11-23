# TypeScript lexical-binding reference oracle for host-root resolution

**Status:** reproducible test infrastructure; not a production binding resolver or established result.  
**Date:** 2026-11-23  
**Branch:** `agent1/window-global-binding-audit-20261123`  
**Test:** `test/lexical-global-root-typescript-oracle.test.js`  
**Commit:** `e40dc20f64644032dbc1995ef61a14a41e782f00`  
**Focused run:** [45189988681](https://github.com/FlareZ123/obfs/actions/runs/45189988681)

## Purpose

Agent 3 reported using the TypeScript checker as a development reference for lexical binding resolution. This test-only probe makes that reference behavior reproducible in the repository without adding TypeScript to production runtime code.

The test creates temporary TypeScript source files and uses the existing TypeScript dev dependency with:

- `module: ts.ModuleKind.None`
- `target: ES2022`
- `lib: ['lib.es2022.d.ts', 'lib.dom.d.ts']`
- `types: []`
- `noEmit: true`

It asks the checker for the symbol attached to a selected `window` reference and records declaration kind, parent kind, source file, and flags.

## Covered binding shapes

The oracle test passes for:

| Source form | Checker declaration |
|---|---|
| Unshadowed browser `window` | ambient declaration from `lib.dom.d.ts` |
| Function parameter `window` | Parameter |
| `catch (window)` | VariableDeclaration under CatchClause |
| Function-local `class window` | ClassDeclaration |
| Named function expression `function window()` | FunctionExpression |
| Nested-block `var window` used outside block | VariableDeclarationList with no BlockScoped flag |
| Destructured parameter `({window})` | BindingElement |
| Nested-block `let window` | VariableDeclarationList with BlockScoped flag |

This demonstrates that a reference resolver must distinguish declaration kinds and declaration scopes; identifier spelling and a global whole-AST name count are not enough.

## Dynamic-scope caveat

Two further tests are important:

- In a `with` body, the TypeScript checker returns no symbol for the `window` reference. The probe marks the reference as dynamic/Unknown.
- With direct `eval`, the checker can still return the ambient `lib.dom.d.ts` Window symbol even though runtime direct eval can introduce a shadowing `var window`. The probe therefore marks the affected function scope Unknown independently of the checker symbol.

The helper scans every enclosing function scope for direct eval while skipping nested function bodies, so a direct eval in an outer function taints a nested closure but an eval in a sibling function does not. The test does not claim to be a complete production dynamic-scope analysis; it is a reproducible acceptance oracle for these cases.

## Validation

Focused run **45189988681** passed on both Ubuntu and Windows with Node 22.23.4. The focused test, strict project JSDoc, strict external JSDoc, and paired/complete-suite budget evaluator JSDoc all passed on both operating systems.

This validates the test harness and its TypeScript API expectations, not any obfs binding resolver. It does not add a production dependency or change src/. Further useful extensions include module-vs-script top-level bindings, destructuring variants, imports, globalThis/self/localStorage/Storage roots, and more dynamic-scope cases.

**Disposition:** retain as test-only reference infrastructure on the Agent 1 evidence branch and offer it to Agent 3 for integration into the canonical lexical-root work. Do not promote to `results/`.
