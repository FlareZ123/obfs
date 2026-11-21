# Real authenticated SCO RPC: rank-three projected functions cloned offline

**Agent 11, 21 November 2026. Classification: intermediate implementation-level adversarial falsification.** This report validates a source-family-aware functional reconstruction attack against an actual server-controlled obfuscation HTTP boundary. It is a negative security test, with no release, universal-source-leak or 2.5x runtime claim.

## Threat boundary and two private functions

The server uses the project's actual `partitionScoSelectedAsyncExports`, `bindScoModuleExports`, and `createScoHandler` APIs. For each test it holds a JavaScript ES module with a private `protectedRankThree` function, private 32-bit input projection masks, secret-looking quadratic/cubic output coefficients and a private affine offset; it publishes only the generated client RPC facade and public method route. All source constants remain server-side. The private function is a fixed 32-bit affine map with nonlinear corrections determined by three hidden linear forms of the input. One private source has a genuine cubic coefficient; the second is quadratic-only. The two branches share the same input-projection promise `rank(V)<=3`, and the private affine core need not be invertible.

The attacker receives only the HTTP origin, an actual legitimate authorization token and the published facade source. It extracts the method routing identifier from those public bytes and makes standard `POST /obfs/rpc` requests with its own credential. An unauthenticated control request is denied **HTTP 403**. The attack function has no import of the original private module or its coefficients; it treats the server as an opaque oracle. The test harness retains the original for independent post-shutdown verification only.

## Authenticated adaptive attack

The attacker first requests F(0) and 32 single-bit basis inputs. It then draws independent-in-model random triples from a reproducible xorshift fixture and queries at most seven previously unseen cube vertices per trial. It computes both the third additive difference `T(a,b,c)` and the three pair polarizations `B(a,b),B(a,c),B(b,c)` from the **same HTTP response cache**. For a nonzero cubic witness it requests up to six basis-translation values per input bit; otherwise, a recorded quadratic pair witness requires at most two per bit. The input is fixed-width uint32, each requested value is de-duplicated, and every RPC answer is checked for valid uint32 output.

After assembling the HTTP transcript, the attacker replays the identical sample sequence through Agent 22's public source-only [rank-three full-functional learner](../sims/rankthree-polarization-oracle-clone.js). Its oracle callback reads **only the transcript Map** and throws if a missing value is requested. The model is serialized as JSON, the HTTP listener is closed, and then 1,030 independently designated held-out outputs are checked against the original private function without any more remote calls.

The cubic and quadratic source promise is necessary. The mathematical `<=631` high-confidence query bound and `<10^-10` failure probability are proved in [Agent 22's third-derivative report](rankthree-projection-third-derivative-functional-clone-2026-11-21.md), reinforced by the independent [rank-three Gram peer](rankthree-quadratic-polarization-peer-2026-11-21.md). The deterministic seed in this executable test is a reproducible witness, **not** an independent-uniform randomness implementation or a stand-alone probabilistic guarantee.

## Source-pinned observations

The standalone reproducible CJS/JSDoc harness is [`sims/sco-rankthree-631-live-clone.js`](../sims/sco-rankthree-631-live-clone.js) (commit `fc490b850736fc5870f22b54a43abdd0b9068f54`). Both cases passed on actual loopback HTTP with the generated facade:

| Measurement | Quadratic server secret | Cubic server secret |
| --- | ---: | ---: |
| Actual authenticated private-RPC requests | **503** | **274** |
| Triple probes used | 58 | 7 |
| Cubic witness | No | Yes |
| Quadratic pair witness found | Yes | Yes |
| Held-out outputs checked after server close | **1,030** | **1,030** |
| Held-out functional mismatches | **0** | **0** |
| Private method executions after training | **0** | **0** |
| Unauthenticated request HTTP status | 403 | 403 |
| Private identifiers leaked to client facade | No | No |
| Source SHA-256 | `632091aca0fbc038cc73a043c6dfb3b09b3fd4dbfb7da9c0ab0bec62ecda96df` | `911783c42014f158a18614b04ebe8558a201aa1e5d2b71dc463fedef82033fd6` |
| Attacker transcript SHA-256 | `84670c74865632aa98f2e90da6ed03a9ece024262cf5c7d52ab94ef91b42f75e` | `de5cb797e096d9f4a8d2d816db8d5380645bc34ca287841943d6ec82eb88eee8` |

**Immutable execution evidence:** [GitHub Actions run 44959612045](https://github.com/FlareZ123/obfs/actions/runs/44959612045), exact source commit `a53f6b637dcc5c65eeb23f5a289f5b14349292d8`, passed on **Ubuntu and Windows**. Each machine executed the named actual authenticated HTTP step and the strict JSDoc project check including the harness, alongside the existing low-rank regression suite. The explicit output string `SCO_RANKTHREE_631_LIVE_CLONE` contains the two measured transcripts and source hashes. No new CI workflow was introduced.

## What the observation establishes

These two private functions remained absent from the published client source and unauthorized requests were denied. Nevertheless, an attacker permitted **unlimited legitimate oracle requests** obtained a complete offline behavioral clone on both tested functions. Once training finished, the attacker could compute all further values locally, and live server authorization was no longer consulted. This falsifies any candidate claim that *merely hiding this restricted rank-three function source on SCO* makes its behavior intrinsically uncloneable.

The result neither recovers private source spellings nor breaks the server's authentication mechanism. It assumes a fixed deterministic, low-input-rank, degree<=3 function and an attacker aware of that source family. It does not establish whether an unrestricted cryptographic PRF with a server-private high-entropy key can be cloned in this way, nor whether a pure minified trusted-server control would behave differently. It does not quantify overhead versus an equal-trust native application, runtime instrumentation resistance, environment locking, or worst-case compute time under the project's strict 2.5x ceiling. The global security-performance verdict remains **RELEASE-BLOCKED**.
