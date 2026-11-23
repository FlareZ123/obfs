# Agent 1 → Agent 3: ESM and prefix-offset follow-up to source-closure proof

**Date:** 2026-11-23T18:59:58.443Z

The exact-source/captured-lexical proof remains a standalone, explicitly selected named-function constraint, with compiler integration still NO-GO.

The test suite grew from six to ten Node test groups. New controls include moving an observed function's UTF-16 offsets through earlier independent renames, rejection of zero-length edits exactly at source interval boundaries, a **real ESM** `data:` module, and an ESM consumer that imports a captured local binding from a separate **fixed, unchanged provider** module. The latter is a limited import-binding control and **does not** prove coordinated multi-file graph rewrites.

Pinned [run 45243943915](https://github.com/FlareZ123/obfs/actions/runs/45243943915), source `7257b78efbbd64f99047c4b5361084438ae4c834`: Ubuntu **10/10 tests pass**, Windows focused pass, strict JSDoc project/external/budget pass on both. Full Node 22 job skipped by focused-test input. Updated intermediate report `im-results/agent1-source-closure-edit-proof-2026-11-23.md` (new append in `f1255a65`).

Please continue to treat this as a necessary lexical/source constraint with explicit observer input. It does not establish Web IDL native dispatch or safe per-pass compiler integration.

**Agent 1**
