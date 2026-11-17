# SCO capability generated ESM in real Chromium (17 November 2026)

**Status:** actual Chromium browser integration green in [Linux Node 22 workflow 44151164627](https://github.com/FlareZ123/obfs/actions/runs/44151164627), immutable executable SHA 5dea4a3bcbd389641a073dc5fd7a8f056f8acff2, plus successful strict SCO-oracle JSDoc in both Linux and Windows; Windows skipped the browser-only step as intended. It is a compatibility and narrow authorization/source-withholding check, not a browser anti-debugging or tamper-resistance theorem.

## Hypothesis and method

A normal headless Chromium tab can import a real HTTP-served SCO public ESM facade, receive a test-only HttpOnly same-origin session cookie, mint a server-private capability handle, execute twelve stateful HMAC digest operations through authenticated browser fetch, revoke the handle and observe the same ordered digest results as the original Node reference function. The browser must never receive the HMAC key, private implementation, server-only canary or private state object.

Reproduction on an Actions/Linux host with Chromium:

~~~powershell
node test/sco-capability-public-browser.js
npx tsc -p jsconfig.sco-oracles.json
~~~

The script dynamically generates a 256-bit private HMAC key, constructs the private ESM, uses partitionScoAsyncModule with server-only initialization to produce a real public facade, and serves it through createScoHandler with principal-keyed capability isolation. A browser page at the same origin sets an HttpOnly SameSite=Strict cookie through a 200 HTML response. The generated ESM module's RPC requests carry that cookie automatically; no attacker-supplied principal in JSON is trusted.

An unauthenticated module fetch and unauthenticated RPC must each produce 403. The test verifies each of twelve stateful digests against a Node reference with the private key, authenticates and revokes a 43-character public handle, and emits the public module's SHA-256 digest. The browser's output is base64-encoded JSON in a DOM pre element and parsed from Chromium's actual --dump-dom output.

## Scope

This proves only that the browser can run the actual generated facade with the server retaining key/state, and that the specific fixture's policy checks work. Chromium DevTools can observe all client source and all actual returned digests; any authenticated client can relay its own allowed requests. HttpOnly cookies prevent direct document.cookie access, but they do not stop a same-session adversary from running fetch or inspecting network responses. The session cookie here is a deterministic fixture, not production authentication. No actual browser compute-budget comparison is made by this test.

The separate Node same-account public-API finite-state clone still succeeds under a different low-state workload. Source secrecy for a cryptographic key and finite-state behavioral learnability are distinct threat-model properties.

## Pinned observed browser result

The Ubuntu Actions job invoked real google-chrome through --headless --dump-dom and returned an actual page-created structured record from the imported compiler facade:

| Test metric | Observed |
| --- | --- |
| Generated public ESM SHA-256 | 59fbed1924b3bcaa3924ee25a9bd79794920bacfb33b6970091a9dbcbdbd0391 |
| Legitimately authenticated browser RPC calls | 14 (begin, 12 step, close) |
| Stateful HMAC digests equal to private native reference | 12/12 |
| Unauthenticated public-file GET | 403 |
| Unauthenticated private RPC | 403 |
| Private key and HMAC implementation in published source | Absent |
| Handle format and revocation | Valid 43-character token, revoke succeeded |
| Cookie setup | HttpOnly; SameSite=Strict |

The key was generated afresh for this process and never printed. The source hash is of the generated **public** facade. The emitted source is independent of the random private key for this input seed, but this experiment only verified its hash at the tested source. The Chromium test was skipped on the Windows runner; only the strict JSDoc check ran there.

**Decision:** The scoped trusted-server handling path is operational in modern Chromium on this exact all-success fixture. It gives a genuine place to keep an HMAC key absent from client source, but a browser with an authorized session can still call the exposed RPC and observe all returned outputs. No actual browser-client performance claim is made. Invalid-input and partial-progress batching equivalence must be tested separately before transforming serial operations into batches.
