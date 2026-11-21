# Authenticated SCO rank-six quadratic function cloned offline with secure random adaptive sampling

**Agent 11, 21 November 2026. Status: two-platform source-pinned intermediate adversarial result.** This is a genuine server-boundary attack evaluation under the project's unlimited-legitimate-request SCO threat model. It neither recovers private source text nor claims unauthorized access, general obfuscation defeat or a measured 2.5× compute comparison.

## Protected service and attacker access

The test boots the project's actual `partitionScoSelectedAsyncExports`, `bindScoModuleExports` and `createScoHandler` modules into a loopback HTTP server. The server alone imports a private ES module containing a 32-bit function `protectedRankSix`, six independent secret Boolean input masks, three nonzero quadratic corrections on disjoint pairs of those projected bits, and a private affine offset. Those three corrections ensure that the vector-valued quadratic polar has **exact joint radical codimension six**. The output is deterministic uint32, with a full-width affine component. Selective SCO's primitive-constant admission rule is respected by declaring each private value separately.

The server publishes only the generated RPC client facade. All `OBFS_PRIVATE_MASK`, `OBFS_PRIVATE_PAIR`, and `OBFS_PRIVATE_OFFSET` identifiers are absent from the delivered client source. The attacker reads the public facade to recover the actual exposed method route and possesses a legitimate session credential. The test makes a separate RPC request **without credentials**, which is correctly rejected HTTP **403**. An attacker-side function never receives the private ESM source or the imported server function.

The private source SHA-256 in both independent OS trials was:

`c0f1855ec56d181736dd97bc34f2984324b579535c2743f8ac19bc067e01b399`

## Adaptive authorized HTTP learning and exact offline test

The attacker invokes the separately published [`sims/rank4-6-quadratic-adaptive-polar-clone.js`](../sims/rank4-6-quadratic-adaptive-polar-clone.js) rank-six learner with an oracle callback reading only previously received authorized HTTP replies.

Whenever that synchronous learner needs an uncached value, its callback raises a private `NeedQuery` exception. The wrapper makes exactly one authenticated HTTP request, caches the uint32 reply, then replays the deterministic prefix of the attack. Crucially, **new random sampling words are independently generated from `crypto.randomBytes(4)`** and appended to a draw tape. On replay, already generated words are reused rather than redrawn. Thus the eventual adaptive attack sees actual fresh independent uniform inputs where the mathematical probability proof requires them, while asynchronous HTTP replies do not change its sampling decisions. Each server input is sent only once.

The exact-rank-six polar-signature certificate is constructed according to [`im-results/adaptive-quadratic-polar-k4-k6-2026-11-21.md`](adaptive-quadratic-polar-k4-k6-2026-11-21.md). Its conservative maximum at `n=32, δ=10^-10` is **516** unique chosen oracle values, with failure causing an explicit certificate refusal. Once the model is learned it is serialized to an offline JSON object, the server HTTP listener closes, and 1,032 heldout inputs are checked against the independent original private implementation with **zero** subsequent private-RPC executions.

## Two-platform results and provenance

The reproducible test source is [`sims/sco-rank6-adaptive-real-http-clone.js`](../sims/sco-rank6-adaptive-real-http-clone.js). The first fixture was corrected for selective-SCO primitive literals in commit `111f250d1d5493a797222faf18583da7e729a5eb`; Agent 22 repaired missing source array separators in `a0d9373285a8a61c9709e8e23d10376a653e7f6b`. A separate shared strict JSDoc issue in the rank-four cubic test was fixed by Agent 11 in commit `c688cd030b92250f1f0fa7781a1cdb29e1df092d`.

The completed [GitHub Actions run 44961573333](https://github.com/FlareZ123/obfs/actions/runs/44961573333), exact `main` source SHA `9c0359f796c618073a4c919803e7c7ac710407fe`, passed **both Windows and Ubuntu Node 22**, including the named real SCO HTTP attack step and strict JSDoc checks. Due to actual independent OS randomness, the two valid adaptive transcripts have different lengths:

| Measurement | Ubuntu | Windows |
| --- | ---: | ---: |
| Authenticated RPC requests | **150** | **171** |
| Independent random 32-bit draw words | 4 | 18 |
| Adaptive pair trials | 2 | 9 |
| Learned signature anchors | 3 | 3 |
| Offline heldout inputs after HTTP shutdown | 1,032 | 1,032 |
| Heldout output matches | **1,032** | **1,032** |
| Private method executions after training | **0** | **0** |
| Unauthenticated request status | 403 | 403 |
| Private implementation identifiers in public facade | No | No |
| Source class 99.99999999%-confidence call cap | 516 | 516 |

The server reply transcript SHA-256 hashes from CI were respectively

- Ubuntu: `40345bc35f33bb16fd49d3e7e6efa2f783c6f13776ff03f4c8b75e843a60d066`
- Windows: `3e67b14ceac2ff1f87e4b09795bb58d7cf390c2b1be45d5e33367601c27fc195`

The full reply transcript is hashed, not saved; exact repetition of the secure-random transcript is therefore not claimed. The recorded source SHA, Node 22 workflow, zero-mismatch heldouts, observed query counts and independently verified mathematical upper bound are sufficient for a source-pinned behavior test. Both runs' `SCO_RANK_SIX_516_LIVE_ORACLE` output lines are in their corresponding CI job logs.

## Interpretation and limitations

The authorized attack obtained an offline **functional** copy of the protected, fixed quadratic rank-six function despite properly enforced session authorization and absent private client source. Because the full quadratic ANF follows algebraically from a certified rank-six quotient and observed Gram coefficients, the model is exact for every input **conditional on the promised source class**. The 1,032 heldouts are separate computational checks; they do not by themselves verify all `2^32` inputs.

The attack is source-family-aware and requires unlimited legitimate chosen-value requests; a service with meaningful quotas or stateful per-session policies would constitute a different threat model. It makes no assertion that an arbitrary high-degree cryptographic function is clonable in this number of calls. It did not break authentication or recover private source bytes. Any plain authenticated server offering the exact same fixed quadratic oracle could face the same algebraic chosen-input reconstruction attack, so this test does **not** establish that the SCO framework is worse than an equal-trust non-obfuscated server baseline. It also does not measure running-time inflation or independently justify release under the prompt's 2.5× performance ceiling.

This negative-case evidence is relevant to candidate selection against protecting server-secret functionality solely through low-degree projected transformations. It belongs in `im-results/` pending originality and broader matched-baseline review. The primary project decision remains **RELEASE-BLOCKED**.
