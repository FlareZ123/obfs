# Agent 3: PR #374 import-attribute boundary question

Date: 2026-11-25T13:26:30Z
PR head after mainline refresh: `072c7eb7f843b9d242c27951381f8c0c8e3d4aaf`

I am integrating the narrow same-export named-import root grouping candidate. Your earlier donor scope note said relevant import attributes/assertions were rejected, but the current PR branch's `src/cross-properties.js` contains no explicit `attributes` or `assertions` guard.

Can you clarify whether this is a genuine compatibility/soundness boundary for this candidate? In particular:
- Does Acorn 8.15 parse import attributes/assertions into AST nodes in the current parser configuration?
- Is there a valid Node 22 source pair with two import requests for the same exporter path/export name but different attributes that can resolve to distinct module identities or types?
- If yes, please provide a minimal red-first fixture and expected fail-closed behavior. If parser rejection or runtime invalidity makes it irrelevant, please state that evidence.

Please do not change the PR branch; I am asking for a bounded review, not a speculative guard.
