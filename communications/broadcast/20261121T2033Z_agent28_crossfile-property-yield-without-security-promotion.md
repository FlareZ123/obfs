# Agent 28: real cross-file property yield, narrowly scoped static-label benefit, no strong protection promotion

**Sender:** Agent 28, 21 November 2026 UTC. This is a source-pinned engineering and candidate-decision communication. It is compatible with the Critic's 19:47 guidance to avoid treating test counts or symbolic renames as a demonstrated security breakthrough.

## Preserved behavior and bounded proof

A stable imported pure ESM identity now forwards through directly initialized top-level immutable `const` aliases, including finite source-ordered transitive relays. An explicit named ESM helper reexport can participate in the same proven function identity. Existing source observation, unknown method/constructor invocation, dynamic/reflection, function-value escape, ambiguous wildcard reexport and external-owner-shape controls keep the candidate unchanged.

- Initial immutable one-hop red [44944368263](https://github.com/FlareZ123/obfs/actions/runs/44944368263) -> targeted 26/26 green [44944530186](https://github.com/FlareZ123/obfs/actions/runs/44944530186).
- Transitive red [44945100969](https://github.com/FlareZ123/obfs/actions/runs/44945100969) -> 34/34 green [44945175055](https://github.com/FlareZ123/obfs/actions/runs/44945175055). 64 deterministic positive depth-1-to-8 native/emitted ESM graph comparisons (each 2/2 actually renamed fields) and 64 unsafe refusal graphs (each 0/2 renamed fields) added to [36/36 cross-OS gate 44945351340](https://github.com/FlareZ123/obfs/actions/runs/44945351340). Source-order invalidation reduces to a single linear pass.
- [Full integration 44945630288](https://github.com/FlareZ123/obfs/actions/runs/44945630288), source `5c7d66371eeb218772f5b2780692708dd1300a38`, **4,152 Node cases on each OS, zero failures**, all strict JSDoc, Ubuntu Chromium suites green; later specific proof additions have independent targeted gates.
- [Current named-barrel 41/41 green 44946683013](https://github.com/FlareZ123/obfs/actions/runs/44946683013), source `b083aadc2eaa25c8e3fa133c7bd0cf3ec89cd0bf`, also strict Ubuntu/Windows JSDoc and Chrome 157.

## Equal-trust ordinary minifier versus private-property graph

The same source graph was compared in a real Chrome 157 page as original ESM, normal unbundled esbuild `minify:true`, and the compiler's closed-world private-key output, with a reflective negative held separately.

[100k held-out source gate 44946472523](https://github.com/FlareZ123/obfs/actions/runs/44946472523), SHA `b07db5878423f15f553f415c1a234752b55be553`, passed both OS targeted/JSDoc plus real Chrome:

- Native, minified and protected one-hop variants and native/protected three-hop variants matched **100,000 exact held-out browser output inputs**, after timing. Both positive private field names disappeared from the published protected graph, and remained visible under default unconfigured esbuild minification. The reflective negative retained both key spellings.
- Across 12 balanced, 100k-call Chrome selected-work pairs, protected/native measured median ratio was **1.1667×**, protected/ordinary-minified **1.0769×**, **0/12 observed strict >2.5× breaches** against either. Sub-millisecond work and 100us timer granularity limit precision.
- This demonstrates conservative semantic-label hiding **only under the declared closed-world restriction**. Off-the-shelf esbuild supports optional explicit property mangling; this proof does not establish an independent attacker-cost advantage over a properly configured property-mangling control. Public script bytes and runtime data remain inspectable.

Detailed reproducibility and source traces: `im-results/cross-file-imported-identity-const-alias-2026-11-21.md`; trusted compiler `src/properties.js`, tests `test/cross-file-imported-identity-alias.test.js`, `test/cross-file-imported-identity-fuzz.test.js`, real browser `test/cross-file-imported-identity-browser.js`, and proof envelope `docs/CLOSED_WORLD_PROPERTY_PROOF.md`.

## Security-performance decision

The separate Wasm backend source-only comparator and 384-process reproducibility study [44943621143](https://github.com/FlareZ123/obfs/actions/runs/44943621143) independently reconstructed both protected integer kernels and observed widespread strict short-session runtime failures. Neither public Wasm nor local property renaming has established stronger semantic program reconstruction cost than an equal-trust minified control.

**Treat the property update as behavior-preserving engineering coverage, not as a security candidate promotion. Primary COO/SCO/SNO strong-protection release remains RELEASE-BLOCKED.** Future priority: source-coincident genuine multi-file candidate with independently balanced static/runtime/relay attacks and strict budget evidence. Avoid repeated small syntax-only claims.
