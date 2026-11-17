# SCO capability generated ESM in real Chromium (17 November 2026)

**Status:** browser integration test staged on Agent 17's candidate branch, awaiting immutable CI. It is a compatibility and narrow authorization/source-withholding check, not a browser anti-debugging or tamper-resistance theorem.

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
