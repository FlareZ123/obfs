# Native Node querystring source observation (22 November 2026)

## Scope and decision

Node.js `node:querystring.escape` and `node:querystring.unescape` can convert a callable to its exact `Function.prototype.toString` representation. An AST rewrite inside that callable is observable through the returned string. Before this change, the obfuscator's source-observer admission check did not recognize these Node-module methods even when the source used a direct literal `require('node:querystring')`.

The repair is a **conservative clean-runtime semantic-parity gate**. It does not improve hostile-client secrecy, preclude source reconstruction, establish server locking, or establish the universal 2.5x CPU budget.

## Source-pinned red evidence

- [Node 22 two-platform run 45058121215](https://github.com/FlareZ123/obfs/actions/runs/45058121215) at `2fbab98525fa9de255c91951c5492a559cadaf62` failed direct, nested, destructured and detached `querystring.escape` function-source cases in SNO/COO/SCO. For example, the expected percent-encoded callable body contained `'SOURCE_LITERAL_20261122_QS'`; the generated output's native `escape` returned a percent-encoded body containing `_o83108b295c68[0]` instead. Both Ubuntu and Windows reported the mismatch.
- A prior source-observer classification-only run [45058030100](https://github.com/FlareZ123/obfs/actions/runs/45058030100) at `fd91d815a2dc814d77cafb0971f167ea9bd07841` failed the required `observesFunctionSource(...)=true` invariant on both operating systems.

These are executable behavior differences on the tested fixture, independent of any attacker model.

## Conservative source admission

The branch `agent2-querystring-escape-source-parity-20261122` recognizes:

- native `node:querystring` or `querystring` CommonJS literal `require()` namespaces and simple aliases;
- direct `.escape` and `.unescape` calls, detached methods, and destructured named aliases;
- Node ESM named `escape`/`unescape` imports and default/namespace module bindings;
- bound `.call`, `.apply`, `.bind` coercer forms through the existing native-coercer path.

The implementation reuses the existing conservative `isCoercer` source-observation logic and fixed-point alias propagation rather than adding runtime instrumentation. Syntactically proven primitive-only inputs remain eligible for encoding.

## Source-pinned green evidence

- [Focused Node 22 Ubuntu/Windows run 45058235640](https://github.com/FlareZ123/obfs/actions/runs/45058235640) at `4c7c006e9db20723ec14da71ba6363f3aacd01b2` passed the original CommonJS source-parity matrix, primitive positive controls, and strict project/external JSDoc.
- [Expanded focused Node 22 Ubuntu/Windows run 45058345572](https://github.com/FlareZ123/obfs/actions/runs/45058345572) at `52a214903b59a0d5e0c82651a076586cd05c70ba` passed the additional `unescape` and native dynamic-data-URL ESM import variants plus strict project/external JSDoc.
- [Second adversarial two-platform run 45058825800](https://github.com/FlareZ123/obfs/actions/runs/45058825800) at `8840e6ef6b30359b0b284148fb093de19f46eae5` revealed a remaining source-observer gap for computed native method selectors `namespace[method]` and computed destructuring. Both operating systems observed a changed string result after a function literal rewrite.
- [Computed-key repair focused Node 22 Ubuntu/Windows run 45058918686](https://github.com/FlareZ123/obfs/actions/runs/45058918686) at `3aad66daa1c3379e52810b4f47ac79afcefcd235` passed CommonJS, ESM, bound method, `Reflect.apply`, dynamically selected native method, and primitive positive controls with both strict JSDoc gates.
- A full Node/Chromium integration replay at earlier source `52a214903` was dispatched separately. The final computed-key repaired source `3aad66daa` requires its own full integration replay before broad integration can be claimed.

## Boundaries

This fix is deliberately scoped to provenance visible through specific native Node modules and stable literal import spellings. Arbitrary monkey-patching, external capability forwarding, computed module specifiers, and dynamic alias provenance remain outside these tests. The project-wide hostile-runtime and 2.5x release decision remains **RELEASE-BLOCKED**.
