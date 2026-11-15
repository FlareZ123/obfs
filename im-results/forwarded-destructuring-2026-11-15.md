# Private property renaming through statically proven identity-return destructuring

Researcher: Agent 19. Date: 2026-11-15. **Evidence status: intermediate compiler improvement.**

## Specific unsupported flow

The initial closed-world proof could safely rename `const alias=identity(root)` followed by `alias.secretField`, yet declined an immediately destructured return such as `const {secretField:read}=identity(root)`. The root object was passed only to a pure, immutable, locally proven function; the return value was demonstrably that root; the right-hand side never escaped. The previous call-return proof admitted a tracked identifier or discarded standalone result but excluded object-pattern declarations and discarded object-pattern assignments.

The extension in [`src/properties.js`](../src/properties.js) admits a proven identity-return call in **exactly two new result contexts**:

1. The initializer of a variable declarator with a statically keyed `ObjectPattern`.
2. The right-hand side of a plain `=` assignment whose left-hand side is a statically keyed `ObjectPattern`, where the whole assignment is an expression statement and its returned object value is discarded.

The existing `isSimplePatternBinding` and `ownPropertyName` checks apply to every field. Rest properties, runtime-computed names, opaque nested targets, and result escape remain outside the proof. The cross-file ESM compiler reuses the existing proven `patterns` field to rewrite corresponding imported-state keys, but only after all previously required graph/import/ownership checks succeed. No general abstract interpreter or alias escape proof for unlisted modules is claimed.

## Real generated artifact

The [`examples/forwarded-destructuring/`](../examples/forwarded-destructuring/README.md) directory contains real original and obfuscated CommonJS programs and a byte-for-byte deterministic generator. The private root has `secretField:7` and `otherField:5`; a pure immutable identity function forwards the object into both a declaration pattern and a discarded assignment pattern. The generated result consistently replaces private field names with `_p<10 hexadecimal digits>` while preserving extracted bindings and the exported `[7,5,7]` values.

The [local regression suite](../test/forwarded-destructuring.test.js) checks COO and SNO modes, shorthand binding preservation, block and assignment patterns, two-level identity composition, captured zero-arg getters, first-class getter escape, rest key exposure, dynamic keys, assignment result escape, iterable array destructuring and introspection. Native and transformed observable results are compared under independent VM contexts. The [cross-file ESM tests](../test/cross-file-reader-flow.test.js) run native and transformed module graphs with actual Node resolution, imported identity forwarding and refusal cases. A [real browser integration](../test/browser-integration.js) also forwards an exported private object into an ESM destructuring binding and then invokes an unchanged external `window.hostApi.accept` method.

## Pinned validation and remaining security gap

The [full cross-platform run 43729163579](https://github.com/FlareZ123/obfs/actions/runs/43729163579) at commit `995cba7867a3bbff674b4fecce3cfc6e6ea799db` passed the complete behavioral tests, strict JSDoc checks, sampled hot-loop benchmarks and Ubuntu Chromium. An earlier run at `f557d754` failed solely an incorrectly strict test that demanded shorthand local *binding names* disappear; preserving their identifiers is the intended semantics. The next run at `28d7bcd3` failed because the test required a `.cjs` builder file without its explicit extension. Those fixtures were corrected before the above green run.

The generated field labels are publicly recognizable. The [seedless normalizer](../sims/offline-normalize.js) can replace them consistently without the original seed. A direct sample seedless-normalization attack is exercised by the later exact-example regression and must be evaluated at its own pinned commit; the preceding benchmark run predates that addition. This is property-renaming coverage, **with no demonstrated resistance to source-only normalization, runtime tracing, executable modification or owner-controlled SNO execution**.

The later [full run 43729345253](https://github.com/FlareZ123/obfs/actions/runs/43729345253) at code commit `384a239c1b20c4a1fef8422e3e952e8293bfb2a0` passed **866/867 tests with one skip** on both operating systems, both JSDoc checkers, all benchmark cases, and the real Chromium suite on Ubuntu. Its new [`test/benchmark.js`](../test/benchmark.js) forwarded-object-pattern hot loop compiled a native property-owning object and immutable identity function, then timed a million-iteration destructuring/accumulation loop with alternating baseline and protected executions. The measured ratios were **0.982× Ubuntu** (0.78 ms baseline and 0.77 ms transformed, rounded) and **1.000× Windows** (0.54 ms each, rounded). The measured isolated loop satisfies the 2.5× bound. This is not evidence for a universal code-size, cold-start or runtime guarantee.

## Future checks

Test imported identity use through cross-module destructuring on held-out graphs, especially named imports sharing exported objects with unlisted consumers. Broaden only when the no-escape/reflection proof can establish every use. Compare attacker-normalized source against original behavior and measure startup and steady-state workloads separately. Since this scheme retains syntactically recognizable transformed labels, practical improvements in adversarial reconstruction cost require a different representation and an independent deobfuscation benchmark, not merely more renaming coverage.
