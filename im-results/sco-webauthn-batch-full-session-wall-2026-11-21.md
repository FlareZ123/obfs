# Same-workload real Chromium native versus WebAuthn-batched SCO wall latency (2026-11-21)

**Agent 10. Classification:** preregistered end-to-end browser **wall-time** study, not cross-process CPU attribution or complete 2.5x compute compliance.  
**Frozen charter:** [workplace/sco-webauthn-batch-full-session-wall-charter-2026-11-21.md](../workplace/sco-webauthn-batch-full-session-wall-charter-2026-11-21.md).

## Why a matched full browser workload was needed

The earlier signed WebAuthn batch security experiment executed 128 tiny original arithmetic mappings in the real browser/SCO handler, while its accompanying positive **server-only** CPU screen used a heavier 500-round Int32 native kernel for each of 128 operations. Those **different original workloads** prevented combining the findings into an application-level 2.5x result. A real browser-native original and exactly matched server-private computation are needed to judge the user-perceived cost of the actual authenticated SCO protocol.

## Frozen study

The same real Chromium page and input array of 128 ordered safe integers, `index−64`, run the exact operation `(Number(value)*17+29)>>>0`. Each A and B sample consists of **32 sequential 128-value batches = 4,096 outputs**, with checksums and every output element compared to the same native definition.

- **A native:** original arithmetic `map` runs entirely in the browser, without HTTP or authenticator.
- **B signed SCO:** the browser authenticates a fresh `proofBatch` challenge using the existing real Chrome WebAuthn virtual CTAP2 authenticator with required UV; submits all 128 signed inputs to real `createScoHandler` in Node, receives the private method's output, checks 128 values and consumes the nonce. The request is a genuine browser `fetch` carrying the HttpOnly authenticated cookie.
- Both variants are invoked as a single `page.evaluate` each. Thus no extra Puppeteer round trip per signed batch is included. Registration and the original login ceremony are completed and excluded before timing. Each variant runs one 32-batch warmup, then **five alternating paired A/B samples**. Samples measure browser `performance.now()` wall elapsed.
- Server-private execution counter and signed challenge proofs must confirm exactly 1 warmup ×32 + 5 protected samples ×32 =192 additional authenticated batch calls, on top of the existing two security-positive calls. The final counter must equal 194. Outputs and checksum must match across every pair.

## Reproducible evidence

[Manually dispatched real Chrome + Node22 + strict JSDoc CI 44878354173](https://github.com/FlareZ123/obfs/actions/runs/44878354173), exact source commit `e923fe1aff7755e3f4a47aeff2a27ac2cc3d20e2`, green. Test source: `test/sco-webauthn-origin-boundary-browser.js`, invoked by existing `.github/workflows/manual-sco-ratchet.yml` input `webauthn_boundary_only=true`. All prior browser security canaries and both main/external strict JSDoc checks also passed.

The complete source-pinned machine-readable `SCO_WEBAUTHN_BATCH_WALL` record prints five native/protected pairs and the metrics below:

| Pair | Native browser wall ms | Signed SCO browser wall ms | Output checksum |
| --- | ---: | ---: | ---: |
| 1 | 0.4 | 125.6 | 83,968 both |
| 2 | 0.4 | 130.4 | 83,968 both |
| 3 | 0.4 | 121.6 | 83,968 both |
| 4 | 0.3 | 125.0 | 83,968 both |
| 5 | 0.3 | 126.1 | 83,968 both |
| **Median** | **0.4** | **125.6** | exact |

The median ratio is approximately **314×** for the 32-batch session sample. The baseline is so short that browser timer quantization around 0.1ms materially limits its precision. Treat **314×** as a reproducible order-of-magnitude and runner-specific observation, rather than a stable microscopic hardware performance constant. Even allowing much larger relative timer error, the wall latency is far beyond 2.5× for this exact toy workload.

## Interpretation

The complete signed batch path exhibits substantial **user-visible latency** versus running the same 4,096 simple arithmetic mappings in the browser. The signed path includes 32 browser-authenticator ceremonies, 32 challenge HTTP calls, 32 signed SCO RPC calls and response parsing per measured sample. It preserves all original return values and the tested server-authentication guarantees.

This is a strong **latency rejection** of mandatory WebAuthn per 128 trivial arithmetic operations in this browser-and-server setup. It is **not** a rigorous CPU rejection under the project's strict 2.5x compute-only rule, because wall time includes network scheduling, promise stalls and authenticator waiting. Chrome and Node CPU usage are not simultaneously measured as a matched total. The prior isolated server verifier CPU pass for 500-round operations cannot be transferred to this tiny map. A decisive compute verdict requires paired measurement of all participating runtimes for exactly the same transformed and original program and workload.

The virtual authenticator auto-approves user verification for this CI test; real hardware and human-presence latency could be higher or lower. There is no proof of hardware ownership, no cross-account security guarantee and no resistance to the existing authorized-origin online relay. All prior claims are scoped as in `im-results/sco-webauthn-proof-batching-2026-11-21.md`.

**Decision:** reject this tiny batched arithmetic workload as a low-latency deployment target; preserve any genuinely coarse, infrequent high-value SCO operations as provisional candidates only. **RELEASE-BLOCKED** remains unchanged.
