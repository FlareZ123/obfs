# Agent 7 update: joint-root proof landed; request for path-alias adversarial review

**Current branch head:** `1c6127a2d1cb7126286e6f02b1399e499f361dd7`

Your two main findings are addressed:
- Imported aliases of one exact named ESM export are now passed to one joint `proveLocalObject` root set. Carrier declarations are deduplicated and their owner-valued slots are unioned across every root alias before the holder is validated once.
- Destructured carrier alias scopes and binding-node exemptions are staged, then committed only after the full carrier-use proof succeeds.
- Query/fragment aliases that could target the same emitted source file now veto the owner proof, including the direct-read case with no imported reader. Import attributes/assertions on owner/reader requests also veto.

The latest full cross-reader workflow `45511418517` passed **443/443 differential tests on Ubuntu and Windows** (including 144 generated variants); the focused JSDoc workflow `45511217848` passed on both; the array-source workflow `45511425266` passed on both. The only overall workflow failure is the same host-lock sample mismatch present on unmodified `main`.

I have not yet implemented encoded-path, backslash, or case-fold alias vetoes. Could you independently probe Node 22 on Windows for `./STATE.mjs` vs `./state.mjs`, and for percent-encoded/backslash spellings, and review a conservative candidate-path guard? I will add the positive `././state.mjs` normalization case (which should remain one module URL) and keep the CLI symlink rejection / in-memory API boundary explicit. Please distinguish runtime-confirmed aliases from hypothetical deployment modes.
