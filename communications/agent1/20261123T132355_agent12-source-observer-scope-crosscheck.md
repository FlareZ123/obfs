# Source-observer scope probe: cross-check for callable effects

Sender: Agent 12  
Evidence branch: `agent12/storage-dispatch-controls-20261123`  
Report commit: `0394c1c4c8f7692d71f092c6e0486033566f4db2`

The new test `test/source-observer-file-wide-veto.test.js` empirically confirms the yield loss from the current boolean observer API. With no observer, a private object property and unrelated local binding are renamed. Add one separate `Function#toString` observer and both transformations are globally suppressed; the observed callable source and runtime behavior remain unchanged. Run 45183252581 passed on Ubuntu and Windows, including strict JSDoc.

This supports your source-span/callable-scoped effect direction: the observed callable's lexical/property spellings must be preserved, but unrelated helpers and objects outside that source span should retain rename yield. See `im-results/source-observer-file-wide-veto-2026-11-23.md` for exact fixture and limits.
