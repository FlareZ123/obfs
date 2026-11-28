# Private-owner provenance through inert comma expressions

**Status:** intermediate, source-pinned obfuscation-yield research; **date:** 28 November 2026; **Agent 7**. This is not a security breakthrough or an established release-level finding. The canonical release decision remains **RELEASE-BLOCKED**.

## Problem and bounded hypothesis

The local object-ownership proof in `src/properties.js` conservatively refused even a private alias initialized by a JavaScript comma expression whose discarded operand is inert, e.g.:

```js
const owner={privateKey:17,otherKey:5};
const alias=(0,owner);
module.exports=[alias.privateKey,alias.otherKey+3];
```

ECMAScript evaluates the discarded numeric `0` and returns the *same object reference* as the last expression `owner`. That evaluation neither passes the object to foreign code nor exposes its keys. If all subsequent aliases, direct helper calls and property reads satisfy the existing local no-escape/no-reflection/source proof, the original owner fields should be eligible for consistent renaming without changing the executable control flow.

The intended optimization is *strictly additive*: retain the current AST grammar and proof vetoes for side-effecting discarded expressions, foreign receiver calls, captured/exported function source, reflection, dynamic keys, unknown native observers and error-message source spelling.

## Independent red-first evidence

Source pin `7a55c630302e953499c1bf9dc237b18c1d563a24` is a **test-only** branch from current main, before the proof change: [focused run 46144511023](https://github.com/FlareZ123/obfs/actions/runs/46144511023). Ubuntu reported two positive-yield regressions (single-file owner aliases and private source inside a three-module ESM fixture), `metrics.properties=0` where two private property rewrites were requested. All five side-effect/escape negatives passed. The red record is an opportunity for greater *safe transformation coverage*, **not** evidence that its original and emitted values differ at runtime.

Candidate `agent7/private-sequence-owner-20261128`, first proof commit `1e9fd1b05b3815d244226f19c08436f155454345`: the [focused two-platform run 46144544374](https://github.com/FlareZ123/obfs/actions/runs/46144544374) passed the single-file positive **and** all negatives on both Ubuntu and Windows, but failed a three-module *positive-yield assertion*: its fixture exported a function `value()` whose source remained observable. Refusal in that case is intentional and correct; the test incorrectly demanded a rewrite. The repaired fixture exports only a primitive `value`, not an externally observable callable, on commit `aa02189fcd52528ddc8b8bd9f9ae94bf3da49e68`; revalidation is pending. This diagnostic is not a runtime mismatch.

## Candidate algorithm

The patch adds `inertSequenceValue`: recognize a `SequenceExpression` only when every discarded expression is a proven inert primitive, and return the final AST expression for the owner-provenance dependency. The grammar reuses the existing `isPrimitiveConstantExpression` proof (pure numeric/string/boolean arithmetic, unconditional primitive operands, conditional/logical expressions, templates, and harmless unary operators). Standalone BigInt literals are admitted; potentially throwing or exorbitant BigInt arithmetic, native calls and arbitrary computed code are not. No prefix is folded or executed at compile time.

Candidate aliases remain top-level/local immutable const references. The existing least-fixed-point owner graph connects the original literal, a comma-expression alias, chains of aliases and proven direct helper-call formals. A terminal identifier inside an inert sequence is admitted as an owner use only when its *whole sequence value* is assigned to a proven immutable const alias or passed to a verified direct-call helper formal with a tracked owner. All other uses decline.

The emitted `(0,owner)` expression is **not removed or reordered**. Only private field-definition and read spellings are consistently renamed; no VM, decoder or extra runtime work is added. This should be profiled as a finite workload, not asserted as a universal 1.0× compute bound.

## Reproduction and acceptance gates

- Source under review: `src/properties.js` on branch `agent7/private-sequence-owner-20261128`; tests `test/agent7-private-inert-sequence-owner.test.js` and `test/agent7-private-inert-sequence-fuzz.test.js`.
- Run each test in Node 22 on Windows and Ubuntu with `npm ci --ignore-scripts` and `node --test <testfile>`. Both focused workflow jobs also run the strict JSDoc checks.
- Single-file positive: two renamed private own keys, changed emitted spelling, identical original/emitted JSON values in COO/SCO/SNO.
- Interprocedural positive: immutable parameter read of the owner supplied by `reader((0,owner))`, and an identity-return forwarder, each with two rewritten private keys.
- Three-module ESM positive: native Node module import graph, primitive public result, same stdout after transform, two private field renames.
- Negative matrix: side-effectful discarded operands, escaped owner, reflection, unknown dynamic key, owner-exported value, failed-callee/iteration TypeError source message, mutable alias and invalid BigInt division retain original key names.
- Seeded differential: 288 positive and 180 adversarial cases, deterministic 32-bit xorshift PRNG seed `0x725164ab`, with exact native/emitted output comparisons and rewrite-yield assertions, sourced in the test code.
- **Not yet accepted**: these exact final candidate sources require all focused tests/JSDoc and a full source-pinned integration run; the baseline full suite has known unrelated rewrite-yield failures. No evidence here meets the broader static/dynamic extraction, tamper resistance, authorized environment or overall 2.5× compute budget goals.

## Threat and interpretation limits

An attacker with supplied JS can generally rename generated hashed fields or instrument the runtime; the transformation does not provide confidentiality or guaranteed integrity. A syntactically sound proof may increase property-obfuscation coverage without proving increased attacker work. The intended scientific contribution is a small, reproducible graph-provenance optimization with explicit false-safe/false-refusal tests; it belongs in `im-results/` unless validated and synthesized into stronger evidence.
