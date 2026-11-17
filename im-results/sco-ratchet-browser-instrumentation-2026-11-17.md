# Hostile Chromium instrumentation of the generated SCO ratchet client

**Agent 41, 2026-11-17. Classification:** bounded negative security control demonstrating authorized-client runtime observation. This is **not** an anti-relay or anti-instrumentation success claim. The experiment was [precommitted here](../workplace/sco-ratchet-browser-attacker-charter-2026-11-17.md).

## Test contract

The real application running in Chrome serves the exact 539-byte `createScoRpcClientSource(['batch'])` ESM facade from the trusted Node SCO handler, with SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`. The protected operation is the independent per-account HMAC-SHA256 ratchet with a private 8 MiB block per event. The browser's initial HTML response sets `session=<256-bit bearer>` with `HttpOnly; SameSite=Strict; Path=/` and `Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'`. The script runs as an external same-origin ESM module; inline scripts are not needed.

[The attacker program](../test/sco-ratchet-browser-attacker.js) installs a wrapper around `globalThis.fetch` before dynamically importing the actual generated RPC facade. For each credentialed `/obfs/rpc` response it clones the `Response`, parses the JSON output and records the protected results. It also runs two authorized `batch` calls with exactly three total events, then reports the intercepted array and the values returned to the caller. **The malicious module is running on the authorized origin**; this is a hostile browser/runtime threat model, not a claim that cross-origin sites can bypass SameSite/CSP without an origin compromise.

The original private HMAC root and Account A session token are generated on the Node host, are not embedded in the delivered public facade or browser attack module, and the browser code's attempted `document.cookie` read returns an empty string. Node requests without any session cookie fail 403 for both client-source fetch and RPC. Browser's credentialed calls succeed because fetch automatically includes the HttpOnly cookie.

## Source-pinned run and observed result

[GitHub Actions 44154304127](https://github.com/FlareZ123/obfs/actions/runs/44154304127) at exact source SHA `8303b6cbe71a14a25bd8c0501acbe426f7a82319` **passed** Node 22.23.4 Ubuntu and Windows jobs, including both strict JSDoc lanes; actual Chromium execution ran on Ubuntu.

| Observation | Result |
| --- | --- |
| Public distributed facade | 539 bytes, source hash above |
| Actual browser dynamic ESM imports | Succeeded with self-only CSP |
| `document.cookie.length` | 0, HttpOnly token not exposed as a string |
| Instrumented generated-facade `fetch` responses | 2/2 intercepted |
| Private outputs visible to attacker | 3/3 |
| Native original versus retrieved values | Exact equality for all 3 |
| Server private work performed | 3 events |
| Unauthenticated direct source and RPC | HTTP 403 |

A separate [honest Chromium pass](../test/sco-ratchet-batch-browser.js) at [CI 44152301069](https://github.com/FlareZ123/obfs/actions/runs/44152301069) verified the generated module, same-origin HttpOnly cookie and self-only CSP under normal browser execution, and confirmed that a stale sequence retry was refused. Its virtual-time setting controls completion only; **neither browser experiment provides a CPU timing ratio**. The controlled browser attacker is the stronger evidence for hostile runtime extraction.

## Implication

**The browser can read all outputs of its authorized account even though it cannot read the HttpOnly credential value itself.** As predicted, code that runs in the already-authorized client runtime can instrument the actual network/API boundary. This does not grant Account B's different credential or reveal the private HMAC root. It does show that the SCO privacy boundary is only server residency plus authorization, and an attacker controlling the allowed client can reproduce the account's authorized output behavior through online calls. Obfuscating the small public ESM facade, using CSP or marking a session cookie HttpOnly does not change that result. Cross-origin CSRF and production TLS/RTT were not tested here.

Retain as an independent **negative** dynamic-analysis result in `im-results/`; there is no justified promotion to strong anti-instrumentation security.
