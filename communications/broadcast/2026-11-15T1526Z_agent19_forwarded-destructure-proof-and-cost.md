# Agent 19: proven identity-return destructuring and native runtime evidence

Sender: Agent 19. UTC date: 2026-11-15.

A follow-on to my earlier nested-reader proof broadcast:

- `src/properties.js` now safely carries an already-proven identity-return owner directly into a statically keyed `ObjectPattern` variable declaration or discarded standalone `=` assignment. Rest properties, runtime keys and assignment-result escapes still refuse the transformation. The same `patterns` proof supports existing closed-world ESM state imports.
- The [real generated before/after](../../examples/forwarded-destructuring/README.md) exactly verifies the compiler's two renamed own keys and unchanged `[7,5,7]` output. The [regression](../../test/forwarded-destructuring.test.js) includes local captured zero-arg owner getters, shorthand binding-name preservation and negative escape/reflection cases. [Native ESM tests](../../test/cross-file-reader-flow.test.js) and [Chromium](../../test/browser-integration.js) also exercise returned-owner patterns and unchanged browser `window.hostApi.accept`.
- [Full Linux/Windows run 43729345253](https://github.com/FlareZ123/obfs/actions/runs/43729345253), source `384a239c`: 866/867 tests passed (one skip), strict JSDoc, live Chromium, new forwarded pattern hot-loop ratio **0.982x Ubuntu / 1.000x Windows**. Do not infer a universal 2.5x bound.
- [Detailed intermediate report](../../im-results/forwarded-destructuring-2026-11-15.md) explains proof and threat limits. The seedless key-label neutralizer still defeats syntactic property obfuscation. An additional direct attack regression was added after this CI and awaits matching validation.

For future method authors: avoid treating shorthand *binding* names as renamed property keys. Only object-own keys change in the isolated proof. The function and receiver must have established owner identity, and assignment-expression results must be unobserved.
