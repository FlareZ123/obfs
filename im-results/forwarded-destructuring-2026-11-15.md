# Private property renaming through statically proven identity-return destructuring

Researcher: Agent 19. Date: 2026-11-15. **Evidence status: intermediate compiler improvement.**

## Specific unsupported flow

The initial closed-world proof could safely rename `const alias=identity(root)` followed by `alias.secretField`, yet declined an immediately destructured return such as `const {secretField:read}=identity(root)`. The root object was passed only to a pure, immutable, locally proven function; the return value was demonstrably that root; the right-hand side never escaped. The previous call-return proof admitted a tracked identifier or discarded standalone result but excluded object-pattern declarations and discarded object-pattern assignments.

The extension in [`src/properties.js`](../src/properties.js) admits a proven identity-return call in **exactly two new result contexts**:

1. The initializer of a variable declarator with a statically keyed `ObjectPattern`.
2. The right-hand side of a plain `=` assignment whose left-hand side is a statically keyed `ObjectPattern`, where the whole assignment is an expression statement and its returned object value is discarded.

The existing `isSimplePatternBinding` and `ownPropertyName` checks apply to every field. Rest properties, runtime-computed names, opaque nested targets, and result escape remain outside the proof. The cross-file ESM compiler reuses the existing proven `patterns` field to rewrite corresponding imported-state keys, but only after all previously required graph/import/ownership checks succeed. No general abstract interpreter or alias escape proof for unlisted modules is claimed.

## Conditional correctness argument

Let `K` be the known, distinct own-string-key set of a candidate literal-only object, and `f:K→K′` the compiler's injected one-to-one mapping to generated labels. On the admitted graph, an identity forwarder returns its argument unchanged. A destructuring pattern with statically determined key `k∈K` reads the object's own value `o[k]`; after the transformation the stored field and the pattern key are both rewritten, so the read yields `o′[f(k)] = o[k]`. A shorthand destructuring field's *binding name* is left unchanged, hence its subsequent lexical references still refer to the extracted value. A discarded assignment destructuring expression cannot expose the renamed object's complete value as the assignment result. The existing proof's all-use check ensures that a direct forwarding call cannot feed an unproved consumer.

This is a **conditional semantic argument**, requiring that the owner object and all its consumers are within the declared graph, the mapping has no collision, the admitted wrappers are immutable and pure identities, and no unmodeled reflection, source-code observation, dynamic access, or host behavior inspects original object-key spellings. These conditions are checked only by the compiler's conservative syntactic model. The reasoning does not establish semantic equivalence for arbitrary JavaScript, unknown imported modules, instrumented runtimes, accessor-bearing objects, or external observers. The native CJS, ESM and Chromium tests are concrete evidence for the supported subset; they do not replace the assumptions.

## Real generated artifact

The [`examples/forwarded-destructuring/`](../examples/forwarded-destructuring/README.md) directory contains real original and obfuscated CommonJS programs and a byte-for-byte deterministic generator. The private root has `secretField:7` and `otherField:5`; a pure immutable identity function forwards the object into both a declaration pattern and a discarded assignment pattern. The generated result consistently replaces private field names with `_p<10 hexadecimal digits>` while preserving extracted bindings and the exported `[7,5,7]` values.

The [local regression suite](../test/forwarded-destructuring.test.js) checks COO and SNO modes, shorthand binding preservation, block and assignment patterns, two-level identity composition, captured zero-arg getters, first-class getter escape, rest key exposure, dynamic keys, assignment result escape, iterable array destructuring and introspection. Native and transformed observable results are compared under independent VM contexts. The [cross-file ESM tests](../test/cross-file-reader-flow.test.js) run native and transformed module graphs with actual Node resolution, imported identity forwarding and refusal cases. A [real browser integration](../test/browser-integration.js) also forwards an exported private object into an ESM destructuring binding and then invokes an unchanged external `window.hostApi.accept` method.

## Pinned validation and remaining security gap

The [full cross-platform run 43729163579](https://github.com/FlareZ123/obfs/actions/runs/43729163579) at commit `995cba7867a3bbff674b4fecce3cfc6e6ea799db` passed the complete behavioral tests, strict JSDoc checks, sampled hot-loop benchmarks and Ubuntu Chromium. An earlier run at `f557d754` failed solely an incorrectly strict test that demanded shorthand local *binding names* disappear; preserving their identifiers is the intended semantics. The next run at `28d7bcd3` failed because the test required a `.cjs` builder file without its explicit extension. Those fixtures were corrected before the above green run.

The generated field labels are publicly recognizable. The [seedless normalizer](../sims/offline-normalize.js) can replace them consistently without the original seed. A direct sample seedless-normalization attack is exercised by the exact-example regression. It parses only the emitted JavaScript and replaces both public hashed labels, without accessing the original program or seed, then reproduces its exported result. This demonstrates source-only reconstruction of an equivalent runnable program, while the original key spellings need not be recovered. This is property-renaming coverage, **with no demonstrated resistance to source-only normalization, runtime tracing, executable modification or owner-controlled SNO execution**.

The later [full run 43729345253](https://github.com/FlareZ123/obfs/actions/runs/43729345253) at code commit `384a239c1b20c4a1fef8422e3e952e8293bfb2a0` passed **866/867 tests with one skip** on both operating systems, both JSDoc checkers, all benchmark cases, and the real Chromium suite on Ubuntu. Its new [`test/benchmark.js`](../test/benchmark.js) forwarded-object-pattern hot loop compiled a native property-owning object and immutable identity function, then timed a million-iteration destructuring/accumulation loop with alternating baseline and protected executions. The measured ratios were **0.982× Ubuntu** (0.78 ms baseline and 0.77 ms transformed, rounded) and **1.000× Windows** (0.54 ms each, rounded). The measured isolated loop satisfies the 2.5× bound. This is not evidence for a universal code-size, cold-start or runtime guarantee.

## Final matching source-attack validation

The latest [complete Ubuntu/Windows run 43729620903](https://github.com/FlareZ123/obfs/actions/runs/43729620903), pinned to code and report commit `2c8d52af0eccb07810659e8279a4eb28e40de805`, passed **866/867 tests with one skip and zero failures** on both platforms. This source state includes the exact sample's seedless static-normalization regression, the captured getter and imported identity ownership tests, and both live Chromium host-API cases. Strict JSDoc, external checker, runtime samples, and the Ubuntu Chromium suite all passed.

For this run the forwarded-pattern million-iteration benchmark reported **1.000× Ubuntu** (0.46 ms and 0.46 ms after rounding) and **0.983× Windows** (0.87 ms vs 0.85 ms). The earlier independently pinned 0.982×/1.000× figures above characterize a different CI machine run. Both samples stay within 2.5×; neither is a global upper bound. The independent static adversary still neutralized every key in the exact example, so this is a security *negative control* alongside compatibility validation.

## Future checks

Test imported identity use through cross-module destructuring on held-out graphs, especially named imports sharing exported objects with unlisted consumers. Broaden only when the no-escape/reflection proof can establish every use. Compare attacker-normalized source against original behavior and measure startup and steady-state workloads separately. Since this scheme retains syntactically recognizable transformed labels, practical improvements in adversarial reconstruction cost require a different representation and an independent deobfuscation benchmark, not merely more renaming coverage.
