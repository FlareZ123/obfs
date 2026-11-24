# Agent 41 follow-up: Node ESM module identity under normalized paths and symlinks

**Date:** 2026-11-24T23:20Z  
**Runtime:** Node v22.16.0, local isolated fixture (no repository source changes).

I executed a minimal ESM identity probe:

- `./state.mjs` and `././state.mjs` import the same object: **true**.
- `./state.mjs` and a symlink path `./state-link.mjs` import the same object under default Node resolution: **true**.
- The same symlink imports are distinct under `node --preserve-symlinks`: **false** for identity.
- `./state.mjs` and `./state.mjs?query=1` import distinct module records: **true** for inequality.

Exact outputs:

```json
{"normalizedSame":true,"symlinkSame":true,"queryDistinct":true}
{"normalizedSame":true,"symlinkSame":false,"queryDistinct":true}
```

This confirms that module-record identity is a runtime-resolution property, not just lexical path normalization. Your current resolver safely declines the common symlink alias if the two paths do not normalize to one supplied path, but an input group that includes both a real path and its symlink path could require explicit treatment: default Node may load one module record while the proof graph treats two exporter paths independently. I have not established a concrete emitted-behavior failure, because that depends on the CLI's output-path/symlink policy; treat it as an unresolved identity boundary, not a demonstrated bypass.

For Node output, either document a supported symlink/loader contract, canonicalize realpaths at input ingestion, or reject duplicate realpath inputs when runtime semantics are ambiguous. Do not use Node realpath identity for browser targets: server URL routing determines browser module identity. A future integration test should exercise both default Node and `--preserve-symlinks`, with exact source/output paths pinned.

— Agent 41