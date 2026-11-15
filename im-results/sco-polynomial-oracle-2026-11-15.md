# Five-query authorized oracle reconstruction of server-private cubic functions

Date: 2026-11-15. Status: **intermediate adversarial and compatibility evidence**, reproduced once in manually dispatched GitHub Actions on Ubuntu Node.js 22. Source: [sims/sco-oracle-polynomial.js](../sims/sco-oracle-polynomial.js). Successful [workflow 43692256882](https://github.com/FlareZ123/obfs/actions/runs/43692256882) at commit `0d525257e75f2998879384542f40e8223483e57c`; [raw artifact 14152692328](https://github.com/FlareZ123/obfs/actions/runs/43692256882/artifacts/14152692328).

## Threat-model contract

The private module defines `async score(x)` as an integer-valued polynomial `a*x^3 + b*x^2 + c*x + d`, with four coefficients independently sampled using Node's cryptographic `randomInt(-12,13)`. The authorized integer domain is 0 through 512. This is an explicitly **known degree-at-most-three hypothesis class**: a source-free attacker needs this structural prior to solve the coefficients in constant queries.

For each trial the trusted server:
1. Writes and imports a private ESM module containing the four coefficients and an unrelated random secret canary.
2. Calls `partitionScoAsyncModule` with `serverOnlyInitialization:true` and `batch:true`, publishes only its generated ESM facade, then binds the protected method through `bindScoModuleExports` and `createScoHandler`.
3. Requires a session cookie for RPC, checks method IDs and argument ranges, and refuses requests without a session (HTTP 403). The demo session cookie is deliberately simplistic; it models legitimate access, not a production authenticator.

The attacker receives **only the published ESM facade** and the ability to make authenticated JSON RPC calls. The recovery helper `recoverPolynomial(api,transport)` takes no coefficients, original source, server module or partition registry. The independent evaluator alone compares its reconstructed function with the withheld server implementation. Eight trials use fresh random private coefficients and fresh partition seeds; the full raw timing and outcome fields are retained in the workflow artifact.

## Executable attack and evidence

The attacker requests outputs for `x=0,1,2,3,4`. Four evaluations determine an exact cubic via forward differences; the fifth tests the assumption that the fourth finite difference is zero. From successive differences `d0=f(0)`, `d1=Δf(0)`, `d2=Δ²f(0)`, and `d3=Δ³f(0)`, it constructs:

```text
a = d3/6
b = d2/2 - 3a
c = d1 - a - b
d = d0
clone(x) = ((a*x + b)*x + c)*x + d
```

Results on the captured Ubuntu CI run:

| Measure | Result |
|---|---:|
| Independent randomized private cubic functions | 8 |
| Fully recovered exact coefficient vectors | **8/8** |
| Authorized function evaluations per recovery | **5** |
| HTTP requests per recovery using individual calls | 5 |
| HTTP requests per recovery using explicit batch | 1 |
| Previously unqueried input cases checked per reconstruction | 101 |
| All independent holdout comparisons (8 × 101) | **808/808** |
| Source/canary presence in served facade | Absent in all eight |
| Unauthenticated RPC requests | HTTP 403 for all eight |
| Median serial-recovery loopback elapsed | 3.604 ms |
| Median batched-recovery loopback elapsed | 0.860 ms |
| Ratio of these descriptive medians | 4.19× faster in batch |

Each recovery also produced the expected output values on the five probes and matched the original coefficients exactly in the trusted evaluator. Batch and serial probes reconstruct the same function. The workflow emitted `sco-oracle-polynomial-output.json` alongside `rpc-cost-output.json` and `rpc-rtt-grid-output.json`. All files are available in its raw artifact.

## Interpretation

This experiment separates the relevant security dimensions:

- **Static reconstruction:** the private implementation and canary were absent from the public facade, so client source delivery did not leak those bytes.
- **Dynamic black-box reconstruction:** exact functional recovery succeeded after five authorized chosen-input evaluations despite proper server-side source retention.
- **Authorization and tamper:** missing-session requests were rejected. No auth bypass, server compromise, or source extraction was demonstrated.
- **Compatibility:** the generated browser-style ESM client invokes real SCO JSON RPC and preserves the tested operation's results. The recovered standalone `clone(x)` agreed over 101 fresh integer inputs per randomized function.
- **Performance:** one batch reduced HTTP request count from five to one and measured attack wall time in this favorable same-process loopback. These are attack collection times, **not** a general `2.5×` legitimate-application benchmark. The separate RTT experiment evaluates that constraint and includes injected wait.

The attack is class-specific. Five samples are insufficient to reconstruct arbitrary unknown JavaScript, noisy/randomized behavior, stateful operations, variable-precision outputs, or hidden inputs. Range restrictions, quotas, query charges, session validation, and threat-driven API design can change its cost and applicability. Under the required SCO adversary model, however, the attacker is allowed unlimited legitimate queries, and returning exact deterministic outputs for a low-dimensional family gives the attacker enough information to replicate the algorithm without ever obtaining its source.

## Relationship to companion evidence

Agent 8's [finite-domain SCO oracle cloning](sco-oracle-cloning-2026-11-15.md) exhaustively queried all 256 possible inputs of a private 8-bit function using 16 batches. This experiment demonstrates a complementary failure mode: **generalization to 101 unqueried inputs per function**, with a known cubic hypothesis class and five observations per trial. The broader [SCO RPC latency grid](sco-rtt-grid-2026-11-15.md) remains the relevant measured evidence for the stated execution-time budget.

No per-commit CI workflow was introduced.
