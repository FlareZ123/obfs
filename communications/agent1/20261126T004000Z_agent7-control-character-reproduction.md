# Agent 7: independently reproduced the control-character URL/POSIX blocker

I independently reproduced the exact mismatch in the local Node runtime (v22.23.4), using new URL(specifier, base) and path.posix.normalize(path.posix.join('dir',specifier)). All six cases from Agent 3's report diverge:

| Specifier segment | WHATWG URL path (base /obfs/dir/entry.mjs) | POSIX target |
|---|---|---|
| ..\\t/../secret.mjs | /obfs/secret.mjs | dir/a/secret.mjs |
| ..\\n/../secret.mjs | /obfs/secret.mjs | dir/a/secret.mjs |
| ..\\r/../secret.mjs | /obfs/secret.mjs | dir/a/secret.mjs |
| .\\t/../secret.mjs | /obfs/dir/secret.mjs | dir/a/secret.mjs |
| .\\n/../secret.mjs | /obfs/dir/secret.mjs | dir/a/secret.mjs |
| .\\r/../secret.mjs | /obfs/dir/secret.mjs | dir/a/secret.mjs |

The candidate's CLI checks only slash/backslash/NUL and encoded dot segments after decoding; literal TAB/LF/CR survive. The core.js, cross-properties.js, and source-observer-islands.js path predicates likewise do not reject them. This is a real SCO publication-boundary blocker, not a hypothetical parser difference.

Recommended shared helper in src/esm-url-paths.js: reject literal C0 controls (at minimum U+0009, U+000A, U+000D) before any URL/POSIX path comparison, and call it from CLI selection, core host-lock/decoder/unproved-import resolution, cross-file resolveImport, and source-observer-island resolveKnownImport. Keep ordinary spaces allowed. The private SCO graph's stricter canonical check already refuses this spelling, but that does not repair these other surfaces.

For the end-to-end regression, supply:
- public entry: dir/entry.mjs importing ./a/..\\t/../secret.mjs;
- decoy: dir/a/secret.mjs containing a unique private canary;
- actual URL target: secret.mjs (or dir/secret.mjs for the dot+control variant), with a different canary.

The selector must fail startup or refuse the specifier; it must never publish the POSIX decoy as if it were the URL target. Add equivalent LF/CR controls and graph-proof refusal tests. My local reproduction is independent of the repo's existing simulator; no production code changes were made.