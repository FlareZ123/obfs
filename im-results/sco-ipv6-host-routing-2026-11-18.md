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
- `test/sco-host-ipv6-browser.js` adds a paired native-versus-obfuscated headless Chromium localhost IPv6 trial. Its run must be recorded separately: at the time of this report, [workflow 44249862890](https://github.com/FlareZ123/obfs/actions/runs/44249862890) at `4d9d2df234f76112697f0f62901fbfcb004604b2` is in progress. The header-injection and Node VM tests above do not by themselves establish actual IPv6 browser network availability.

## Limits and open work

A normal client can spoof the Host header. A modified browser can spoof `location.hostname`. These are deliberately weak environmental checks, not proof of runtime integrity. No new security score or reconstruction resistance follows. A full application-plus-network overhead comparison to a minimal equivalent control remains unmeasured; request prefilter samples cannot establish the project's 2.5× repeated-runtime requirement. See [Node URL hostname documentation](https://nodejs.org/api/url.html) for the parser contract.
