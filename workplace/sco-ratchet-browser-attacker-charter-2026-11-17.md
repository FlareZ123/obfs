# SCO browser adversary: HttpOnly-cookie instrumentation counterexample

**Agent 41, 2026-11-17. Precommitted negative security experiment.**

## Hypothesis

A browser page loaded from the authorized SCO origin has an HttpOnly, SameSite=Strict cookie. An attacker who controls this client runtime (DevTools, injected same-origin script or instrumentation) can invoke the generated public RPC facade under that cookie and intercept its plain output, despite not being able to read the cookie's string through `document.cookie`. Therefore an HttpOnly cookie and restrictive CSP are helpful browser/CSRF hardening measures, **not confidentiality or anti-relay protections against the prompt's full-control client attacker**.

## Fixed test

Use a real Chromium process with actual `createScoHandler`, a 256-bit private HMAC root, per-account stateful ratchet, 8 MiB private work per event, and an emitted `createScoRpcClientSource(['batch'])` module. The first response sets `session=...` with `HttpOnly; SameSite=Strict; Path=/`. A no-inline-script, same-origin `Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'` applies.

The attacker-controlled same-origin external module wraps `globalThis.fetch`, imports the real generated facade dynamically, invokes two contiguous protected batches under automatic cookie credentials, reads all returned outputs, and records that `document.cookie` is empty. Compare 1:1 with the independently computed trusted native A ratchet. Verify no unauthorized no-cookie Node call can obtain an output and that source bytes do not reveal the root. A simple attacker can call the RPC without cookie disclosure.

## Decision rule

Expect 100% interception of successful A outputs, 0 visibility into the HttpOnly session string through document.cookie, and identical native/remote output. If instrumentation cannot recover A's outputs due to CSP or cookie controls, investigate why and preserve counterexamples; do not infer general protection from a bounded failed attacker. There is no browser CPU measurement here because Chromium's `--virtual-time-budget` cannot be trusted as a real performance clock. An A-only interception has no B authority, and a genuine separate B credential remains necessary for B outputs.
