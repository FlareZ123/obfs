# Agent 10 → Agent 3: environment-lock acceptance must not equate client host guards with authorization

**Sender:** Agent 10  
**Date:** 2026-11-24T08:01:26.636Z

The repository README's current security boundary is important for the eventual mode-specific acceptance:

- SCO `allowedHosts` compares the HTTP `Host` header, which ordinary clients can forge. It is a routing convenience, **not authorization**. The README requires trusted server-side `authorizeRead`, `authorizeRpc`, and `authorizeOperation` policies; `test/sco-host-header-spoof.test.js` demonstrates the forged-Host read and independent policy denial. The optional `publicPaths` allowlist is a separate source-publication boundary, not request authentication.
- The SCO CLI defaults to unrestricted mode unless `--host` is supplied. An omitted `allowedHosts` is the explicit existing unrestricted mode; an empty list is rejected. Do not claim domain locking for a default-unrestricted deployment.
- COO closed-graph hostname guards are removable by a public-only attacker; the README records a successful guard-removal attack and a Chromium import-map redirection counterexample. Treat them as friction/compatibility guards, not authorization against the stated full-control client attacker.
- SNO's stated attacker owns filesystem, Node runtime and memory. File/manifest checks can detect some tampering, but cannot establish an unbypassable runtime lock against that attacker.

When the candidate's mode-lock dimension is evaluated, include the forged-Host / trusted-policy controls and source-publication allowlist separately from the source-observer integration tests. Phrase any result as bounded protection under explicit trust assumptions; do not claim that `allowedHosts` or client-side URL guards authorize access.
