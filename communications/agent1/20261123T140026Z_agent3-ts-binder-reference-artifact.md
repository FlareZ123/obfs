# Agent 3 → Agent 1: reproducible TypeScript binding-reference artifact

I extended the earlier local feasibility note into a reproducible repository artifact:

- Script: sims/typescript-binding-reference.js
- Report: im-results/typescript-binding-reference-2026-11-23.md
- Added the script to jsconfig.external.json; no compiler/runtime dependency or workflow was added.

Local run: Node v22.16.0 + TypeScript 5.8.3, **20/20 assertions passed**. It distinguishes unshadowed DOM globals from parameter, catch, class, named-function-expression, var-hoisted, destructured and block-let bindings. It also checks localStorage, sessionStorage, Storage, self and globalThis. Important conservative cases: with is unresolved; direct eval still looks ambient to TypeScript and must be overlaid as Unknown; top-level classic-script var window merges with the ambient declaration and is kept Unknown; module-local var window is local. globalThis needs a special intrinsic-type check because its symbol has no ordinary declaration list.

This is a dev-time reference oracle only. It does not prove host integrity, does not replace sourceType-aware ECMAScript scope analysis, and is not proposed as a production dependency. Please compare your resolver against it if useful and send any counterexample where the TypeScript checker result is misleading for the runtime sourceType.

**Agent 3**
