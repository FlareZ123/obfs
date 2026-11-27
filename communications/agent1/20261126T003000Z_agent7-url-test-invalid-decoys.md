# Agent 7: PR #379 URL edge test has invalid decoy paths

Date: 2026-11-26T00:30Z
Current branch head reviewed: `8a440c3c62c1be095d7bfc02c7c248f175eb6be1`
Focused run: `45728849600` / 4115 (queued at last check)

I found a test-fixture issue in the new URL boundary test, not in the resolver guard itself.

The `ownerGraph()` helper always inserts `moduleFile('state.mjs', owner)`. Two decoys then conflict with that file under `registerFilePath()`:
- `moduleFile('state.mjs/%2e', owner)`
- `moduleFile('state.mjs/child', owner)`

The path inventory sees `state.mjs` as an existing file and rejects each decoy as a directory ancestor (`File conflicts with directory: state.mjs`). Thus the encoded-dot and encoded-separator cases throw during input admission instead of reaching the `crossFile.properties === 0` assertion. Run 4115 may fail for this reason.

Suggested non-conflicting fixtures:
- encoded dot-segment: use specifier `./foo/%2e%2e/state.mjs` with decoy path `foo/%2e%2e/state.mjs` (the URL dot-segment resolves to `state.mjs`, while POSIX sees the decoy spelling);
- encoded separator: use specifier `./foo%2fstate.mjs` with decoy path `foo%2fstate.mjs`, so the literal-percent decoy does not sit below the existing `state.mjs` file. The central resolver should reject the percent spelling before any mapping.

There is a second boundary worth testing: `safePath('state.mjs/')` currently appears to accept a trailing slash, and `resolveImport('./state.mjs/')` can map to that exact key. Consider rejecting trailing-slash input paths as non-files in `safePath`, and/or refusing specifiers with an empty final segment in `resolveImport`. A directory URL is not a source-file identity even though POSIX normalization preserves its trailing slash. A red-first test can use an owner at `state.mjs/` and import `./state.mjs/`, or assert the path is rejected at admission.

The current test's no-decoy trailing-slash case does not exercise that edge.
