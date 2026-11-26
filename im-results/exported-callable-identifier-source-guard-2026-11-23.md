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

## Immutable alias-chain extension

A direct-name guard is insufficient when a publicly exported callable is first assigned to another private constant or placed in an object-literal value. For example, `function calculate(x){...}; const first=calculate; const second=first; module.exports=second;` exposes the original function source to every caller, yet a single pass over AST nodes can encounter `calculate` before learning that `second` is publicly exported. [Alias-chain red run 45274101468](https://github.com/FlareZ123/obfs/actions/runs/45274101468) at `773e7f8efab94dcbbeb7d90dc71a9e73f7f9c341` reproduces this under CommonJS and ESM syntactic alias chains.

The subsequent `src/identifiers.js` change builds a map of top-level syntactic declarations and resolves the finite set of exported names through a worklist. The worklist admits only directly assigned immutable-looking top-level reference chains and object-literal properties for identifying *additional publicly visible source*. It makes no strong assumption about those values being private or safely transformable: marking more public functions simply declines more source-changing identifier edits. The new [focused run 45274227166](https://github.com/FlareZ123/obfs/actions/runs/45274227166) at `aa6704530d02653344de74521f8fde3b4dcbe28a` checks four CommonJS/ESM alias-chain cases against the original function source. This does not prove arbitrary runtime property exports, spreading, prototype inheritance, or cross-file alias graphs.

## Public callable recovery through opaque/mutable export carriers

The direct/immutable alias grammar remains insufficient for ordinary JS mutation. A [source-pinned adversarial diagnostic 45275086945](https://github.com/FlareZ123/obfs/actions/runs/45275086945) at `824cbcd0f2e3029e13776249cabc914a458c23cb` ran on both Node22 platforms. Four fixtures were numerically equivalent after identifier renaming but **all four changed intrinsic callable source**: mutable top-level alias reassignment, object data-property reassignment before export, object spread carrying a function, and exported object mutation with `Object.assign`. In these cases the previous source-visible binding worklist could not trace the final exposed function body. This is a direct source-contract counterexample, even without attacker modifications.

A conservative fallback now declines **all identifier renaming in a file** when syntax includes a public CJS/ESM export plus any assignment/mutation, `let`/`var` declaration, object spread, or potential `Object.assign` call. This is intentionally broad: it may exclude independent safe private renames in the same source. It is preferable to silently changing an exported function's native source under a proof that only covered immutable direct aliases. The exact implementation at `e5deb69c89bbb01487850e6b00c02cf43aa157bd` and hard four-case native-source equality test at `d2a282f4cd729da237407063df9f553002191e0c` require focused [45275398162](https://github.com/FlareZ123/obfs/actions/runs/45275398162) and full [45275406172](https://github.com/FlareZ123/obfs/actions/runs/45275406172) source-pinned outcomes before integration; do not infer both are green merely because the earlier diagnostic passed.

This fallback does not prove arbitrary dynamic exports safe: getters, Proxy membranes, builder functions, module loaders, reexports, and other opaque alias channels remain research gaps. A separate source-only attacker and source-visible host cannot be excluded by a public countermeasure. The source-preservation proof is **bounded**, and the release status stays **BLOCKED**.

## Full-suite integration is not green

Two prior source-pinned full Linux/Windows runs **before the final mutable-export fallback** are explicitly red: [45273818207](https://github.com/FlareZ123/obfs/actions/runs/45273818207) at `a3b3fcc6730887a6baa5cf0fd3403cda71352e88` ran 5,412 tests/platform and showed **17 failures on each OS**; [45274234781](https://github.com/FlareZ123/obfs/actions/runs/45274234781) at `aa6704530d02653344de74521f8fde3b4dcbe28a` ran 5,416/platform and showed the **same 17 failures**. The previous class/reader-only full [45271840246](https://github.com/FlareZ123/obfs/actions/runs/45271840246) had 13. Four additional positive-yield assertions are new in identifier-source-guard pins: `JSON.parse/JSON.rawJSON` with proven primitive inputs, primitive `Reflect.construct` arguments (two tests), and primitive `RegExp` flags. They demand an obfuscation yield currently refused; investigate their complete native-source contracts before treating the refusal as a compiler defect or relaxing the source guard. The other 13 failures remain as classified in `public-source-contract-vs-yield-2026-11-23.md`. Both full source pins have red CI and should **not** be represented as improvement in overall full-suite pass rate.

The new post-fallback full [45275406172](https://github.com/FlareZ123/obfs/actions/runs/45275406172) at `d2a282f4cd729da237407063df9f553002191e0c` was still running when this paragraph was written. The focused four-opaque-contract regression [45275398162](https://github.com/FlareZ123/obfs/actions/runs/45275398162) at the same pin **passed** on Ubuntu and Windows, including project/external JSDoc. Verify the full before merge and keep draft status.

## Cost, safety and release boundary

The change removes candidate compile-time edits, not adds runtime interpretation; it cannot by itself increase hot execution cost. Its small compile-time walk is not a whole-program export-flow proof. The final post-guard full two-platform validation is pending. The preceding source-pinned full [45271840246](https://github.com/FlareZ123/obfs/actions/runs/45271840246) **predates this identifier guard** and reports 13 positive property-yield assertion failures per OS (5,398 tests per platform), not any observed public-source mismatch because those users hadn't been probed.

No publication or merge should imply correctness for every exported callable identity or universal 2.5× speed, let alone resistance to static/dynamic reconstruction, host instrumentation, or source extraction. The project stays **RELEASE-BLOCKED**.
