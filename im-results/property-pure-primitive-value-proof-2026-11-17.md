# Pure primitive initializer property proof: expanded positive transform coverage

**Date:** 2026-11-17. **Status:** experimental compatibility and transformed-work-yield change, with no stronger security claim than conventional minification.

## Problem and direct mechanism

The conservative local private-record and closed-ESM property renamers previously required each source-defined object field value to be a literal or a recursively inert literal array/object. Consequently, an otherwise private owned object such as `const state={hotScore:21-14,hotWeight:(5<<2)-7};` was left with original field labels even when every direct, forwarded, imported, destructured, and reflective usage was already proven by existing ownership analysis.

The new `src/properties.js:isPrimitiveConstantExpression` permits immutable primitive-only arithmetic, relational, equality, bitwise, logical, conditional, sequence and untagged-template AST expressions as inert field initializers. The compiler retains the **original initializer expressions and their evaluation order**, rewriting only proven owner-key definitions and reads. The same proof is consumed by local ordinary property rename, opt-in private Symbol-key lowering, and the closed-world exported-const ESM property transformer. The original program's side effects, host imports and owner-escape proof are unchanged.

The opt-in syntax is intentionally narrow. Identifier reads, calls, object construction with effects, assignment/update, dynamic reflection, tagged templates, and RegExp coerced through arithmetic remain outside the admission grammar. Composed BigInt expressions are refused even when syntactically constant because mixed BigInt/Number operations and BigInt zero-divisors can throw. If an exception is caught and its stack inspected, changing an earlier property key's emitted width can alter the source-referenced column. Direct BigInt literal field values remain at their original previously accepted proof boundary.

This removes one unnecessary refusal for pure mathematical object initialization without assuming that source-level private-key renaming itself makes the program difficult to reconstruct. A distributed COO attacker still obtains all JS and can observe the replacement labels.

## Positive and negative evidence

The focused [test/property-pure-value-expression.test.js](../test/property-pure-value-expression.test.js) compares original and generated CommonJS behavior for arithmetic/bitwise/boolean/relational constants, nullish and conditional composition, untagged interpolated templates, nested inert arrays and objects, the private Symbol backend, and a real two-module ESM exported-object caller. It demands actual renamed owners/fields in positive cases.

Negative tests reject caller-dependent arithmetic, mutable globals, function invocation, assignment, tagged templates, and throwing BigInt syntax, with source-preservation checks for exceptions observable through `Error.stack`. Existing [ownership and inherited getter safety regressions](../test/property-proof-safety.test.js) and [recursive array literal behavior tests](../test/array-property-values.test.js) run together with the change.

The extended [cross-file ESM profile](../sims/property-hotpath-closedworld.js) accepts `--pure-expressions`. It generates three independently exercised property-flow patterns: direct imported reads, an imported read-only function consumer, and an imported immutable identity forwarding function. All have the actual original expressions `(21-14)` and `(5<<2)-7`, retain native computed values 7 and 13, demand two renamed fields, compare six distinct original-versus-compiled hot function outputs, measure repeated real function calls, and separately report module-import startup versus warmed calls. [The companion test](../test/property-pure-expression-hotpath.test.js) checks all three patterns. It is a positive **protected executed work** witness, while its time measurements are scoped performance observations with no universal 2.5x guarantee.

## Security boundary and validation

The proof is intentionally syntactic and composes with existing strict cross-file ownership restrictions. It does not certify attacker-cost improvement over esbuild minification, execution authorization under a hostile browser, or general JavaScript observational equivalence. Source- and stack-introspection, prototype reflection, native globals, dynamic keys and escaping objects can still require refusing other programs.

Independent cross-platform validation is represented by the exact GitHub Actions source pin below, not by an isolated local simulation. Validation runs may contain unrelated failures; a focused passing step is never mislabeled a complete release-green gate.

**CI status:** Exact source and Linux/Windows results pending final run.
