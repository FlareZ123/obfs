# Intermediate result: one-query semantic fingerprint for A²MBA PureIR binary sites

**Date:** 2026-11-19  
**Status:** intermediate adversarial result. This is a bounded dynamic-classification result for isolated exact binary-operation sites. It does not claim recovery of arbitrary fused JavaScript regions.

## External design boundary

The external implementation is pinned to `xqzme69/A2MBA-LLVM@f22cafe972989f868b2898ac4839df27fb74fc61`.

Its hybrid planner maps exactly six eligible binary operations into the PureIR search domain:

- add
- sub
- mul
- and
- or
- xor

`HybridCore::makeSeed` starts from the selected binary operation, e-graph search produces an equivalent candidate, and `emitIR` emits the selected DAG from integer add/sub/mul/and/or/xor/not/neg nodes. Context and nonlinear layers are identities around the same result. Therefore an isolated protected site must return the same fixed-width result as the original operation for every input pair.

## One-query fingerprint

For signed Int32 observation, the single probe `(left,right)=(2,3)` distinguishes all six operations:

| original operation | exact Int32 result |
| --- | ---: |
| add | 5 |
| sub | -1 |
| mul | 6 |
| and | 2 |
| or | 3 |
| xor | 1 |

All six outputs are distinct. No algebraic simplification or source recognition is required once an attacker can execute the isolated two-input site. The same small-input distinction also holds for the external i64 domain because none of these six results approaches the fixed-width boundary.

The frozen attacker is `sims/a2mba-hybrid-opcode-classifier.js`, commit `a529fb903a2116efe1c195ea9a2c181769711686`. It performs exactly one candidate call and maps the result to the corresponding original opcode.

## Post-freeze held-out corpus

The held-out generator was committed only after the attacker freeze:

- `sims/a2mba-hybrid-opcode-heldout.js`
- fixed seed `heldout-after-a529fb9:2026-11-19:agent38:a2mba-hybrid-opcode:v1`
- 96 cases, 16 for each original opcode
- randomized function and parameter identifiers
- alternate MBA identities for add/and/or/xor
- sign and operand variants for multiplication
- randomized inert algebraic wrappers and commutative spelling
- 256 additional semantic samples per generated case

The regression `test/a2mba-hybrid-opcode-heldout.test.js` also counts candidate executions and requires exactly one attacker call per held-out case.

Manual attacker-normalizer run [44449438588](https://github.com/FlareZ123/obfs/actions/runs/44449438588) passed on both `ubuntu-latest` and `windows-latest` at exact source `d20bb58e77b10ed92421883528e8a3b7c46cb162`. The result was **96/96 exact opcode recoveries** and **96 total attacker calls** on each operating system. Main and external strict JSDoc checks also passed.

An earlier run, 44449090982, already passed the behavioral recovery on both platforms. Its Ubuntu job later failed external JSDoc because the held-out harness had two untyped callback parameters. Commit `d20bb58e77b10ed92421883528e8a3b7c46cb162` added only the callback type annotation before the successful rerun.

## Security interpretation

This attack targets dynamic operation secrecy at an exposed binary site. It does not need the random seed, constants, rewrite history, or surface AST shape. Additional exact identity layers do not change the six output fingerprints.

A JavaScript adaptation can avoid this exact attack only by removing the isolated two-input site boundary from the attacker's usable interface, for example by fusing several semantic operations with context or state so the queried unit no longer has the six-operation contract. Such a fused construction would need its own frozen attacker and strict runtime evaluation.

The result does not prove that arbitrary inlined source exposes a recoverable site boundary. It also does not reconstruct the internal MBA expression. It establishes that once the PureIR replacement is separately callable or otherwise instrumentable as its original two-operand site, the original opcode carries only a one-query semantic fingerprint.

## Decision

Do not assign dynamic-analysis resistance to isolated per-operation PureIR MBA expansion in the current threat models. A future A²MBA-derived candidate should materially change the semantic query boundary before spending additional runtime budget on deeper rewrite search.

## Reproduction

```text
node --test test/a2mba-hybrid-opcode-heldout.test.js
node sims/a2mba-hybrid-opcode-heldout.js
```
