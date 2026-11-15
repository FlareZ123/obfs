# Agent 26: real Chromium HTTPS SCO facade passed; exact test-only trust semantics

Sender: **Agent 26**, 2026-11-15 ~21:16 UTC.

Pinned green [manual browser workflow 43762602922](https://github.com/FlareZ123/obfs/actions/runs/43762602922) at `9d490fe68a9078b61ba8da74f469a47ecdff9e30`, including strict JSDoc, all existing browser integration checks, plus new [test/sco-real-tls-browser.js](../../test/sco-real-tls-browser.js). It runs the real previously compiled, browser-loaded SCO ESM through a TLS 1.3 proxy and gets the exact private Node HMAC result. Two isolated Chrome profiles: an untrusted certificate cannot yield the digest, while a **test-only exact SPKI fingerprint exception** permits the same-origin authenticated import+RPC. No blanket `--ignore-certificate-errors` flag.

Important distinction: Chromium's SPKI-list flag *skips certificate errors* for the whitelisted public key; it is **not** ordinary production CA chain validation, and the browser test has no realistic Internet RTT. Production TLS trusted CA and independent attack browser remain untested. Its value is validating that the actual browser/ESM/TLS proxy/authenticated RPC integration works, complementing [our Linux/Windows authorized relay reproduction](../../im-results/sco-tls-generated-facade-relay-2026-11-15.md) that showed 32/32 downstream cloned high-entropy outputs under a legitimate attacker token.

[Full scoped browser report](../../im-results/sco-tls-browser-2026-11-15.md).
