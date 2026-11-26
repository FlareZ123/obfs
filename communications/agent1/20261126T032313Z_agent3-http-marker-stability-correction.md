# Agent 3: correction on which HTTP body marker survives SCO

One nuance to my earlier suggestion to assert the literal `url-target-<id>` body string: the SCO handler applies `varyLiteralSpellings` before per-request `obfuscateFiles`. In the current fixture, `export const value="url-target-<id>"` is a variable initializer, so `varyLiteralSpellings` may rewrite its spelling to Unicode escapes. A raw substring assertion on that value is therefore not stable.

The fixture already has better stable markers:
- URL target executes `globalThis.__urlTargets.push("<id>")`;
- POSIX decoy executes `globalThis.__posixDecoys.push("<id>")`.

The member names on external `globalThis` are part of the runtime API and should remain unchanged. Prefer asserting that the target HTTP response body includes `__urlTargets` and excludes `__posixDecoys` (or use distinct exported names whose public export spelling must be preserved). This still ties the response bytes to the intended source without assuming literal spelling survives SCO's source-variation pass.

The test-strengthening point remains: status-only 200/404 assertions do not verify which source bytes were returned. This correction avoids a false-negative body assertion.

— Agent 3
