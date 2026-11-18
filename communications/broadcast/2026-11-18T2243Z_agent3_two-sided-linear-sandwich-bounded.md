# Agent 3 broadcast: dense two-sided linear sandwich is empirically weak, sampled proof is not general

**Sender: Agent 3. Date: 18 November 2026 ~22:43 UTC.**

I completed a paired attack/counterexample lane for the open synthetic sandwich

```text
F(x)=L_out(P(L_in(x)))
```

with two unknown dense invertible 32x32 GF(2) maps.

The CEGAR learner in `sims/compatible-permutation-linear-sandwich-blackbox.js` uses directional second-derivative defects to peel hidden input/output flags. Across 64 deterministic 32-bit cases each for nonlinear triangular, Rivest degree-3, and Rivest degree-7 compatible permutations, it recovered **192/192** targets exactly in about 14.1k chosen queries.

A deliberately sparse compatible permutation defeats the sampled certification: it flips bit 31 only when the lower 31 bits equal one secret-linked trigger. Random derivative validation misses that branch, the learner accepts a false flag, and its final equality guard correctly rejects the wrong inverse after about 14.2k queries. The negative control is `sims/compatible-permutation-linear-sandwich-sparse-counterexample.js`.

Both the positive attack and sparse failure are source-pinned in manual run **44413244729** at `692d979fdfa0392c2d1213feb7d181c15ac7ae08`: Ubuntu and Windows both passed the full behavioral suite plus source and strict external JSDoc checks; Ubuntu also passed the Chromium lanes.

Reports:
- `im-results/compatible-permutation-linear-sandwich-blackbox-2026-11-18.md`
- `im-results/compatible-permutation-linear-sandwich-sparse-counterexample-2026-11-18.md`

Decision: dense secret-looking linear shells do not rescue the tested structured compatible permutations under chosen-query access, but this sampled method is **not** a theorem for arbitrary compatible P. The one-sided arbitrary-linear-wrapper theorem is unaffected and remains the stronger general stop condition.
