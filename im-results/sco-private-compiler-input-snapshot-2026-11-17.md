# Selective SCO private-source snapshot consistency

**Date:** 2026-11-17. **Agent:** 35. **Status:** bounded compiler correctness fix with executable regression; cross-platform validation pending at the first checkpoint.

## Problem and attack model

`partitionScoSelectedAsyncExports` accepted JavaScript objects for the mixed entry and `privateModuleSources`. The private graph scanner read each dependency's `code` separately from the digest builder; both also re-read `path` and the source-array option. An accessor-backed input could return a benign ESM module during static closure analysis and a different module during SHA-256 commitment construction. A caller that invoked the optional `verifyScoPrivateSourceDigests` against the later bytes could receive a passing preflight for code **not inspected** by the static closure. This is a compiler-input provenance failure, rather than a break of SHA-256.

The deterministic witness uses a private `engine.mjs` getter returning source with no imports on its first two reads. On the subsequent read it returns source that statically imports `./deep/secret.mjs`. The old scanner analyzed the first source, while the digest step committed to the second. The resulting private-file list omitted `private/deep/secret.mjs`, so accidentally handing that leaf to `createScoHandler` would not trip the claimed complete-graph route guard. The existing trusted-server preflight would also accept the later engine bytes. This mismatch requires an inconsistent source object supplied to the trusted compiler. It is not a client-side bypass of a genuinely trusted, immutable compiler input.

## Change

At compiler entry the mixed file's `path`, `code` and `sourceType` are captured once into an ordinary record. The `privateModuleSources` option is read once and every source element is copied into a plain `{path,code}` record using `Array.from`. The static ESM closure and digest generation use these same copied primitive strings, excluding source-array-specific overridden `map` methods and mutable accessors from subsequent internal reads.

The regression `test/sco-private-source-integrity.test.js` uses changing getters for the main module, private dependency and graph-array option. It asserts one read each, a generated manifest reflecting the audited graph, a successful verifier check for the exact audited bytes, and rejection when either deployed source changes. A custom source-array `map` method that throws must remain unused. These are deterministic checks of the input snapshot contract.

## Scope and security impact

- **Publication / deployed-byte admission:** The optional transitive private-source audit and optional startup digest verifier now share the same compiler-observed source bytes under their documented trust assumptions.
- **Static and dynamic deobfuscation:** No new resistance is claimed. The trusted-server private graph is still undistributed in a properly configured SCO deployment; any public client can be instrumented.
- **Authenticated functional cloning:** Unchanged. A legitimate client can relay authorized RPC output to another endpoint. See `sims/sco-private-graph-relay.js`.
- **SNO / COO:** No change; this patch touches only the selective SCO compiler.
- **Runtime budget:** Snapshotting happens during compilation, on the trusted server. Normal primitive-string compiler input yields the same generated client operations. No request-time code or new client work is introduced; a measured end-to-end universal 2.5× guarantee does not follow.

The compiler does **not** verify trust in the initial source contents. A getter can still return malicious source on its *single* allowed read, which is then audited consistently. Runtime loaders and opaque host effects remain outside this syntactic closure contract. A caller that omits the optional startup verifier, publishes unrelated private source outside `createScoHandler`, or changes deployed files after verification retains those independent exposure risks.

## Evidence and status

- Changed compiler: `src/sco-selective-partition.js`; test: `test/sco-private-source-integrity.test.js`.
- API usage and explicit opt-in verifier documentation: `docs/SCO_PARTITION.md`.
- The first CI attempt was cancelled after the additional plain-array snapshot improvement, avoiding a superseded run.
- Consolidated manually dispatched Linux/Windows SCO authorization and strict JSDoc workflow: [run 44048701152](https://github.com/FlareZ123/obfs/actions/runs/44048701152), pinned at exact checkout SHA `00fc30b472e4c47f837bbfbfc39ac9d72140f921`. At initial report creation it was **queued**, so no CI success is claimed.

The report belongs in intermediate findings. It establishes a narrow, reproducible source-provenance safety contract once the test gate passes; it is not a new cryptographic obfuscation result.
