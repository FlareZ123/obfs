# Rank-five top-quintic learner over live SCO HTTP: measured comparison is negative

**Agent 50 — 24 November 2026. Intermediate attack-side evidence only.**  
**Run:** [45457579611](https://github.com/FlareZ123/obfs/actions/runs/45457579611)  
**Source pin:** `39f7c08259f0a6088fb0faeaeb40ca0e2fbf37cc`  
**Source SHA-256:** `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`

## Executive result

The validated top-quintic learner correctly reconstructed the frozen rank-five private function over both authenticated SCO HTTP and an equal-trust native Node HTTP control. It passed its source-promise checks, 726 independent postfit samples, and 1,024 held-out evaluations after server shutdown. However, the preregistered efficiency hypothesis was **falsified**: the existing projected-affine learner used only 1,936–1,968 queries, while the top-quintic learner used 43,261.

| Platform | Existing projected-affine baseline | Top-quintic validated learner | Top-quintic / baseline |
| --- | ---: | ---: | ---: |
| Ubuntu | 1,968 | 43,261 | 21.98× |
| Windows | 1,936 | 43,261 | 22.35× |

Within each platform, the SCO and native arms returned identical query counts and transcript hashes for each learner. The two operating systems used independent random tapes, so their transcript hashes differ.

The manual workflow's two jobs are **RED solely at the final query-comparison assertion** `next.sco.queries < baseline.sco.queries`. Syntax checks, strict JSDoc, the baseline execution, and the top-quintic execution all completed successfully on both platforms. The failed assertion is the correct outcome for the stated comparison; it is not an implementation or reconstruction failure.

## Frozen source and promise

The experiment reused `privateSource()` from `sims/sco-rankfive-arbitrary-table-real-http.js`, without changing the private source, HTTP endpoint, method route, credential, authorization rules, or JSON request/response format.

The private function has the form
[
F(x)=L(x)oplus h(Px),
]
where (L) is affine, (P:mathbb F_2^{32}	omathbb F_2^5) is the parity projection defined by five masks, and (h) is an arbitrary 32-entry vector table. The five mask rows have GF(2) rank five. The XOR of the 32 table entries, including the exact final `table[31] ^= 0x9765c3af` adjustment, is `0xb1f2257d
e0`. Therefore the degree-five homogeneous component is the nonzero pullback of the five-variable top monomial through (P); its joint radical is (ker P), of codimension five. The affine term does not affect the fifth derivative.

The source-promise checker in `sims/sco-rankfive-top-quintic-real-http.js` and an independent recomputation both returned:
- mask rank: 5;
- top ANF coefficient: `0xb1f2257d`;
- fixed deterministic degree: 5;
- joint-radical codimension: 5.

The source hash was identical in all four SCO/native executions and both learner variants.

## Top-quintic measurements

On both platforms:
- witness draws: 12 (two six-direction trials);
- fast-path queries: 42,535;
- postfit verification: 726/726 independent samples;
- distinct authenticated queries including verification: 43,261;
- degree: 5;
- quotient rank: 5;
- fallback: not used;
- reported false-acceptance bound: (10^{-10});
- SCO and native transcript hashes: identical within each platform;
- held-out parity after server shutdown: 1,024/1,024;
- unauthenticated request: HTTP 403;
- private implementation names in the published facade: absent;
- private executions: exactly equal to distinct oracle queries.

The fast-path query count is consistent with the generic learner's accounting: 41,449 weight-at-most-four basis values, 126 new six-cube values across two witness trials, and 960 signature values, with no cache overlap. The 726 postfit draws are independent of the witness tape. For a fixed deterministic degree-at-most-five function, any incorrect candidate differs on at least a (1/32) fraction of inputs by the (RM(5,32)) minimum-distance bound. Thus
[
(31/32)^{726}approx9.7657468774	imes10^{-11}<10^{-10}.
]
The guarantee is conditional on the fixed degree-at-most-five oracle and independent uniform postfit draws.

## Why the proposed efficiency comparison failed

The original rationale compared the new learner's 44,836 verified worst-case cap with the existing projected-affine learner's 72,688 worst-case cap, suggesting a 38.3% cap reduction. That is not the relevant same-source comparison: it contrasts two worst-case caps and ignores the baseline's actual measured query count.

The existing `learnProjectedAffineOracle(oracle,32,5,...)` in `sims/projected-affine-coset-profile-clone.js` exploits the narrower structure (F(x)=L(x)oplus h(Px)) with a known rank-five projection. On this exact source it reconstructed the function in 1,936–1,968 queries. The generic top-quintic learner instead recovers arbitrary lower-degree ANF terms over the full 32-bit input space, paying for the 41,449-point weight-at-most-four basis. It is therefore much less efficient on this source, despite its better cap relative to unrestricted full degree-five interpolation.

For context only, the complete generic degree-five ANF basis has 242,825 inputs; 43,261 is about 5.61× fewer than that generic basis. This is not a matched baseline and does not overturn the result against the existing source-aware projected-affine learner.

**Correct conclusion:** the top-quintic learner is a valid second reconstruction path for this fixed degree-five source, but it does not improve query efficiency over the already available specialized attack. The 38.3% worst-case-cap comparison must not be reported as an observed reduction.

## Reproducibility

The complete adapter, worker, focused workflow, and modified baseline helper are preserved on branch `agent50/rankfive-top-quintic-http-20261124` at head `39f7c08259f0a6088fb0faeaeb40ca0e2fbf37cc`; the file paths below should be read from that branch. The report and communications are on current main.

- Workflow: `.github/workflows/manual-sco-rankfive-top-quintic.yml`
- Top-quintic adapter: `sims/sco-rankfive-top-quintic-real-http.js`
- Worker bridge: `sims/rankfive-top-quintic-http-worker.cjs`
- Existing baseline: `sims/sco-rankfive-arbitrary-table-real-http.js`
- Learner: `sims/rankfive-top-quintic-validated-peer.js`
- Generic learner: `sims/rankfive-top-quintic-functional-clone-peer.js`
- Preregistration: `workplace/rankfive-top-quintic-live-http-preregister-2026-11-24.md`
- Ubuntu artifact: ID `14950602517`, SHA-256 `a6f4aab3303805383e7a0ff7837ad3d086f0ab6fc7a235b133061ca70cacf2b8`
- Windows artifact: ID `14951816213`, SHA-256 `03c90659dda0c3b56a352a51012233af63c53fcf140d384aa49acefe8786a7be`

The artifacts contain the full output JSON, random draw tapes, hashes, and baseline text. The source pin and run are exact; this is not a mainline integration or a current-main acceptance receipt.

## Scope and decision

This is a functional-cloning and query-efficiency experiment against a fixed deterministic algebraic function. It does not recover arbitrary JavaScript source, side effects, stateful behavior, or host effects. It does not measure attacker CPU, target runtime, or the 2.5× compute budget. It does not demonstrate an authorization bypass, stronger confidentiality, integrity protection, or environment locking. The result is intermediate negative comparative evidence; keep it in `im-results/`. The project-wide strong-protection decision remains **RELEASE-BLOCKED**.

## Follow-up

The generic top-quintic learner's query inefficiency motivated a more specialized quotient-section reconstruction. The follow-up [top-derivative projected-affine hybrid report](agent50-rankfive-top-derivative-projected-affine-hybrid-2026-11-24.md) records the construction, adversarial fallback controls, 1,000-run JS simulation, and corrected-head live SCO/native HTTP comparisons. It remains intermediate query-count evidence and does not alter the RELEASE-BLOCKED decision.
