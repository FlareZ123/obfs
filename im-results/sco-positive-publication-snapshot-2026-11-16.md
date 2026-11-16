# SCO positive publication boundary and immutable asset snapshot

**Author:** Agent 5. **Date:** 2026-11-16. **Status:** Implemented, bounded intermediate evidence; no established cryptographic security claim.

## Problem and goal

The opt-in `privateModuleSources` compiler analysis can discover and deny one statically inferred private ESM graph. Its result cannot prove completeness for custom/dynamic loaders or independently supplied source-file lists. If the server developer unintentionally passes a private implementation file to `createScoHandler` but never included it in a private graph manifest, the handler previously served that file.

Separate from manifest membership, the SCO handler accepted mutable Node `Buffer` objects for static assets and validated content at setup. Its internal normalized file list retained the same mutable Buffer reference. A caller later mutating an alias could change the bytes delivered by GET *after* the source-disclosure preflight. This could invalidate a source-map audit or change ostensibly immutable content. This is a trusted-deployment/source-handling concern, not compromise of an attacker-controlled remote server.

## Implementation

**Exact positive allowlist:** `createScoHandler(sourceFiles,{publicPaths:[...]})` adds a build-time positive publication boundary. The allowlist must match every intentionally served file exactly, including CSS/image/other assets. Both the allowlist and source group are checked with `safePath`; case-insensitive duplicate path aliases, noncanonical spellings, extra source files and missing public declarations cause a startup exception. The opt-in is independent of the inferred `clientFile.privateModulePaths` denylist and is configured from an independent, reviewed public manifest. Omitting `publicPaths` preserves existing behavior.

This does not save operators who explicitly approve private bytes in both the manifest and `sourceFiles`, prevent leakage on separate server routes or supply access control to the published files. RPC authorization is still performed by the caller's `authorizeRpc`/`authorizeOperation` policies.

**Immutable asset bytes:** For every supplied Node `Buffer` source, the handler now copies the bytes with `Buffer.from` before source-map preflight and publication. The snapshot is owned by the handler; subsequent changes to the caller's Buffer, including `subarray()` aliases, do not alter the served bytes. Immutable string inputs retain the old path. This incurs a one-time memory copy proportional to the sum of Buffer assets; it adds no per-request asset copy. There is no guarantee against other runtime compromises of the trusted server.

## Reproducible real HTTP witnesses

- [Positive source allowlist suite](../test/sco-public-file-allowlist.test.js) generates a true mixed ESM SCO client facade with only `private/engine.mjs` as a known dependency. The legacy handler, when also supplied an unrelated unlisted `private/unlisted.cjs`, really returns HTTP **200** with the `PRIVATE_SOURCE_SHOULD_NOT_BE_PUBLISHED` canary. The same input with `publicPaths:['entry.mjs']` raises a startup refusal before serving. The tests also cover public assets, partial/extra allowlists, duplicates and noncanonical names.
- [Buffer alias suite](../test/sco-asset-buffer-snapshot.test.js) constructs the handler with a safe CSS Buffer, mutates the original through `subarray.fill(0x58)` after setup, then performs a real HTTP GET. The delivered bytes must still be the exact reviewed CSS. A second test shares one caller Buffer between two public JSON paths, mutates it after setup and confirms each response remains unchanged. A string-asset positive control remains functional.
- [Genuine HMAC before/after sample](../examples/sco-private-graph/README.md) retains the exact compiler-emitted `after/mixed.mjs` and now invokes the authentic HTTP integration with `publicPaths:[generated.clientFile.path]`. This is a server-only boundary addition and does not change the client facade's source.

## Validation

The focused cross-platform SCO authorization gate [run 43801547979](https://github.com/FlareZ123/obfs/actions/runs/43801547979) at exact SHA `327a3451fc33c2a84db19dafa1e4ce709e5c103f` passed both Ubuntu and Windows including positive-allowlist test, SCO profiles, real Chromium where applicable, and strict JSDoc. The later [run 43801884402](https://github.com/FlareZ123/obfs/actions/runs/43801884402) at exact SHA `244a2dcc563f8adf343287e0dd3814cb20971506` passed the same matrix after including the Buffer snapshot regression. The latter source does **not** include subsequent documentation edits or the extra allowlist in the older three-file HMAC example test. Those changes are minimal but still require a new pinned integration run if claiming them validated.

## Security-performance decision

- **Static source exposure:** prevents two documented accidental disclosure classes within the SCO handler under trusted deployment assumptions.
- **Dynamic/runtime extraction:** no protection against inspecting all public client bytes or authorized RPC responses.
- **Tamper resistance:** protects owned immutable asset snapshots against mutation by application references, not hostile in-process mutation or replaced server binary.
- **Execution outside authorized environment:** no improvement against authenticated relaying.
- **Compute:** new allowlist membership checks and Buffer copies execute only at trusted-server initialization, which the primary task explicitly excludes from the SCO runtime multiplier. No measured end-to-end 2.5x guarantee follows.
- **Compatibility:** opt-in `publicPaths` defaults off; existing Buffer assets now use private bytes snapshot, preserving bytes at construction.

All observations belong in `im-results/`. Do not promote this implementation to a general obfuscation-security theorem. The more powerful application-level attacker can clone permitted SCO RPC outputs through an online relay even when source privacy and route allowlists are configured correctly.
