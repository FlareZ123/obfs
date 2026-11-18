# 2026 mixed Boolean-arithmetic permutation anti-symbolic-execution work

**Captured:** 18 November 2026 by Agent 8. **Use:** external research lead only. None of the paper's protection or performance claims are established for this repository until independently reproduced.

## Primary source

Moxuan Wang, Haiyang Hu, Haohang Qin, Wei Li, Ning Zhang,
"Code obfuscation against symbolic execution with mixed Boolean-arithmetic
permutation", *Journal of Computer Security*, OnlineFirst, 23 September 2026.

- DOI: https://doi.org/10.1177/0926227X261470417
- Publisher page: https://journals.sagepub.com/doi/10.1177/0926227X261470417

The publisher abstract says the construction uses formally proven mixed
Boolean-arithmetic permutations on BA[n], composing polynomial, xor-shift and
cyclic-shift permutations to build nonlinear MBA expressions.

The authors report, for their own native/binary evaluation:

- symbolic-analysis complexity growing enough for tested SMT solvers and
  dynamic symbolic-execution frameworks such as KLEE to exceed a 24-hour
  timeout;
- 0% simplification on parseable instances for the tested SiMBA/GAMBA
  versions, with parser failures on their full sequential expressions;
- a coreutils experiment with 0.40% binary-size overhead and no observable
  runtime penalty;
- performance comparisons against cryptographic alternatives.

These are **paper claims**, not obfs results.

## Relevance to obfs

The current repository has already falsified cheap public affine/XOR
representation masking and several fixed public VM/Wasm/dispatcher grammars.
A genuinely nonlinear, randomized permutation composed around a branch value
could be different: for a bijection P over 32-bit values,

```text
x === c    iff    P(x) === P(c).
```

This gives a mechanically simple semantic proof for equality predicates while
placing a nonlinear public constraint in front of symbolic/static analysis.

The paper is especially relevant because it explicitly targets algebraic
simplification, a failure mode already observed in this repository's
source-only attackers.

## Limits before adoption

The retrieved publisher material is sufficient to identify the research
direction and the authors' reported results, but it is **not sufficient to
reconstruct their exact permutation generator without guessing**. A repo
implementation must first obtain and inspect the actual algorithm/pseudocode
from the paper or author artifacts. Do not invent a construction and attribute
it to the paper.

The reported native/coreutils overhead does not establish the project's
strict JavaScript `<=2.5x` compute requirement. V8 may optimize or penalize
MBA expressions very differently. The paper's solver timeout also does not
cover:

- public-source pattern matching against our exact generator;
- black-box execution in a fully controlled browser/Node runtime;
- dynamic trace simplification;
- LLM-assisted normalization;
- matched ordinary-minified controls;
- the project's semantic source-observer constraints.

## Required local replication

Any obfs pilot based on this work should freeze:

1. the exact cited construction and parameters;
2. a generated JavaScript artifact and native/minified controls;
3. an independent source-only normalizer;
4. a bit-vector SMT/DSE lane with explicit solver versions and timeouts;
5. Node and real-Chromium runtime measurements with strict per-sample 2.5x
   native vetoes;
6. held-out randomized constructions to prevent a one-template benchmark.

Only a result that survives those controls should influence the strong
protection decision.


## Independently source-verified polynomial-permutation baseline

Ronald Rivest's 2001 paper, *Permutation Polynomials Modulo 2^w*
(doi:10.1006/ffta.2000.0282), gives an exact characterization for an integer
polynomial `P(x)=a0+a1*x+...+ad*x^d` to permute modulo `2^w` for
`w>=2`:

- `a1` is odd;
- the sum of the even-degree coefficients `a2+a4+...` is even;
- the sum of the odd-degree coefficients above degree one
  `a3+a5+...` is even.

Publisher abstract:
https://www.sciencedirect.com/science/article/pii/S107157970090282X

Therefore a minimal polynomial such as

```text
P(x) = x + 2*x^2 mod 2^32
```

is independently justified as a 32-bit bijection: `a1=1` is odd,
the even-degree sum is `2`, and the remaining odd-degree sum is zero.

This can be used as a **local negative/performance baseline** for the
JavaScript pilot without claiming it reproduces Wang et al.'s 2026 composite
scheme. A single low-degree polynomial is expected to be far easier to
normalize than the paper's reported composed nonlinear MBA expressions.
