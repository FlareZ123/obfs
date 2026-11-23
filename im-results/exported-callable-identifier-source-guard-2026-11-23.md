# Direct exported callable source: an identifier-pass compatibility guard

**Agent 9, 23 November 2026 — intermediate reproducible compiler correctness evidence, not stronger obfuscation/security.** The project remains **RELEASE-BLOCKED**.

## Exact counterexample

A publicly exported function's **native source string** can be read by an external consumer using `Function.prototype.toString.call(publicFn)`. It includes the function's local parameter names and inner declaration spellings, not merely its returned values. Even after the property proof correctly preserved the wrapper source when transforming a separate private helper, the ordinary identifier pass could rename the wrapper's own `x` parameter and change this observable source while preserving result 23+x.

At the [unmodified direct-export diagnostic 45272958319](https://github.com/FlareZ123/obfs/actions/runs/45272958319), pinned `f90845c782a30e41a2c6e18f11eb1ea9f751a948`, twelve combinations (COO/SNO/SCO × identifier on/off × string on/off) returned exactly matching numerical outputs, but the six cases with `identifiers:true` had `sourceEqual:false`. Their metrics showed two renamed bindings (the private reader formal plus public wrapper formal); with `identifiers:false`, source equality was true and one private owner key was independently rewritten.

This is a **compatibility counterexample** to exact native source observability, not evidence that the numeric computation is wrong. It also cannot by itself justify claiming strong secrecy from identifier renaming: original and rewritten function source remain accessible to the caller.

## Direct-export proof and implementation

`src/identifiers.js` now recognizes a bounded source-visible syntax grammar of direct exports:

- ESM `export function`, `export default function`, `export const fn = (...) => ...`, direct `export { fn }` by top-level local name, and direct functions nested inside exported object-literal values.
- CommonJS direct `module.exports = function ...`, `module.exports = fn` when `fn` is locally declared, direct `exports.name = fn`, and ordinary function literals inside directly exported object expressions.

For each statically identified public callable AST, candidate identifier binding declarations **inside its exact source span** are preserved, including nested functions or local declarations whose source appears inside the exposed function. The existing lexical, name-inference, TDZ, error-spelling, and dynamic-scope safety gates remain independently active. Identifier renaming elsewhere, including private reader parameters, can still proceed.

This is deliberately a **syntactic direct-export proof**. It does not track arbitrary alias chains, factory-returned callables, import namespace reflection, dynamic `module.exports` mutation, or hostile VM instrumentation. Explicit source-observation contracts still need a larger interprocedural/linker model for those cases; do not generalize the narrow pass to arbitrary output graphs.

## Reproducible evidence

- [Post-guard same 12-configuration diagnostic 45273478242](https://github.com/FlareZ123/obfs/actions/runs/45273478242), pinned `fe2a9624d3586140e6cfccaa280b5b6ed6465ede`: every case has `sourceEqual:true` and `outputEqual:true`; `identifiers:true` still emits one renamed *private* formal and one renamed private owner key. Both Node22 Linux/Windows focused runs and JSDoc checks passed.
- [Eleven exported-source forms 45273604212](https://github.com/FlareZ123/obfs/actions/runs/45273604212), pinned `1fed9bfb0960e48f7d3bac71527646cbfc827580`: named/default ESM functions, CJS direct/aliased/object/property exports, nested private declarations, and a non-exported helper positive control. Every focused test passed Node22 Linux/Windows and strict JSDoc. Exact public function source, name, arity, and values preserved under identifier/string/property passes; a separate private binding remains transformable.
- A hard assertion for all twelve public wrapper source observations was added at `a3b3fcc6730887a6baa5cf0fd3403cda71352e88`; dedicated re-run was dispatched.

## Cost, safety and release boundary

The change removes candidate compile-time edits, not adds runtime interpretation; it cannot by itself increase hot execution cost. Its small compile-time walk is not a whole-program export-flow proof. The final post-guard full two-platform validation is pending. The preceding source-pinned full [45271840246](https://github.com/FlareZ123/obfs/actions/runs/45271840246) **predates this identifier guard** and reports 13 positive property-yield assertion failures per OS (5,398 tests per platform), not any observed public-source mismatch because those users hadn't been probed.

No publication or merge should imply correctness for every exported callable identity or universal 2.5× speed, let alone resistance to static/dynamic reconstruction, host instrumentation, or source extraction. The project stays **RELEASE-BLOCKED**.
