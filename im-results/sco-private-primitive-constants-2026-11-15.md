# Selective SCO module-lexical primitive constants

Agent 42, 2026-11-15. The selective SCO compiler now admits unexported, primitive-literal `const` declarations that are referenced only by the chosen server-private exports. Mutable bindings, object/array/function initializers and other effectful top-level expressions remain refused. Retained public functions must not reference those bindings. The compiler sends the constants only to the server-only parser and emits only public function text plus generated RPC facades.

The executable generated source pair and builder live in `examples/sco-private-const/`. The sample places a HMAC key and `node:crypto` import in the original private implementation while preserving the public function that normalizes input and calls the protected method. `test/sco-selective-partition.test.js` adds native-vs-remote HMAC checks using a real authenticated localhost HTTP server, source absence assertions and negative tests for public secret reads/effectful constants.

This demonstrates a narrower, genuinely server-controlled source withholding capability. It does not solve authorized online relay, guarantee cryptographic key confidentiality if the server is compromised, or establish the required whole-application 2.5× bound. This capability is an intermediate engineering result and requires threat-specific security evaluation.

## Pinned native/client/attacker measurements

The integrated [manual SCO workflow 43758970044](https://github.com/FlareZ123/obfs/actions/runs/43758970044) was green at immutable source `d2a9dadb4801a1d656230bac3df76136875ef8b6` on Node 22 Ubuntu and Windows. Targeted Node tests, both strict JSDoc suites, independent hosted attacker proxy and real Chromium ESM/HMAC integration (Ubuntu) passed. Source and generated public lengths were 393 and 670 bytes: byte count grows because the public RPC infrastructure is deliberately explicit. The generated client contains neither the HMAC key literal nor `createHmac`, and direct unauthorized RPC returned 403.

The public-file-only attacker used an **attacker-owned valid credential** to relay each of 20 held-out PRF queries through a separate HTTP proxy. It reproduced **20/20 answers** without reconstructing the HMAC key, showing complete online functional cloning despite source withholding. The server processed 52 authenticated calls during the larger simulator run, including the held-out and profiling calls. The attack relies on live access and does not establish a static or offline key-recovery method.

### Warm localhost elapsed-time ratios versus native code

| Workload | Ubuntu native | Ubuntu direct SCO | Ubuntu attacker relay | Windows native | Windows direct SCO | Windows attacker relay |
|---|---:|---:|---:|---:|---:|---:|
| One short HMAC | 0.028123 ms | 0.671291 ms (23.87×) | 1.180418 ms (41.97×) | 0.046400 ms | 1.045900 ms (22.54×) | 2.125000 ms (45.80×) |
| 100,000 native/local normalization operations then one HMAC | 5.167079 ms | 6.774940 ms (1.31×) | 7.301063 ms (1.41×) | 10.279200 ms | 12.689900 ms (1.23×) | 12.889600 ms (1.25×) |

Each entry is the median over eight alternating warm measurements on a single GitHub-hosted runner. The second row's public normalizer executes locally in both architectures. Only that particular **amortized** workload meets the 2.5× total elapsed-time budget. Short protected calls fail it badly even for direct, non-attacker client traffic. Network latency, TLS, browser execution cost outside the separate functional integration, cold start, server contention, multi-tenant state and unbounded legitimate query rates are excluded. The attacker's extra proxy hop must not be charged to the obfuscated client's budget; the table separates direct client from proxy overhead.

Evidence reproduction:
- `node sims/sco-private-const-relay.js`
- `node --test test/sco-private-const-relay.test.js test/sco-selective-partition.test.js`
- `node test/sco-private-const-browser.js` with a Chromium binary available
- `node examples/sco-private-const/build.cjs` to reproduce the generated public source

The report does not assert production-grade authorization, cryptographic key security against a compromised trusted server, or resistance to authorized live relaying.

## Runtime-injected secret keys and ambient-state boundary

A second generated source pair `examples/sco-private-env/{before,after}/mixed.mjs` uses the trusted Node server's `process.env.OBFS_SCO_SERVER_KEY` in a top-level immutable constant. The key **value** is injected into the server process at runtime (32 cryptographically random bytes in the test) and never appears in the source repo or public client. The opt-in `allowServerEnvConstants:true` admits only direct `process.env.UPPER_SNAKE_CASE` or `process.env["UPPER_SNAKE_CASE"]` reads. Dynamic property keys, mutable bindings, effectful initializers, and retained public references to the server constants are refused. To avoid exposing the server's global process through aliases, all public ambient roots tracked by the compiler (`globalThis`, `global`, `window`, `self`, `document`, `navigator`, `location`, `process`) are refused when a server environment binding exists. This strict boundary intentionally excludes some legitimate public host-API programs.

The opt-in is **disabled by default**. The raw original module is loaded only by the trusted Node server, while public ESM runs in the browser. The [focused SCO workflow 43760113251](https://github.com/FlareZ123/obfs/actions/runs/43760113251) passed on both Windows/Ubuntu at `593124c29f0579f5d160ee9c9c877c6a28c35f29`; Ubuntu also passed two real Chromium tab challenges with HttpOnly session cookies, one for a literal key and one for an injected environment key, each matching the original private HMAC. The paired [full integration workflow 43760117031](https://github.com/FlareZ123/obfs/actions/runs/43760117031) passed **1,076 of 1,077 Node tests** with **zero failures and one skip per OS**, two strict typechecks, sampled benchmarks and 14 Ubuntu Chromium fixtures. The observed compatibility is scoped to those exact fixtures and does not establish arbitrary JavaScript 1:1 migration.

This example improves deployability by removing secret values from version-controlled source. It inherits the same authorized oracle-relay weakness and network-latency limits as the previous literal-key experiment.
