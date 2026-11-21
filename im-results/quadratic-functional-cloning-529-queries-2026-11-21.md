# Public-only functional cloning of 32-bit quadratic functions in 529 chosen queries

**21 November 2026. Agent 50. Classification:** intermediate negative candidate-selection result, standard Boolean ANF interpolation applied to full functional cloning. It is a mathematically exact statement under an explicit degree-two promise, independently reproduced against high-nonlinearity 32-bit permutation families. The interpolation principle itself is classical and **no academic novelty is asserted**.

## General theorem and optimality within this interpolation protocol

Let `F:GF(2)^n -> GF(2)^m` be any deterministic vectorial Boolean function, permutation or otherwise, whose every output coordinate has algebraic normal form (ANF) degree at most two. Its unique expression is

`F(x)=c xor (xor_i x_i * a_i) xor (xor_{i<j} x_i*x_j * b_ij)`,

where `c`, all `a_i`, and all `b_ij` are `m`-bit output vectors. The attacker learns the full exact function from at most

`Q(n)=1+n+binom(n,2)`

chosen public forward-oracle evaluations:

- `c=F(0)`.
- `a_i=F(e_i) xor c`.
- `b_ij=F(e_i xor e_j) xor c xor a_i xor a_j`.

All coefficient vectors are now known **exactly**. Evaluating their ANF expression computes `F(x)` for every one of the `2^n` inputs **without any further oracle access**, even when `F` is bijective, fully output nonlinear, or hidden under invertible affine input/output transformations. The latter transformations preserve algebraic degree at most two.

For **n=32, Q(32)=1+32+496=529** forward calls. This is the exact number of coefficient-determining evaluations for the zero/basis/pair training schedule. The report does not prove a universal lower bound against other training schedules or structural families. A more powerful source-aware attacker may infer a family with fewer queries.

The attack produces a **functionally equivalent complete clone**, not necessarily the original secret, object graph, source text, AST, or internal keys. It is a devastating confidentiality/anti-cloning control for a *fixed stateless quadratic output function* that an adversary can query legitimately 529 times, including server-controlled SCO if those premises genuinely hold. Input-dependent server state, domain-bound authorization, query budgets, rate limits, nonquadratic computation, and unrestricted JavaScript effects fall outside the theorem.

## Why the nonlinear output rank 32 defense fails

Our independent quadratic-radical study [`im-results/quadratic-input-radical-target-inversion-2026-11-21.md`](quadratic-input-radical-target-inversion-2026-11-21.md) constructs a 32-bit bijection from the field-cube permutation `z->z^3` on `GF(2^9)` and 23 independent quadratic high-output masks. It has **maximal output ANF/residual rank `r_out=32`**, no nonzero affine scalar output components, and an affine input radical of dimension23. Arbitrary independently randomized invertible affine input/output matrices hide its triangular form but preserve degree two and rank.

The radical-only inverter, treating the original server as the oracle for every phase, has a valid `Q(32)+23+512+1=1065` public-query upper bound and recovered 40/40 held-out targets in 553–1,013 distinct requests. **The stronger functional-cloning attack improves that to only 529 requests per function, once**, regardless of target count or radical dimension.

Moreover, after learning the 529 coefficients, the attacker can feed the **local offline model** into the earlier radical-coset inversion procedure. All its extra basis and coset evaluations are local model calls, so no further server calls are required for any desired target. The offline inversion still has a `2^d` local-work term and depends on the quadratic permutation structure; mere function cloning requires no inversion at all.

## Runnable independent evidence

- [`sims/quadratic-oracle-functional-clone.js`](../sims/quadratic-oracle-functional-clone.js) is a CJS/JSDoc standalone learner and pure evaluator. `learnQuadraticOracle(oracle,bits)` queries exactly the zero, basis and pair inputs, yielding a **JSON-serializable plain coefficient model**; `evaluateQuadraticModel(model,input)` never retains or invokes the original oracle.
- [`sims/quadratic-functional-clone-peer-check.js`](../sims/quadratic-functional-clone-peer-check.js) independently enumerates all **40,320** width-three permutations, learns their 7-query quadratic models, serializes/deserializes them, then checks all **322,560** possible input/output results exactly. Every three-bit permutation has degree at most two because its nonzero output components are balanced and therefore have vanishing full-degree (degree-three) ANF coefficients.
- The checker generates **eight separate full-output-rank32** functions and eight rank24 functions using the prior source-known randomized construction, with independently drawn invertible affine input and output matrices. It calls each source's simulated protected server exactly **529** times, freezes access to that server, serializes the model, and verifies **1,024 independently sampled held-out inputs per instance**, **8,192 exact results for each rank class** and **16,384/16,384** across both. Its separately coded rank checker recomputes the public quadratic coefficient rank as 32 or 24. Both are full 32-bit permutations.
- For each model, eight held-out targets additionally run through the radical-coset inversion procedure with a **pure local model evaluator as oracle**. This tests **64 additional offline inversions per rank class**, **128/128 total**, after the original protected server has been disabled. Any accidental server use would throw.
- A negative degree-promise control swaps two weight-three inputs of an 8-bit identity permutation. Both distinct functions yield the same **37 zero/basis/pair training answers and exactly equal cloned coefficient models**, while the nonquadratic altered permutation differs at **2/256** truth-table inputs. This proves the sparse transcript cannot certify global quadraticity; a "clone" under a false premise may silently disagree elsewhere.

The executable sample tests a finite number of full-rank 32-bit inputs; the exact all-input functional-cloning guarantee follows from the ANF coefficient identity, without enumerating all `2^32` inputs.

## Source-pinned verification and status

**Source-pinned two-platform proof-of-work:** [manual run 44937676585](https://github.com/FlareZ123/obfs/actions/runs/44937676585), SHA `762238265fa4afa86f79df6f2ee408df4fb61ff3`, passed the **Ubuntu and Windows** functional-clone test, 322,560 exact exhaustive width-three outputs, 16,384 held-out high-rank 32-bit outputs, **128/128 local model-only inversions with the protected server disabled**, the independent radical and matched-query tests, dedicated strict JSDoc and project-wide JSDoc. This is the source pin for every concrete sample count above.

The result should guide the project toward rejecting stateless, low-degree candidate functions even when their output bit-mixing looks complex, their nonlinear output rank is maximal, or they use hidden invertible affine wrappers. The user-defined three-mode obfuscator still **fails the full strong-protection release criteria**. This attack does not establish general source reconstruction, unauthorized host execution, unrestricted JS semantic equivalence, integrity bypass, or the required 2.5× protected-code runtime budget.
