# Source-only property-normalization decoy control (2026-11-16)

**Agent 14. Intermediate adversarial-methodology result.** The delivered code's claimed security is unchanged. This experiment corrects a false-positive measure in an independent hash-label normalizer and pins a stronger semantic negative control.

## Counterexample and repair

The original [independent Acorn-token attacker](../sims/attacker-token-normalize.js) renamed *every* string literal with an obfuscator-shaped spelling, regardless of whether it was a key. A standalone native program defining a hash-shaped object key and separately returning the same spelling as string data changed its output from `[12,"_p0123456789ab"]` to `[12,"plainField0"]`; a payload-only string was incorrectly counted as a recovered property.

The test-only canary commit **`72357fdb0fa8e1afad84a0d38654d0d63effc454`** failed on both Node 22 Ubuntu and Windows in [manual run 43966095012](https://github.com/FlareZ123/obfs/actions/runs/43966095012). The failure was a genuine attacker-rewriter semantic mismatch, not an obfuscator output mismatch.

The corrected independent attacker still works only from the public distributed files, using Acorn and its AST walker. It rewrites identifier hash tokens plus string literals that occur directly as object-property keys or computed member keys; ordinary string data and comments remain unchanged. A preliminary literal-descendant visitor failed because the base AST walker skips noncomputed static keys; [run 43966370525](https://github.com/FlareZ123/obfs/actions/runs/43966370525) retained this failing intermediate. The final scan explicitly visits `Property` and `MemberExpression` containers.

## Pinned independent evaluation

**Green manual-only Linux/Windows run:** [43966807886](https://github.com/FlareZ123/obfs/actions/runs/43966807886), exact branch head **`24d55e4c1cc9d885020e758a32f5bbb213ebeccc`**. It passed all steps on both platforms, including strict JSDoc typechecking, the 30-graph ESM run, a paired independent checker comparison and unrelated bounded hot/cold property-flow gates.

The frozen held-out graph generator now exports a hash-shaped **ordinary string value in each of its 30 entry modules**. This decoy is separate from private property names and remains observable in original, generated and normalized module graph executions. The same fixed 30 cases contain 96 ESM files, 60 candidate private fields and 2 external host API configurations.

| Measure | Ubuntu | Windows |
| --- | ---: | ---: |
| Generated private fields changed | 18/60 | 18/60 |
| Source-only changed labels recognized | 18/18 | 18/18 |
| Irrelevant hash-shaped data strings preserved | 30/30 | 30/30 |
| Original/generated observation matches | 60/60 | 60/60 |
| Original/normalized observation matches | 60/60 | 60/60 |
| One-pass attacker AST time, all graphs | 6.229 ms | 4.978 ms |

The source group totals **10,250 bytes** and the generated group **10,268 bytes**. The attacker timing is a single measured aggregate pass, not a confidence interval, a human reverse-engineering budget, or the protected application's runtime overhead. The 18/60 count measures deliberately constructed field candidates, not percent of total application behavior protected.

## Threat-model interpretation

This strengthens the validity of one **negative security control**: for the *actually transformed* simple cross-module fields, the independent static attacker relabels the generated spellings without originals or compiler seeds, and retains native observable behavior even with non-key string decoys. It does **not** recover the original erased names or prove arbitrary program reconstruction.

The selection is deliberately syntactic. Computed property keys transported through variables, reflective helper calls, host-specific descriptor machinery, hash-like public external identifiers and other dynamic flows can require more analysis or conservative abstention. The current tool is **not a general semantics-preserving decompiler**. Client-controlled COO/SNO outputs remain clonable, and this experiment establishes no runtime tamper resistance, authorized-environment enforcement or universal 2.5× performance guarantee.

### Reproduction

Run `node --test test/attacker-token-normalize.test.js test/heldout-object-flow-attack.test.js` and `node sims/heldout-object-flow-attack.js` after installing dependencies. The manually dispatched `.github/workflows/manual-heldout-attack.yml` also tests both OSes, the independent checker, JSDoc and nearby performance baselines. No per-commit CI was added.
