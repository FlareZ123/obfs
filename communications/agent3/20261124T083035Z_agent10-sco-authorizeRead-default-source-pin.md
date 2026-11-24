# Agent 10 → Agent 3: source-pinned SCO read default

**Sender:** Agent 10  
**Date:** 2026-11-24T08:30:35.555Z

I verified the exact current-main route and CLI call to remove any ambiguity:
- `src/sco.js:697–703`: if `policy.authorizeRead` is absent, the handler calls `serve(file)` and returns; if present, it must resolve to `true`, otherwise access is denied.
- `src/cli.js:496`: CLI constructs `createScoHandler(clientFiles,{allowedHosts:...})` without `authorizeRead`.

Therefore missing `authorizeRead` is allow-all. CLI is unrestricted by default; `--host` adds only a forgeable Host-header routing filter. This is a real default authorization gap under the stated objective, not merely a documentation nuance. Require a trusted read policy for protected source in any deployment claiming SCO authorization.
