# Agent 20: source-distribution safeguards and independent regression review

Lease run `b3943d3d-f8f3-453c-b58e-8865f0e44b55`, claimed at `2026-11-15T16:27:03Z`. Continue research until the actual lease clock reaches 70 minutes at a checkpoint.

## 2026-11-15 invocation

- Studied root `README.md`, `docs/SECURITY.md`, `results/README.md`, recent maintainer/Critic broadcasts, Node/SCO source code, branch-block/MBA/Wasm candidate reports and tests. The security baseline remains conservative AST rewriting with recoverable syntax hiding; private SCO server operations retain actual undistributed code but are vulnerable to allowed black-box queries.
- Discovered that `src/svg-assets.js` passed an SVG animation `values="#safe; javascript:alert(1)"` attribute through a single URL-prefix predicate. Each semicolon-delimited animation state must be screened independently. Patched `<animate>`, `<animateMotion>`, `<animateTransform>` attribute handling in commit `d147da8`.
- Added four hostile samples and byte-identical benign samples in `test/svg-asset-disclosure.test.js`, commit `18c253e`; documented behavior in `docs/SECURITY.md`, commit `05b00ee`; wrote `im-results/svg-animation-value-list-2026-11-15.md`, commit `0a07281`.
- Local Node 22.16.0 predicate witness: two late-state executable URL strings that old predicate classified false become true after splitting. Harmless link/number lists remain false. Do not claim actual browser execution of `javascript:` in an SVG navigation state without direct browser evidence.
- Manually dispatched [transform-safety CI 43736163213](https://github.com/FlareZ123/obfs/actions/runs/43736163213) on exact commit `0c281fa7741a0f89254c0dfaf78f6a05fd54f213`. The new SVG regression passed in Ubuntu and Windows (test #216). Broad workflow failed two unrelated ESM closed-world assignment coverage assertions (tests #88-89 in `test/destructuring-assignment-flow.test.js`; actual `crossFile.objects=0`, expected 1). Do not claim whole-suite success, typecheck, or release green from this run.

## Follow-on direction

- Inspect XML `<style>` payloads in SVG: present `src/svg-assets.js` visitor screens attributes, scripts and DTDs but not CSS source-map comments or inline CSS `url(data:...)`. Prefer bounded, independently testable source-disclosure policy changes with real prepatch and postpatch evidence. Existing `hasCssSourceMapDirective` in `src/source-maps.js` may be shareable after moving to a dedicated module to avoid the current `source-maps -> svg-assets` cycle.
- If modifying the SVG guard, validate parser events, preserve benign style elements, test COO/SCO/SNO and direct SCO, and record exact CI SHA.
- Notify Agent 19 or owner of the independent cross-file assignment failures instead of silently changing their tests.
- Continue monitoring compatible obfuscation and independent attacker evidence. Avoid claiming more source secrecy from a static source-disclosure preflight than measurements support.
