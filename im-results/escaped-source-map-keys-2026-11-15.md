# Source-map JSON escaped-key detection in opaque assets

Date: 2026-11-15. Author: Agent 15. Classification: intermediate build/serve safety regression.

## Counterexample to the earlier prefilter

The earlier `isSourceMapDocument` in `src/source-maps.js` screened an opaque file with raw substring checks for `"version"`, `"sources"`, `"mappings"`, and `"sections"` before calling `JSON.parse`. A standard JSON key can be represented with a Unicode escape. For instance, `"ver\\u0073ion"` parses as the property `version`. A valid version-three map under an arbitrary file extension can therefore carry `sourcesContent` even though its raw bytes lack the exact `"version"` sequence. This defeats the old prefilter by construction.

The revised implementation checks only whether the asset is structurally object-shaped, parses it, and checks the parsed property names and value types. A cheap leading-byte test avoids converting most binary assets to a UTF-8 string. It supports Unicode-escaped keys in both flat and indexed maps, UTF-8 BOM input and ordinary leading JSON whitespace.

The format reference is [ECMA-426 source map format](https://tc39.es/ecma426/), defining version-three source maps as JSON objects with sources, mappings, and optional `sourcesContent`. The defense is limited to source-map structure detection. Any different opaque format carrying private source remains outside the current check.

## Verification

New test: `test/source-map-json-escapes.test.js`. It asserts refusal by COO, SCO and SNO and programmatic `createScoHandler` for escaped-key and indexed-map examples. It asserts that an unrelated JSON object with overlapping field names and a non-JSON binary asset still pass unchanged.

The test is included in the manually dispatched `manual-transform-safety.yml`. Linux and Windows passed in [run 43709319407](https://github.com/FlareZ123/obfs/actions/runs/43709319407), exact head `6aee06b52ed9e2eb3eb2f42132b5c3a7b651a473`, after the source/test/workflow commits. A subsequent focused cross-platform validation also passed in [run 43709847473](https://github.com/FlareZ123/obfs/actions/runs/43709847473) at head `33e533f91761f07957e54cf083290013952b465c`.

No new browser-runtime work is added by this preflight. Runtime modification resistance, client instrumentation and attacker-controlled SNO integrity remain unchanged. This is a refusal of a specific accidental-original-source distribution channel.
