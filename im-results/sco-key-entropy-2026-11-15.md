# SCO key entropy and granularity: independent chosen-input key-search control

**Date:** 2026-11-15, Agent 50. **Class:** intermediate reproducible engineering/adversarial evidence. **Source commit:** `23164dbb80b3d22abad3277313b07c611c92c7a1`. **Green Linux and Windows workflow:** [43716941756](https://github.com/FlareZ123/obfs/actions/runs/43716941756).

## Question

A server-private secret can remain absent from public JavaScript, yet a weak key may be recovered by a client with legitimate oracle access. A more expensive protected operation may fit the 2.5× allowed runtime where a cheap operation crossing HTTP does not. Are these security and performance variables independently observable through the current SCO partition and authenticated HTTP handler?

The executable [`sims/sco-key-search.js`](../sims/sco-key-search.js) answers this for a narrow pair of models.

## Reproduction and attack contract

Two independent Node.js ESM modules each implement a one-round HMAC-SHA256 digest of exactly 16 input bytes. Both use the same source algorithm and expose `export async function digest(input)` through the existing `partitionScoAsyncModule`, `bindScoModuleExports`, and `createScoHandler`. One module samples a uniformly random **16-bit key**. The other samples a uniformly random **256-bit key**. The keys are embedded only in separate private server files that are loaded into the trusted server's Node runtime. The public ESM facades contain no `createHmac` or `serverKey` references; methods and arguments are authenticated at the HTTP boundary with a synthetic test-only session header.

The attacker knows the HMAC algorithm, the 16-bit dictionary format, and that both services may be called with one chosen input. It observes the response from each **actual distributed public SCO proxy** after an authorized request. It then computes all **65,536 possible two-byte HMAC keys offline**, comparing each candidate output to that one response. The script never passes the sampled keys or private source to the attack function. The candidate is validated on 32 subsequent held-out inputs; these are verification queries, not inputs used to select a key. A different dictionary, longer search, side channels, and adaptive cryptanalysis are outside this test.

The simulator separately benchmarks direct local and authenticated loopback RPC calls for twenty one-round HMAC operations per sample, five samples, on the same source. This measures the cost of crossing the trust boundary for a tiny protected operation, unlike the 15,000-iteration coarse operation in [the paired high-entropy study](sco-high-entropy-prf-2026-11-15.md).

## Results

Both manual Linux and Windows jobs ran the attack, the existing SCO oracle suite, the new strict JSDoc check and the core JSDoc typecheck successfully.

| Measure | Ubuntu Linux Node v22.23.4 | Windows Node v22.23.4 |
| --- | ---: | ---: |
| Offline key guesses against each module | 65,536 | 65,536 |
| Permitted training oracle calls per module | 1 | 1 |
| Matching candidates for the 16-bit key | **1** | **1** |
| Matching candidates for the 256-bit key | **0** | **0** |
| Exact offline weak-key predictions on held-out inputs | **32/32** | **32/32** |
| Unauthenticated RPC status | 403 | 403 |
| Server-only HMAC identifier exposed in served facades | no | no |
| Direct local median for twenty calls, milliseconds | 0.062594 | 0.076900 |
| Sequential RPC median for twenty calls, milliseconds | 13.530784 | 14.402200 |
| RPC/local median ratio | **216.17×** | **187.28×** |
| 2.5× bound on this one-round workload | failed | failed |

The counterexample is particularly important: **the strong-looking source-withholding layer did not prevent exact offline reconstruction of all future behavior when the secret had only 16 bits of entropy**. Key recovery used one authorized service response followed by a finite local search. Changing that key to 256 random bits removed all candidates from the same two-byte dictionary in both runs, although this experiment did not attempt general 256-bit key recovery.

Under an *ideal random-key model*, exhaustively searching a 16-bit dictionary for a 256-bit independent key contains the true secret with probability `2^16/2^256 = 2^-240`; this arithmetic is a property of the uniform key draw, not a cryptographic proof about this implementation or its other possible attacks.

## Decisions and limits

- An SCO trusted server can protect *undistributed secret material* against client source inspection. The design must supply sufficiently unpredictable server keys and operation-aware server authorization. An attacker with authorized access can also relay fresh requests to the server; the test says nothing about preventing such online usage.
- Simple local JavaScript obfuscation, randomized method identifiers and client-side checks cannot restore entropy to a weak private key. An independently known, small key space can be searched offline using a legitimate result.
- The live one-round RPC service fails the 2.5× compute-time requirement by approximately two orders of magnitude under this loopback setup. Its protected work is too small to pay a network hop. The paired 15,000-round workload met 2.5× in two focused pinned runs because its server work was substantial. Any deployment claim must benchmark real workloads, network latency and authorized user flows.
- These runs are **no evidence of general cryptographic security, broader key-leak resistance, performance stability, or browser/Internet deployment fitness**. They also do not imply a compiler can turn arbitrary JavaScript into an RPC service without changing behavior. Existing SCO partitioning is explicitly opt-in with JSON-compatible methods.

The reproducible positive (one recovered weak key) and negative (zero matching high-key candidates) controls should remain paired in future architecture evaluations. Together with the earlier 256-input finite-domain oracle clone, these cases provide grounded test parameters for judging when server-private SCO genuinely changes the attacker-visible information and when network overhead disqualifies it.
