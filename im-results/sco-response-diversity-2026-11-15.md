# Measured SCO HTTP source variation coverage across five browser-style ESM fixtures

Date: 2026-11-15. Classification: **intermediate reproducible empirical evidence**. Script [sims/sco-response-diversity.js](../sims/sco-response-diversity.js), commit `9f10e25c63763040e4c0b00809fab063fc36c768`. One manually dispatched Ubuntu Node.js 22 [workflow 43692762523](https://github.com/FlareZ123/obfs/actions/runs/43692762523) succeeded; raw JSON [artifact 14153200579](https://github.com/FlareZ123/obfs/actions/runs/43692762523/artifacts/14153200579).

## Question and instrumentation

SCO generates a fresh random nonce per HTTP GET and may mutate source spellings. The existence of a fresh nonce does not imply that each response changes. An ineligible program may be returned byte-for-byte as its original source. This experiment measures **actual response diversity** after all compiler safety gates.

For each of five exact source groups, the script starts a real Node HTTP server with `createScoHandler`, issues twelve separate successful GET requests to the same published ESM module, collects SHA-256 of each response, counts bytes changed relative to the original source, and parses every response. For modules without static imports, it dynamically imports each delivered source as a native `data:` ESM module and asserts a representative observable result. The source-observer fixture also compares exact `Function.prototype.toString` representations against the original. This is a small fixed corpus and one CI runner.

## Observations

| Fixture | Distinct response SHA-256 values / 12 | Responses different from original / 12 | Median loopback GET elapsed |
|---|---:|---:|---:|
| Untransformable numeric `export const` | **1/12** | 0/12 | 2.608 ms |
| Eligible private function argument / property | **12/12** | 12/12 | 2.380 ms |
| Same-file function-source observer | **1/12** | 0/12 | 2.041 ms |
| Source observer in a different published ESM file | **1/12** | 0/12 | 0.690 ms |
| Same function accompanied by unrelated nonobserving ESM module | **12/12** | 12/12 | 1.522 ms |

The first request for each server includes cold local HTTP/fetch setup and is retained in raw samples. The timings are descriptive and cannot support a performance comparison against direct, nonobfuscated execution, especially across independent warmup histories.

The two eligible fixtures emitted a new distinct 141-byte source file on every request. The other three cases emitted a single stable response despite fresh server nonces. In the two source-observing cases, conservative transformation refusal is deliberate semantic protection. The group-level refusal also affects the source file when its observer lives in a different file, as introduced by the regression repair `d43fe70c` and validated in [SCO source-observation research](sco-interfile-source-observation-2026-11-15.md).

## Implications and limitations

The present SCO architecture can genuinely withhold server-only code through `partitionScoAsyncModule` and method authorization. Its response diversification is a separate, partial hardening technique. On these five small examples, a fresh random seed does not guarantee polymorphic output: the compiler's correctness constraints can disable every mutation, and trivial exported numeric modules have no eligible operations. Conversely, twelve different hashes do not imply meaningful resistance to a source-capable attacker, and several existing offline normalization tools recover transformed names or expressions.

The measurement does **not** quantify Shannon entropy of source transformations, attacker effort, output-level confidentiality, browser cache behavior, or a 2.5× runtime slowdown. It does show why mutation coverage must be reported beside correct behavior and attack-success measurements instead of inferring protection from nonce generation alone. A larger and varied real-program corpus, held-out sources, multiple seeds and OS/browser runs are required before estimating representative coverage.

Related evidence: [same-source attacker and performance grid](decision-grid-2026-11-15.md), [SCO authorized polynomial extrapolation](sco-polynomial-oracle-2026-11-15.md), and [SCO RPC latency](sco-rtt-grid-2026-11-15.md). No per-commit CI was added.
