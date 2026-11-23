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


## Canonical mainline adoption and independent review (Agent 1)

After receiving Agent 23's donor and reviewing the switch evaluation order and
source-boundary semantics, Agent 1 copied its four-case test onto current
main (commit `f5aa6e2fbfe10648adcf26d060026190b9c64316`).
A **new mainline red-first focused run**
[45254517650](https://github.com/FlareZ123/obfs/actions/runs/45254517650)
failed exactly the discriminant free-host provenance and distinct BindingId
controls on Ubuntu and Windows (2 passed/2 failed per OS), matching Agent 23's
branch-only reproducer. The defect was in the research resolver.

The patch was selectively ported to current main in
[50fb6c9708d4f8980a9d23b1ec7bcf52cc558a96](https://github.com/FlareZ123/obfs/commit/50fb6c9708d4f8980a9d23b1ec7bcf52cc558a96),
preserving the prior named-class inner/outer source-coupling and
assignment-pattern role-path corrections. The test was added to strict
`jsconfig.external.json` by `5f46bef12a13f5a76189c6dbf937562b06219119`.

Fresh two-OS focused jobs **all passed**:
- Switch discriminator 4/4
  [45254738432](https://github.com/FlareZ123/obfs/actions/runs/45254738432).
- Original Stage 1 resolver groups 10/10
  [45254748047](https://github.com/FlareZ123/obfs/actions/runs/45254748047).
- 150 independent Acorn/TypeScript comparisons
  [45254757075](https://github.com/FlareZ123/obfs/actions/runs/45254757075).
- Named-class declaration binding 6/6
  [45254766973](https://github.com/FlareZ123/obfs/actions/runs/45254766973).
- Native read/write binding-effect oracle 16/16
  [45254775641](https://github.com/FlareZ123/obfs/actions/runs/45254775641).
- Existing Stage 2 source closure 12/12
  [45254784792](https://github.com/FlareZ123/obfs/actions/runs/45254784792).

The first three runs used source pin
`054bd048f0cb94c49171e42b6dac8cbbff4610b3`;
the latter three used
`bcf1b031f9b753deff6dc69164027b8f04b23d59`.
All six focused workflows passed Ubuntu, Windows, and strict project/external/
runtime budget JSDoc steps; each explicitly skipped its full Node job.

Agent 23 owns the original discovery. Agent 1 adopted and independently
reviewed it on canonical main. All security/cost and full application
release boundaries above remain unchanged.


## Held-out Acorn / TypeScript switch scope grid (Agent 1, 20:11 UTC)

The initial four-case red/green proof was extended using a **separate
60-source-marker checker oracle** at
`test/agent1-lexical-switch-typescript-grid.test.js`. It generates 12
switch discriminant, case-test, and consequent lexical shapes × 5 enclosing
wrapper variants. The wrappers include a free global-like name, a same-name
parameter, an outer-block binding across an inner nested function, arrow
execution, and another nested function environment. Each marked `window`
identifier is independently resolved with the TypeScript checker and
compared to Acorn Stage 1's local versus free-host-candidate result. The
test asserts both classes are non-vacuously represented.

The first trial [45256022145](https://github.com/FlareZ123/obfs/actions/runs/45256022145)
failed at parse time: the generator had placed a `var window` in a switch
inside the same function block as `let window`, which is invalid syntax.
The fixture was repaired by moving the var case into a nested function
(commit `2ee06d50c5ed6e071ba094f365a0459afb6fc61b`). The next run
[45256267552](https://github.com/FlareZ123/obfs/actions/runs/45256267552)
passed the **60/60 semantic oracle** but failed strict external JSDoc
TS7022/TS7024 from an inferred variable without its explicit narrow union.
A JSDoc annotation correction was committed as
`9eea19ec4c09e7a2ceee539c9d2022d11200a74f`.

At that exact source pin, two-OS focused run
[45256474026](https://github.com/FlareZ123/obfs/actions/runs/45256474026)
completed **SUCCESS**, all **60/60** source-paired classifications, strict
project/external/paired-budget JSDoc on Ubuntu and Windows. Full Node and
browser work was skipped by the focused workflow. This is a finite,
syntactic reference-identity consistency check. It provides no guarantee
for dynamic evaluation, property ownership, source observation, interfile
flow, or full production compiler admission.
