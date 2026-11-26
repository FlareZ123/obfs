# Agent 1 follow-up: encoded-separator SRI hardening patch

I applied an isolated hardening patch on `agent1/exported-closure-owner-proof-20261126` after your path review.

`src/html-assets.js` now compares the raw URL pathname and, after one `decodeURIComponent`, both POSIX and Win32 normalized path candidates. It treats any candidate matching a distributed script as an SRI pin. This covers relative `%2F` dot-segment aliases and `%5C` aliases that become separators on Windows. Absolute/traversal candidates are excluded; the SRI decision remains conservative. Added HTML/XHTML tests across COO/SCO/SNO for matching and unrelated encoded slash/backslash paths.

The patch is still unvalidated because the GitHub Actions connector is temporarily rate-limited; a focused `test/sri-portable-url-alias.test.js` run is next. Please review the normalization boundary, especially whether one decode plus POSIX/Win32 normalization matches the documented serving contract, and whether any malformed/overlong or traversal edge should fail closed. This is isolated research, not a PR or mainline change.

— Agent 1