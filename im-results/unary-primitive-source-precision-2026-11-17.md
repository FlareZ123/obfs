# Source-closure precision for unary primitive-producing operations

**Agent 2; 2026-11-17 UTC.** Intermediate semantic-compatibility and retained-obfuscation-work finding.

## Issue

The compiler's `observesFunctionSource` closure uses `isDefinitelyPrimitive` to distinguish operations that may ToPrimitive-coerce a function into its exact source text. Before this change its `UnaryExpression` case demanded a primitive operand even for `typeof`, `void`, and logical `!`. Those operations produce a primitive and **do not invoke user-defined ToPrimitive on an object/function operand**. They can evaluate subexpressions with independent side effects, which remain inspected separately by the AST walk.

Consequently `(typeof protectedSum)+"!"` was conservatively classified as a function source observer. The explicit native polyvariant-affine transformation of `protectedSum` was refused despite the final observable result depending only on the function's type. `(void protectedSum)+"!"`, `(!protectedSum)+"!"`, alias `typeof`, and primitive locals used in concatenation exhibited the same unnecessary refusal.

## Repair and controls

`src/ast.js` now marks `typeof`, `void`, and `!` unary expressions definitely primitive without demanding a primitive argument. For numeric unary operators `+`, `-`, and `~`, whose ToNumeric/ToPrimitive behavior can invoke user methods, the existing operand requirement remains.

`test/unary-primitive-source-precision.test.js` covers five positive real polyvariant transforms (including alias and a sequence of primitive locals), and two negative controls on directly source-coercing `"source:"+protectedSum` and `String(protectedSum)`. The post-fix controls verify that observably source-dependent cases are still refused.

- **Red prior to fix:** [workflow 43984966693](https://github.com/FlareZ123/obfs/actions/runs/43984966693) at `646312419fb702e3920744c93e64d1f6f53989ea` reported **5 failures out of 37 tests on both Ubuntu and Windows Node 22**. Each new positive case was rejected with `Polyvariant affine declined 1 selected function(s)`.
- **Implementation:** `e051f027a7504f927d87971c3665a5cbeb5962f4`.
- **Green after fix:** [workflow 43985108390](https://github.com/FlareZ123/obfs/actions/runs/43985108390) at `e051f027a7504f927d87971c3665a5cbeb5962f4` passed Ubuntu and Windows targeted unary, coercer, and method source tests plus strict JSDoc. The workflow also preserves rejection of direct source-observation cases.

The change improves the compiler's selective ability to transform source-unobserved code; it makes no measured claims about attacker reconstruction time or runtime microbenchmarks. Its compile-time primitive proof remains conservative for general calls returning known intrinsic primitives unless their exact provenance can be proven.

## Dependency

The patch relies only on ECMAScript unary operator semantics (see [ECMA-262 unary operators](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-unary-operators)). It is independent of cross-file owner renaming and of the separate [Array implicit sorting source-observer safety repair](array-function-source-sort-coercion-2026-11-16.md). Those two improvements serve complementary purposes: refuse demonstrably source-sensitive transformations, and allow proved source-independent ones.
