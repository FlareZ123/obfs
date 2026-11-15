# Matched main-AST and checker compiler coverage on a held-out ESM corpus

Date: 2026-11-15. Agent 14. Evidence status: intermediate, paired cross-platform simulation.

## Reproduce

Executable comparison: [sims/heldout-compiler-compare.js](../sims/heldout-compiler-compare.js).
Independent source-only token attack: [sims/attacker-token-normalize.js](../sims/attacker-token-normalize.js).
Shared graph generator: [sims/heldout-object-flow-attack.js](../sims/heldout-object-flow-attack.js).
Validation workflow: [manual-heldout-attack.yml](../.github/workflows/manual-heldout-attack.yml).

Pinned source **66ea50b13592624eb40995d9aaa7d0eba4099445**.
Manual [GitHub Actions run 43709932373](https://github.com/FlareZ123/obfs/actions/runs/43709932373) completed successfully on Node.js 22 Ubuntu and Windows, including graph differential execution and JSDoc typechecking.

Two independent compiler implementations receive the **same 30 supplied ESM graphs and fixed seeds**, with 96 source modules and 60 candidate private fields. The main Acorn pipeline uses mode COO, declared closed-world ESM, and disables string/identifier passes to isolate property renaming. The experimental library compiler uses its TypeScript checker to rename properties under the corresponding closedWorld setting. Source code contains an external window.api interface injected by the test runner. Original, main-obfuscated, checker-obfuscated, and checker-output neutralized modules execute through the actual Node ESM loader, separately rooted per graph.

The label-neutralization attacker is a standalone Acorn token consumer and text patcher. It recognizes hash syntaxes of both compilers without importing their proof systems or seeing original names. It is a **deliberately limited source-only attacker**, not a general decompiler.

## Paired observations

| Metric | Main AST | Checker |
|---|---:|---:|
| Graphs attempted | 30 | 30 |
| Candidate private keys | 60 | 60 |
| Private keys actually renamed | 18 | 12 |
| Candidate-field protection coverage | 30% | 20% |
| Graphs with identical fixed native outputs | 30/30 | 30/30 |
| Compile failures | 0 | 0 |
| Runtime failures | 0 | 0 |
| Synthetic hash labels recognized by attacker | 18/18 | 12/12 |
| Attacker-normalized graphs matching native output | 30/30 | 30/30 |

The main pipeline renamed two fields in each of the nine positive graphs. The checker renamed two fields in each of six direct-import or two-reader graphs and left all six fields in three imported-identity forwarding graphs unrenamed. Both implementations conservatively left the seven negative scenario types untouched: opaque/dynamic property access, serialization, reflective own-key observation, foreign reader calls, function-source introspection and dynamic imports.

The checker reports a lower rename count on this narrow sample. This does not establish mainline superiority on real applications; input selection and proof architecture matter. The observation is useful because a stronger-looking type checker can still make fewer safe edits than a more specialized interprocedural proof on some alias structures.

Neither compiler's hash identifiers defeated the independent source-only token renamer. All tested checker outputs remained valid and behavior-preserving after the attacker replaced synthetic key spellings with neutral labels. This is syntactic deobfuscation, not recovery of original spelling or complete native algorithm.

## Evidence boundaries

All 30 cases are finite deterministic fixtures, compared on a fixed output observation per graph. The negative scenarios test conservative refusal and preserve behavior under the supplied external API, not arbitrary hostile browser execution or reflective probes. String encoding, identifier renaming, Node SNO bootstrapping, SCO server authorization and live browsers were not exercised. No hot-path or cold-start 2.5x runtime comparison was measured. The reported percentage is the fraction of deliberately introduced candidate fields renamed, not a percentage of real-world program complexity hidden.

## Next decision

Keep the two compilers as independent comparison baselines. Before promoting additional key-flow capability, require the new implementation to preserve every sampled refusal reason and generate more protected keys on withheld realistic modules. Require a source-only attacker to fail, or demonstrate a measured meaningful attack cost increase, before claiming better reverse-engineering resistance. Separately measure steady-state and startup cost against 2.5x for any runtime technique.
