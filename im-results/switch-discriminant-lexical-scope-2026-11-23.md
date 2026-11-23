# Switch discriminant lexical-scope differential (23 November 2026)

## Status and boundary

**Bounded Stage 1 lexical-classification bug and repair; not a production obfuscator or security result.** The read-only `workplace/agent1-lexical-reference-resolver.js` prototype classified the `switch` discriminant in the *case-block* lexical environment, where later `let` declarations are visible. JavaScript instead evaluates the discriminant in its surrounding environment, **before** it creates the CaseBlock lexical environment. Case selector expressions and consequents do use the CaseBlock environment. A `var` declared in a case still hoists to the surrounding var scope.

For example, in `export {}; switch(window) { case 41: let window = 7; sink(window); }`, the `window` in the discriminant is a free host-name candidate, whereas the `window` read in the consequent is a case-local binding. The prior resolver classified both as local, so a future rename or host-source admission gate built on that BindingId would have the wrong provenance. The runnable native equivalent `function f(window) { switch(window) { case 41: let window = 7; return window; } }` returns 7 for input 41 and has **distinct** argument and CaseBlock bindings.

The [ECMAScript 2026 SwitchStatement runtime semantics](https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html#sec-switch-statement-runtime-semantics-evaluation) explicitly evaluate the discriminant expression and its value **before** creating and installing the CaseBlock lexical environment. This matches the native Node witness and is the normative basis for the separation.

## Source-pinned exact A/B

- Red-first test-only control: `c7637d03408d4c5b14510b35f68d768ef9ed547d`, branch `agent23/switch-discriminant-control-20261123`, [run 45253156317](https://github.com/FlareZ123/obfs/actions/runs/45253156317). Node 22.23.4 **Ubuntu 2 passed / 2 failed; Windows 2 passed / 2 failed**. The discriminant was erroneously `local` instead of `free-host-candidate`; the argument and CaseBlock read received the same BindingId. Both controls for TDZ case tests and hoisted `var` passed. No compiler code changed in this control.
- Patched source: `a4cf6fbd8ed5d0bc8fc6b40eec1aef187f8a5e76`, branch `agent23/switch-discriminant-scope-20261123`, [run 45253165716](https://github.com/FlareZ123/obfs/actions/runs/45253165716). Node 22.23.4 **all 4 tests passed** on Ubuntu and Windows; focused workflow also passed strict project/external/paired-checker JSDoc steps.

The production-independent repair is intentionally small: in `collect`, dispatch `SwitchStatement.discriminant` in the incoming scope, then dispatch all `SwitchCase` nodes in one shared `switch` child scope; leave existing `varScope` hoisting unchanged. `test/agent23-switch-discriminant-scope.test.js` records four targeted classifications, BindingId identity, native execution and TDZ observations.

## Confidence and nonclaims

The experiment proves a specific parser/walker misclassification and its regression repair in the read-only prototype. It does **not** demonstrate `obfuscateFiles` use of this resolver, cross-module binding correctness, adversarial resistance, full-suite parity, or any 2.5× computation guarantee. Exact-source full validation and peer review remain prerequisites to merging a broader compiler integration. Keep the global three-mode strong-security assessment **RELEASE-BLOCKED**.

This narrowly closes a Stage 1 classification defect discussed in the [canonical source-observer/decoder intake](../workplace/agent3-source-observer-decoder-intake-2026-11-22.md) without claiming that Stage 1 or Stage 2 is accepted.
