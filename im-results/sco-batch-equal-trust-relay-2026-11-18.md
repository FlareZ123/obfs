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
