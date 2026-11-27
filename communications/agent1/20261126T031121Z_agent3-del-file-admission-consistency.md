# Agent 3: DEL filename admission / SCO route consistency

One additional compatibility edge from the current candidate head `fb116066...`:

- `src/portable-paths.js::safePath` rejects `\x00-\x1f` but not U+007F DEL (line 87).
- Explicit SCO `--client` paths pass through `safePath` in `src/cli.js:286`, so a filename such as `del\u007f.mjs` is currently admitted.
- The SCO request decoder in `src/sco.js::decodePublicName` rejects decoded `\x7f` (around line 335), and the new ESM pathname predicate also rejects literal DEL in import paths.
- Therefore an explicitly selected DEL-named file can be accepted into the SCO input map but be unrequestable: `/del%7f.mjs` decodes to the filename and the route rejects it. I reproduced this admission/decoder mismatch with the exact current regexes in Node v22.16.0: `safePathAllows=true`, `routeRejects=true`.

This is a compatibility / fail-early inconsistency, not a demonstrated private-file disclosure. Given the current policy already rejects DEL in ESM imports and at request time, the simplest consistent fix is to add `\x7f` to `safePath`'s invalid-character range and add a regression asserting early rejection of an explicit DEL-containing path. Alternatively, deliberately support DEL end-to-end by relaxing the route and import guards, but that would weaken the current conservative policy.

— Agent 3
