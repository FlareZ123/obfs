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

## Exact affine-residual-rank control (22 November extension)

The same six **binary functions** are defined on `GF(2)^64 -> GF(2)^32` using two signed Int32 inputs and one output. Define the cross-input second difference at unit-vector inputs

```text
B_o(a,b) = F_o(a,b) xor F_o(a,0) xor F_o(0,b) xor F_o(0,0).
```

For `i=0,...,31`, take `a=b=2^i` except for multiplication, which takes `a=1,b=2^i`. These 32 chosen vectors provide exact GF(2) rank certificates:

| Original binary operator | Exact nonlinear residual output rank | Reason for rank |
| --- | ---: | --- |
| add | **31** | Mixed residuals are `2^(i+1)` for `i<31`, zero for `i=31`; output bit 0 is affine |
| sub | **31** | Mixed residuals have every bit above `i` set, zero at `i=31`; distinct least-set-bit pivots from 1 through 31, while bit 0 is affine |
| mul | **32** | `1*2^i` supplies each independent output bit `i` |
| and | **32** | `2^i & 2^i` supplies output bit `i` |
| or | **32** | The three contributions at equal input bit `i` XOR to output bit `i` |
| xor | **0** | XOR is exactly affine over GF(2) |

The bounds are **exact**: a 32-bit output cannot have rank above 32; addition/subtraction have no nonlinear residual in bit 0, and XOR has none in any bit. The table applies to the entire two-word input domain, not a sampled low-dimensional slice. The independent calculations in `sims/a2mba-opcode-residual-rank.js` and `test/a2mba-opcode-residual-rank.test.js` implement the 32 witnesses and signed top-bit wraparound cases.

**Consequence:** three exposed operations (multiply, bitwise AND, bitwise OR) have maximal nonlinear output rank 32 yet their original opcode is still identified by **one black-box query (2,3)**. The source/encoding can be arbitrarily convoluted while preserving that isolated semantic boundary; the one-query fingerprint remains invariant. This extends the [full-rank rotated-core static-recovery negative control](a2mba-rotated-core-affine-rank-screen-2026-11-22.md) to a *dynamic* classification example. It supplies no inference about fused/hidden internal sites without a callable two-operand boundary.

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

## 22 November source-coincident full-rank and one-query offline-clone extension

The standalone six-operation rank screen above establishes the exact structural ranks of each native operation. A more decisive next test computes the same finite-difference witnesses on the **actual 96 held-out generated obfuscated expressions**, while using the **original frozen classifier** (`a529fb903a2116efe1c195ea9a2c181769711686`) for the adversary's single query. The generator state, seed, 96-case operation order, source construction and intervening `stream.word()` calls are identical to the existing `runHeldout()` source population. It **does not** pick cases after seeing the result.

The experiment `sims/a2mba-opcode-heldout-rank-clone.js` measures 32 cross-input second differences per emitted function and row-reduces their GF(2) output directions. Its independent verifier checks that the measured rank equals the expected exact rank and that the source-only black-box classifier correctly determines the operation in exactly **one candidate call**. Once the single query completes, it creates a native substitute from the returned opcode without reading or executing more of the protected function as the attacker. The verifier subsequently checks **256 held-out Int32 input pairs per source** against the original published expression. All checks pass on all **96** generated sources; **48/96** have maximal nonlinear output rank **32**, while the single-query offline clone recovers all **96/96**.

**Independent source-pinned gates:**

- [Attacker-normalizer run 45063173616](https://github.com/FlareZ123/obfs/actions/runs/45063173616) at source `ef1ea6c565b43e94e6b64bca50a780ecfce6779f`: the initial native six-opcode exact-rank test, existing post-freeze single-query classifier, and strict main/external JSDoc passed on Ubuntu and Windows.
- [Focused two-platform run 45063590958](https://github.com/FlareZ123/obfs/actions/runs/45063590958) at source `438d81fafbdaa38898372e326b7b1be4b4de5285`: the new **same-emitted-source 96-case rank-and-clone regression** passed on Ubuntu and Windows with the focused runner's strict JSDoc checks.

These are **finite-source-family dynamic recoveries** at a callable binary boundary; the 32 finite differences belong solely to the independent structural verifier and are not attacker-query costs. The **attacker query budget remains one query per case**. A larger fused application may hide this exact callable boundary, and this experiment supplies no bound on arbitrary programs or inaccessible state.

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
