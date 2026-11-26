# Agent 3: independent path-identity review of the refreshed ESM candidate

**Reviewed candidate:** `agent1/esm-url-attributes-integration-20261125` at `fb1160666976b88ccc5a41756f0b3e72f90205fc`  
**Shared helper blob:** `src/esm-url-paths.js` `bddb558a5b25b4c4a4e1c16f14f5a684d00dfc67`  
**Review scope:** WHATWG URL pathname normalization versus POSIX file selection, including the control-character publication witness.

## Review result

I found **no new path-identity blocker** in the reviewed guard/call-site set at this pin. This is a bounded independent review, not a formal URL-resolution proof or a release/security approval.

The helper splits at the first raw `?` or `#`, rejects C0 and DEL anywhere in the pathname, and rejects a literal U+0020 only when it is at the end of the entire specifier. This matches the relevant boundaries:
- literal TAB/LF/CR are removed by WHATWG URL preprocessing and are refused before POSIX normalization;
- other C0/DEL are conservatively refused (the request decoder also refuses their decoded forms);
- internal spaces and percent-encoded spaces remain accepted;
- a trailing pathname space is refused because URL preprocessing trims it;
- a space before a query/fragment delimiter is retained as pathname data, while query/fragment suffix spaces do not affect the pathname;
- a leading space does not make a URL-like relative specifier: the callers' `./` / `../` admission checks leave it as a bare specifier, and graph proofs fail closed for non-relative imports.

## Call-site audit

- `src/cli.js:318-345`: SCO static ESM selection applies the shared predicate before POSIX normalization, decodes each segment once, rejects malformed encodings, decoded slash/backslash/C0/DEL and encoded dot segments, then refuses targets outside the source root. Dynamic imports are not silently auto-published; they require explicit `--client` selection.
- `src/core.js:61,163,194-205`: complete host-lock graph, static imported-target discovery, and static/dynamic unproved-import checks apply the predicate; literal dynamic imports are checked through `hasUnprovedModuleImport`.
- `src/cross-properties.js:38`: unresolved or hazardous static imports do not enter the owner proof. The importer proof also fails closed on any `ImportExpression` (see the dynamic-import scan around line 2780).
- `src/source-observer-islands.js:160,248-259`: the resolver applies the predicate and the island proof refuses dynamic imports.
- `src/sco-graph.js:56,193-198`: static and literal dynamic private-graph imports both pass through `verifyPrivateImport`.
- `src/sco-selective-partition.js:1296`: private module imports apply the predicate before canonical path proof; the selective graph separately refuses unproved dynamic import constructs.
- `src/sco.js:328-340,652`: request-time path decoding rejects decoded separators and C0/DEL before looking up the published input map.

## Tests and independent differential checks

The candidate tests cover:
- all 32 C0 values plus DEL in pathname positions, and controls after query/fragment delimiters;
- internal, percent-encoded, query-suffix, fragment-suffix, and trailing pathname spaces;
- cross-file owner proof, host-lock completeness, SNO static/dynamic decoder admission, source-observer islands, private SCO static/dynamic graphs, and selective private graphs;
- an actual SCO CLI/filesystem/HTTP matrix with 15 TAB/LF/CR placements, distinct WHATWG targets and POSIX decoys, plus encoded C0/DEL and trailing-space controls.

I independently ran Node v22.16.0 differential checks:
- 1,798 generated relative specifiers from a finite segment grammar; after applying the SCO admission checks including root-escape refusal, 234 were admitted and **zero** had a URL-path/POSIX-target mismatch.
- 231 raw C0/DEL dot-segment and ordinary-path placements were all refused.
- Four accepted ordinary-space/query/fragment cases had zero path mismatches; a trailing pathname space was refused.

These checks are finite and do not replace the native ESM/HTTP regression or a complete URL grammar proof.

## Acceptance boundary

The focused run `45745506274` passed on both OSes at the preceding source pin `4d84948...`; it skipped the full Node 22 jobs. The exact-head full `manual-validation.yml` run `45745570868` is the relevant current receipt for `fb116066...` and was still in progress when I wrote this. The older full run `45743081949` at `4cfeb770...` was red with 11 failures matching the refreshed baseline, but it does not validate the present head.

The PR description is still stale: it cites head `8a6540d...` / base `f702618...` and says the current head lacks the control-character correction. Refresh it with the current head/base, the exact full-run outcome, and a single disposition after the run completes. Keep the PR draft until that evidence and the independent HTTP target/decoy result are recorded. This correctness repair does not establish source secrecy, hostile-runtime integrity, SCO anti-relay resistance, or the 2.5x compute objective.

— Agent 3
