# Independent static attacker: ObjectPattern literal-key normalization gap

**Agent 2, 2026-11-17 UTC.** Intermediate reproducible attack-harness reliability finding. This is a repair of the evaluation instrument rather than evidence that the defended compiler is stronger or weaker.

## Problem and threat-model relevance

A source-only attacker can normalize recognizable hash-shaped identifiers and key literals without compiler internals. The repository's independent `sims/attacker-token-normalize.js` traverses Acorn tokens, uses `acorn-walk.simple` to identify property-position string literals, and normalizes only those positions. It preserves unrelated data strings.

`acorn-walk.simple` dispatches `Property` callbacks for plain `ObjectExpression` property definitions, but **ObjectPattern destructuring entries are not dispatched as `Property` callbacks**. A fixture with a string-quoted generated key in an ESM owner and a corresponding string-quoted destructuring key in an ESM consumer would normalize the owner's key but leave the consumer's key unchanged.

For example, native code `const {"_p867a184d8e13":first}=shared` where the owner has that key worked. The old attacker changed the owner to `{"plainField0":17}`, leaving the consumer `{"_p867a184d8e13":first}`; it then returned `undefined` and could produce `NaN`. That failed attack was previously reported as a source-normalization failure in the full suite. A native-vs-compiler mismatch was **not** established: preceding differential assertions of the compiler-emitted ESM graph were green.

## Reproduction and fix

- [Red before fix, full suite run 43982671638](https://github.com/FlareZ123/obfs/actions/runs/43982671638) at `f4adee7b6b285988b2f77332e8ec3d1efa60f74e`: `test/destructuring-assignment-flow.test.js:189` normalized ESM output `,5` vs native `17,5`; `test/factory-flow-grid.test.js:158` normalized `NaN` vs native `44`. Direct transformed output had already matched native at lines 183 and 150 respectively.
- [Isolated red, run 43983707592](https://github.com/FlareZ123/obfs/actions/runs/43983707592), `372b5fec9c40bc89a6efd964e4da591e80f3b9c1`: two direct ESM cases failed across Linux and Windows. The logged before/after strings expose the different owner and consumer key spellings.
- **Attacker repair:** `sims/attacker-token-normalize.js` now explicitly traverses `ObjectPattern.properties` to collect string literal `Property.key` token starts. The existing global spelling map then rewrites owner and all consumer occurrences consistently. Implementation `bea53f07ad67c44156b8bc7dd44cfae447bfd9bb`.
- Added `test/attacker-normalizer-destructure.test.js` with native/generated/attacker-normalized real ESM process parity, and `test/attacker-token-normalize.test.js` cases covering assignment patterns, declaration patterns, nested patterns, and unrelated hash-shaped string data.
- The first after-fix trial [43983952368](https://github.com/FlareZ123/obfs/actions/runs/43983952368) passed the declaration-pattern differential and 7 other tests. One new assignment case had mistakenly placed its array literal directly in a `.join` callee, independently triggering the compiler's conservative failed-callee source-observation guard; it was corrected to the previously validated binding form `const displayed=[...];console.log(displayed.join(...))` in `d17f429ae35868d6717c6654d7a3a6eede4a59e6`.
- **Green after fix:** [CI run 43984287872](https://github.com/FlareZ123/obfs/actions/runs/43984287872), exact `d17f429ae35868d6717c6654d7a3a6eede4a59e6`, passed **9/9 tests on Ubuntu and Windows Node 22** plus strict JSDoc checking.

## Scope and limitations

The normalization attack remains strictly syntax-based and independent of the obfuscator's internal owner proofs. It handles hashed string keys used in object definitions, static accesses, and now destructuring patterns; it does not symbolically execute code, trace dynamic key construction, decrypt private data, or infer erased original semantics. It is meant to test how little effort suffices to remove a visible obfuscation surface. The ability to normalize a field spelling is not evidence of recovering its original name.

The repair makes previously broken attacker programs run correctly, removing a source of false negative attack results. Future static hardening evaluations should pin this attacker and preserve native parity of its normalized output.

Related full-suite failures at the same earlier pin included an invalid string-recovery positive fixture and overconservative inert-clone positive fixture, handled separately. Do not aggregate all four failures into a compiler correctness percentage.
