# SCO equal-trust minified batch client versus generated facade: one-trace online relay (18 November 2026)

**Evidence class:** reproducible two-platform authenticated HTTP adversarial negative control, not an established new cryptographic security result. The **strong-obfuscation release decision remains blocked**.

## Exact source, CI and distributed artifacts

The [manual Linux/Windows Node 22 workflow 44235737301](https://github.com/FlareZ123/obfs/actions/runs/44235737301) completed successfully at **`bcc0b813bdc0d11d4e7e4ca22f7d22a1f13952f7`**, including strict external JSDoc and the actual generated client, minifier, server-private implementation, authentication and attacker checks.

Reproduce using `node sims/sco-batch-equal-trust-attacker.js`. The workflow `.github/workflows/manual-sco-batch-equal-trust.yml` runs the same script on `ubuntu-latest` and `windows-latest` after declared dependency installation. The tested Node version was `v22.23.4` on both runners.

| Actually HTTP-served public frontend | Size | SHA-256 | Private implementation |
| --- | ---: | --- | --- |
| Compiler-generated batch SCO ESM | **1,051 bytes** | `8a78da05cc79d87f278cd0167b4c0dc5fd5fac865c817537f6f3fa38e6d8c026` | Withheld on trusted server |
| Ordinary esbuild-minified ESM client | **666 bytes** | `9e571b731a669a58f895a1130960340cb792e5280b00c7f2eedb3a987799163c` | Same original trusted server |

The minified comparison is derived from a clear ESM RPC frontend using the generated server method names and minified using the pinned `esbuild` dependency. Its status as a comparison control does not mean it independently obfuscates or redistributes the private engine. Both frontends use exactly the same original six-file private application-challenge graph, authenticated batch handler, token, per-request aggregate cap of 1,024,000 declared iterations and real source withholding.

An unauthenticated HTTP read of either frontend returned **403**, and a token-authorized read returned the exact source recorded above. The generated client did not contain `createEngine`, nor did the ordinary minified client. These checks establish the tested publication and service-policy boundary only.

## Threat and attack procedure

The attacker received only the deployed public ESM source, the real endpoint URL, and a legitimate client's bearer token. This is inside the SCO prompt's threat model, which explicitly permits full inspection of the hostile client and unlimited legitimate authenticated calls.

An independent adversarial helper, `traceAndRelay`, used the following procedure for **each** frontend:

1. Import the public ESM bytes, instrument the hostile client's `fetch` call, and issue exactly one legitimate `batch([{name:'evaluateRemote',args:[0x12345678,1]}])`.
2. Capture the actual outgoing JSON RPC envelope, its outer batch method ID and nested private method ID. The attacker receives neither the compiler partition object nor original ESM method mapping directly.
3. Generate **32 previously unqueried** deterministic 32-bit seeds, each with original engine count 1,000, and issue one direct HTTP RPC POST that faithfully uses the recovered batch method identifiers. The first discovery query was outside the 32 held-out population. The request's 32,000 declared iterations fall below the same real admission cap.
4. Verify the token-authorized server returns HTTP 200 and **all 32 successful original outputs**, then independently compare the complete 32-output JSON sequence with native `evaluateRemote` calls against the trusted original engine.

| Attacker outcome | Generated SCO batch ESM | Equal-trust esbuild-minified ESM |
| --- | ---: | ---: |
| Real authorized discovery batch queries | 1 | 1 |
| Held-out direct HTTP batch outputs recovered | **32/32** | **32/32** |
| Exact native JSON-wire outputs | **32/32** | **32/32** |
| Validated on Ubuntu and Windows | Yes | Yes |

The JS code independently enforces the single discovery request by rejecting a second intercepted `/obfs/rpc` call during discovery. It then deliberately bypasses the public ESM module for the direct replay, reflecting the prompt's full client-control threat model. The public authenticated HTTP endpoints remain available to valid clients.

## Scope, causal comparison and outcome

This is a **matched trust boundary**: the same private source, resident original function, server handler, bearer, query allowance, arguments and 32 held-out original operations. The only changed artifact is the public RPC frontend, generated SCO versus conventional minified ESM. The comparison therefore isolates incremental client-front-end anti-relay properties for this specific attack class.

Both clients were fully cloneable **as authorized online oracles**, using one observed wire request. The compiled public frontend showed **no measured advantage over ordinary minification** for that method. The 1,051-vs-666-byte size difference is a source property, without implying a security advantage in either direction.

This adversary **did not** extract the server-only engine, break service authorization, recover the secret bearer without access, reconstruct every possible method, or establish offline indistinguishability. Those are different objectives. Conversely, under the prompt's assumption of unlimited legitimate service access, source withholding and account authorization do not imply resistance to same-token functional relaying. There is no demonstrated incremental static, dynamic, integrity or environment-locking strength added by the generated RPC wrapper in this experiment.

The experiment is also intentionally **not a performance gate**. Its matched-control result should be read alongside the separately source-pinned real-batch 13/51-pair resident CPU evidence, the [Node fresh-module gate](sco-client-fresh-facade-cpu-2026-11-18.md), and the [fresh-process client+server CPU gate](sco-batch-fresh-process-2026-11-18.md). The latter retains strict >2.5× short-operation failures on both operating systems despite positive 1,000-iteration samples. Different test source revisions and test shapes are clearly separated.

**Decision:** preserve the restricted, actually server-private, coarse-batch SCO architecture as a useful performance feasibility candidate. Its permitted-client anti-relay advantage over an equal-trust minified frontend is **unsupported by this verified test**. The primary strong-obfuscator release remains blocked until an alternative mechanism withstands a matched independent attacker while preserving all declared semantics and the strict 2.5× budget.


## Actual Chromium HttpOnly-cookie adversarial replication

A separate later [dual-platform and real Chromium run 44236604138](https://github.com/FlareZ123/obfs/actions/runs/44236604138) **passed both jobs**, at exact source `1168ea16fd51818c438b80e34704d0de6ac0a86c`. The Linux job passed the same Node attack and additional headless Google Chrome integration. The Windows job passed the Node attack plus strict external JSDoc. No CPU performance result is derived from the browser's virtual-time completion clock.

The optional `--browser` mode of `sims/sco-batch-equal-trust-attacker.js` serves a real browser page from the same trusted HTTP service. Its response sets a `SameSite=Strict; HttpOnly` session cookie and a self-only JavaScript/connection content security policy. The browser script receives **no bearer-token literal**. The real generated SCO ESM and equal-trust minified ESM are imported from their authenticated same-origin URLs; both contain only public RPC logic.

The hostile, same-origin browser code observes one legitimate outbound `fetch` batch per variant, extracts the actual outer/inner method IDs, and then calls the server's RPC endpoint itself for the same **32 held-out count1000** operations. The cookie is sent automatically by same-origin fetch. It obtains 32/32 results from **both** variants, confirms the two recovered arrays are identical, hashes the resulting JSON in browser WebCrypto, and the Node harness compares the browser digest with the original private function's digest. The page output on Linux was `chromium:{executed:true,heldoutCount:32,cookieHttpOnly:true}`. The same two public source SHA-256 digests and sizes were verified on both OSes: 1,051-byte generated facade versus 666-byte ordinary minified frontend.

This is a deliberate test of an **attacker capable of executing JavaScript on the authorized same origin**, which is within the prompt's fully controlled client threat assumption. It demonstrates that HttpOnly cookie confidentiality does not prevent an already-authorized same-origin client from invoking the service's original methods as an online oracle. It is *not* an attack by an unrelated cross-origin script. The fixture is loopback HTTP with a self-only CSP and no TLS, so it does not make a production HTTPS-origin equivalence claim. Browser launch/virtual time is used for correctness and adversarial coverage, never as a 2.5× compute bound.

**Updated decision:** Source-private, authenticated SCO batching remains useful for source withholding and selected coarse CPU work, but the live browser replay confirms no incremental measured anti-relay advantage over same-trust minification. The strict short-work compute veto and raw JSON-wire semantic limitation remain independently unresolved.
