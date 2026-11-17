# Nested Array and generic array-like function-source observations

**Agent 2, 2026-11-17 UTC.** Intermediate behavior-preservation result; compile-time source-observation proof.

## Mechanism

Array#join recursively stringifies nested arrays. An array like `[[protectedSum]]` therefore yields the protected function's native source spelling even though its immediate element is another array. This observation matters for body-rewriting schemes such as experimental polyvariant-affine lowering, which preserve arithmetic results while changing function source.

Native Array algorithms are also **generic** over array-like receivers, including plain records with indexed fields and a `length` property. `Array.prototype.join.call({0:protectedSum,length:1})` returns a string containing the function's source; `Array.prototype.sort.call({0:protectedSum,1:'function protectedSum(input){m',length:2})` changes the relative positions of string/function elements depending on function spelling. Indexed function fields added after object creation or reached through aliases carry the same risk.

## Reproduction

`test/array-detached-source-coercion.test.js` contains six source-exposing stringification cases (direct and nested literal arrays, nested-array identifier aliases, directly indexed records, aliases of records, and post-creation indexed assignments), one generic default-sort case with a stable string sentinel, and a positive generic primitive-only sort case. The positive explicitly requires a chosen affine function still to be transformed and native outputs to match.

- **Before generic/nested guard:** [source-coercion workflow 43985923139](https://github.com/FlareZ123/obfs/actions/runs/43985923139), `cf6662b245ef71d00b5c2d969abf4457f41bfdd6`, failed all **7** new negative cases on Ubuntu and Windows Node 22 because the compiler wrongly accepted source-changing transformations. The primitive-only case and 61 previous checks passed.
- **Guard:** `src/ast.js` recursively tracks nested ArrayExpression carriers, bounds recursion conservatively, and distinguishes generic array-like records with indexed function-valued fields, including simple aliases and post-creation indexed assignments. Detached native source-coercing method calls and direct calls now consult this carrier proof. Implementation commits `3d9c6b62f8aef2bcd21969b908a8e746b2654ff7` and `fbd82775bf135b11032557aba438e27b88d5a242`.
- The initial after-fix [43986166774](https://github.com/FlareZ123/obfs/actions/runs/43986166774) passed the generic sorting case but reported six **test-internal regex errors**. Specifically the new `assert.match` expected a literal backslash before a parenthesis instead of a function signature. The runtime native outputs already contained the expected function source. That fixture error was corrected in `802f011e13aad4c835d118d1448107bf19889b08`.
- **After-fix:** [workflow 43986341216](https://github.com/FlareZ123/obfs/actions/runs/43986341216), `802f011e13aad4c835d118d1448107bf19889b08`, passed **69/69 source-observer tests on Ubuntu and Windows**, including the primitive-only positive case and strict JSDoc checking.

## Limits

The analysis is a useful partial proof; dynamically computed indices, arbitrary getters/proxies, imported opaque records, and mutation through unrecognized helper calls are not fully covered. A known carrier may be conservatively retained even after subsequent deletion of the observed function value, reducing protected work. This guard is compile-time only, so emitted runtime overhead is zero; no separate security-hardness claim follows.

See [ECMA-262 Array.prototype.join and sort](https://tc39.es/ecma262/multipage/indexed-collections.html) and the earlier [detached Array method analysis](detached-array-source-coercion-2026-11-17.md).
