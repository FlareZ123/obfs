# Public CommonJS callable source observes renamed private field spellings

**Status:** source-pinned falsification of existing local literal-value owner proof. The engineering fix is not yet validated. 22 November 2026.

## Reproducer

```js
const owner={secretField:17,otherField:5};
module.exports=function publicReader(){return owner.secretField;};
```

A CommonJS consumer has access to `require('./entry.cjs').toString()`. The original code returns a string containing `owner.secretField`. The current local property proof sees a private literal owner used through a known member expression and rewrites both the object key and function's member spelling. The public function's source changes even though its return value remains 17. This violates the project's requested 1:1 observable behavior.

The original `proveLocalObject` verification tracks the **owner's** escapes, but a function **capturing** the owner can independently escape via `module.exports`, `exports.read`, or an exported object method. A source observer can inspect the function body without holding an alias to the owner.

## Cross-platform red evidence

The [source-pinned red GitHub Actions 44974874396](https://github.com/FlareZ123/obfs/actions/runs/44974874396), exact source commit `3956b99f3c392432cab63bfd3a60a67ae20ceb59`, failed **11 of 12** differential tests on both Ubuntu and Windows. All eleven public callable shapes unexpectedly admitted one private-owner rename despite source observability; the direct scalar read positive control passed. Reproductions cover:

- direct exported function declaration, function expression, and arrow
- exported function binding aliases
- direct and indirect object methods, arrow properties, object aliases and shorthand fields
- `exports.read` and `module.exports.read`
- nested returned callable bodies within a public method

Run `test/commonjs-public-callable-source.test.js` to compare native and emitted Node VM module exports, including both function outputs and the exact `Function.prototype.toString()` result. This is an exact semantic mismatch, independent of attacker extraction of VM payloads or deobfuscation strength.

## Required repair boundary

The source edits in `renameLocalProperties` include object keys plus member reads, destructuring patterns, own-key `in` checks and bounded reflective literals. If any transformed read is contained in a callable, soundness requires an independent proof that the callable's **source** is unobservable to arbitrary module consumers. A conservative method is to admit only uniquely bound, nonexported function declarations or const functions where every reference is a direct call within the same proven lexical scope; all anonymous or otherwise escaping function bodies decline. Nested callables require every surrounding function body to be unobservable as well.

Applying a blanket block to all function bodies restores soundness but sacrifices legitimate private hot-path renaming. A bounded direct-call-only function proof offers a stronger protection/coverage tradeoff. Existing `collectProofInventory`, `collectBindingScopes` and per-function reference inventories can be reused to avoid quadratic ad hoc scans.

This issue is broader than the new earlier primitive `const` initializer extension in PR #253, which has a dedicated, deliberately conservative source-callable guard. The present test corpus starts from the previously accepted literal-valued owner path and thus reproduces a pre-existing vulnerability. Do not promote this report to an established repaired result until source-pinned red/green and complete Linux/Windows regressions have passed.
