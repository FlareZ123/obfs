# SCO/COO bracketed IPv6 environment locking: shared canonicalization

**18 November 2026, Agent 44. Status: bounded correctness improvement, not a tamper-resistance gain.**

## Original fault and threat boundary

The original `src/sco.js` Host filter computed `request.headers.host.split(':')[0]`. A legitimate HTTP Host such as `[::1]:8080` therefore yielded `[` and could not match a declared IPv6 literal. Independently, the executable host-lock injection in `src/core.js::injectHostLock` only accepted an ASCII DNS-name regex and rejected `allowedHosts:['[::1]']` when a script was requested. Thus a bracketed IPv6 deployment could not deliver/execute its intended protected JavaScript through the normal SCO route.

Both filters are about declared routing and local hostname checks. **An attacker may forge Host**, execute the client in a modified runtime, or relay authorized requests. Neither this fix nor the original policy can authenticate an authorized account or attest an instrumented browser.

## Narrow implementation

- `src/hosts.js` centralizes strict input canonicalization for the browser's allowlist and SCO's HTTP prefilter. The compiler's previous ASCII DNS grammar is retained. Valid explicit bracketed IPv6 literals are admitted through the WHATWG `URL` hostname parser, with expanded/compressed literals canonicalized. Unbracketed IPv6, ports in configured allowlists, invalid bracket suffixes, userinfo and malformed literals are refused.
- For requests, bracketed `Host` may include an optional numeric port; its IPv6 component is validated by WHATWG parsing. The legacy hostname-plus-port interpretation of ordinary DNS headers remains compatible with existing configurations.
- The server compiles a `Set` of canonical allowed names once during handler construction. The previous source implementation created a fully lowercased allowlist array on every incoming request. The new path needs one canonical lookup and a Set membership check. The new setup is server-side, and the per-request calculation does not change the generated protected workload.
- `src/core.js::injectHostLock` consumes exactly the same host canonicalization for COO and SCO emitted scripts. It still installs an execution-host guard in every eligible module and retains the existing conservative static graph/source-observation restrictions.

## Validation

- `test/sco-host-ipv6.test.js` uses a real Node HTTP listener, spoofed bracketed Host headers on an IPv4 transport, and native `vm` execution of the SCO-generated script with an authorized/disallowed location hostname. It asserts 200 for valid, equivalent IPv6 spellings, correct RPC and asset payloads, 403 for malformed or unauthorized routes, and no client side effect before the generated hostname gate permits execution.
- The same test verifies COO direct generated-script execution and refusal of malformed configured hostnames. Source-pinned Ubuntu/Windows [manual SCO authorization suite 44249011608](https://github.com/FlareZ123/obfs/actions/runs/44249011608) completed successfully at `be99816e14a489c6995466721a2b32b2c496cf6f`.
- `sims/sco-host-routing-cost.js` preserves a paired source-matched prepatch `Array#map(...).includes(...)` versus the new shared `routingHostname` plus `Set#has` microbenchmark, with 1, 8 and 128 configured hosts, nine alternated repetitions and raw times. It measures the routing prefilter alone, never the application or 2.5× obfuscated workload. The source-pinned [manual SCO suite 44249648632](https://github.com/FlareZ123/obfs/actions/runs/44249648632) succeeded at `e6788f0937ecadf8cad707cc0a4de70f8b6acdeb`, running this profiler and both Windows/Ubuntu JSDoc.
- `test/sco-host-ipv6-browser.js` pairs a native versus obfuscated headless Chromium page over **real IPv6 loopback** `[::1]`. The public HTML shell is intentionally served by an independent constrained route; SCO handles its sole JavaScript file, preserving the source-observer fail-closed rule for active HTML assets. The first [run 44249862890](https://github.com/FlareZ123/obfs/actions/runs/44249862890) failed on the overbroad original fixture with `Host locking cannot preserve observable source bytes`, demonstrating that the proof guard worked. After separating public HTML and guarded JS, [run 44250402486](https://github.com/FlareZ123/obfs/actions/runs/44250402486) on source `b9c20ddd1b45fed0cb6b0068f93d7b815a403fd2` **passed Ubuntu Chromium** with actual stdout `Real IPv6 Chromium native and SCO host-locked script parity: [::1]|42`. Windows ran the Node regressions and both strict JSDoc checks successfully; browser test was intentionally Linux-only.

## Paired routing prefilter cost and fast-path correction

The initial canonicalization used `header.split(':',1)[0]` for non-bracketed Host. That limit argument was unexpectedly expensive under Node 22: in nine alternating runs of 80,000 lookups, the first [two-OS gate 44250402486](https://github.com/FlareZ123/obfs/actions/runs/44250402486) measured **legacy/new median 0.480× Ubuntu and 0.485× Windows** for a single-host list (new path about 2.08×/2.06× slower) despite large-list wins. Crucially, this was a synthetic *routing-only* microbenchmark, not application compute. The isolated issue was reproduced locally by comparing the same `String#split` with and without the limit.

`src/hosts.js` now uses `header.split(':')[0].toLowerCase()` in that same DNS-only branch. Bracketed IPv6 remains in the verified URL normalization path. No route, authorization, policy snapshot, or generated JavaScript API changed. Source change: `f5bef22e609d5b9f8f3a2fda6019a29985070eb9`.

Following this change, [cross-platform SCO authorization gate 44252348752](https://github.com/FlareZ123/obfs/actions/runs/44252348752) **passed** all targeted Node policy tests, actual IPv6 Chromium parity on Ubuntu, both JSDoc projects and `sims/sco-host-routing-cost.js`. Each cell below is a median total time in **milliseconds for 80,000 hostname lookups** over 9 alternating warm trials; each ratio is legacy/new (greater than 1 favors the corrected implementation).

| OS | Allowed hosts | Legacy ms | Corrected ms | Legacy/corrected |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu | 1 | 6.190048 | 4.554377 | 1.3591× |
| Ubuntu | 8 | 15.126384 | 4.433407 | 3.4119× |
| Ubuntu | 128 | 172.844137 | 4.336644 | 39.8567× |
| Windows | 1 | 6.920500 | 5.083000 | 1.3615× |
| Windows | 8 | 15.539100 | 5.244700 | 2.9628× |
| Windows | 128 | 175.018200 | 5.218300 | 33.5393× |

These improvements apply to the **Host routing prefilter alone**. They are not strict 2.5× assurances for obfuscated application execution, startup, HTTP transport, authorization or multi-tenant contention. The prior stronger claim that a per-request Set necessarily wins without source-matched measurements would have been false for the first implementation; the red intermediate comparison and corrected green pin are both preserved to make the selection transparent.
## Cross-file native ESM IPv6 consistency

The two-module `test/closed-graph-host-lock.test.js` regression now covers a native Node ESM import chain with a single expanded `[0:0:0:0:0:0:0:1]` policy. The emitted `entry.mjs` and `dep.mjs` independently install the canonical host guard; executing both modules under `[::1]` preserves native side-effect order (`dep`, then `entry`) and return value 61, while a denied `[::2]` exits before either body effect. This tests the **cross-file** environment-lock behavior that the single-file browser page does not establish. The existing manual SCO suite at [44253172169](https://github.com/FlareZ123/obfs/actions/runs/44253172169) source `6958de0e3a1c3ac0fc7ffeedc4e1e7d4e28d92c9` **passed** the new ESM test and all selected SCO authorization tests on Ubuntu and Windows, plus real IPv6 Chromium on Linux and strict JSDoc.
## Limits and open work

A normal client can spoof the Host header. A modified browser can spoof `location.hostname`. These are deliberately weak environmental checks, not proof of runtime integrity. No new security score or reconstruction resistance follows. A full application-plus-network overhead comparison to a minimal equivalent control remains unmeasured; request prefilter samples cannot establish the project's 2.5× repeated-runtime requirement. See [Node URL hostname documentation](https://nodejs.org/api/url.html) for the parser contract.
