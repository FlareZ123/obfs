# Lexical resolver and observed-source proof: research intake contract

**Agent 1, 23 November 2026.** This is a narrow engineering handoff for
future cross-file property-renamer and source-observer research. It does
not supersede Agent 3's canonical
`workplace/agent3-source-observer-decoder-intake-2026-11-22.md`.
Product release remains **RELEASE-BLOCKED**.

## Available read-only APIs

`workplace/agent1-lexical-reference-resolver.js` exposes
`resolveLexicalReferences(ast,sourceType)`, returning:

- `references`: each Acorn identifier reference's UTF-16 start/end,
  `name`, `role`, and syntactic
  `resolution.kind` (`local`, `free-host-candidate`, `unknown`).
- `declarations`: explicit source-token declarations and associated
  `bindingId`. Ambiguous declarations expose `null`.
- `classSpellingCouplings`: for a named `ClassDeclaration`, the one
  class-name source token is linked to its **different** mutable outer
  BindingId and immutable inner class self-BindingId. These two IDs
  cannot be independently rewritten in the single name token.
- `at(start)`: the reference whose Acorn UTF-16 token begins at an exact
  offset, where present.

A `local` resolution establishes a bounded lexical link only. It
does **not** prove an object's owned property, a browser-native host
receiver, a cross-file value identity, output source equivalence, or a
permission to rename. A `free-host-candidate` is a syntactic name
candidate rather than a runtime native-host identity witness.
A `role` describes syntax-level read/write/call/constructor/key
position, not all possible effects. `unknown` is an exclusion for
future conservative rename admission.

Named class self-bindings lack a second source declaration token;
`classSpellingCouplings` exists precisely to prevent a future
transformer from independently renaming the one token and its
distinct runtime bindings.

## Reproducible Stage 1 boundary evidence

| Boundary | Reproduction and correction | Current validation |
| --- | --- | --- |
| Evaluated member receiver, destructuring defaults and computed keys inside assignment LHS | 16-case red [45250146992](https://github.com/FlareZ123/obfs/actions/runs/45250146992), AST branch fix `9525c4a` | Ubuntu/Windows 16-case green [45250337770](https://github.com/FlareZ123/obfs/actions/runs/45250337770) and independent **16 native accessor effects** [45254009587](https://github.com/FlareZ123/obfs/actions/runs/45254009587) |
| Named class inner/outer binding, ESM exported/import-attribute syntax labels and direct sloppy delete | Agent 6 #344 donor, selective integration `78a161794` | Seven 2-OS focused tests/strict checks at `4895d78` (45251398554, 45251406251, 45251413350, 45251422831, 45251428948, 45251435575, 45251443979); real two-module ESM [45255002916](https://github.com/FlareZ123/obfs/actions/runs/45255002916) |
| Switch discriminant evaluated **before** CaseBlock lexical environment, case tests/consequents inside shared CaseBlock | Agent 23 red-first main [45254517650](https://github.com/FlareZ123/obfs/actions/runs/45254517650), scoped repair `50fb6c97` | Four switch cases [45254738432](https://github.com/FlareZ123/obfs/actions/runs/45254738432); held-out **60 Acorn/TypeScript** pairs [45256474026](https://github.com/FlareZ123/obfs/actions/runs/45256474026), two OS, strict JSDoc |
| Existing non-switch scope oracle | Agent 1 original 150 Acorn/TypeScript source-marker comparisons | [45254757075](https://github.com/FlareZ123/obfs/actions/runs/45254757075), two OS, strict JSDoc |

Detailed intermediate evidence:
`im-results/agent1-reference-role-path-2026-11-23.md`,
`im-results/lexical-stage1-role-semantics-2026-11-23.md`,
`im-results/switch-discriminant-lexical-scope-2026-11-23.md`.

The four rows are finite, source-pinned tests, not a complete binding
semantics theorem. Full Node/browser acceptance remains a separate
source-specific event.

## Observed function source and captured value

`workplace/agent1-source-closure-edit-proof.js` can plan and
revalidate **necessary** exact-function-source and lexical
reference/declaration-spelling constraints for one selected named
function. It rejects missing independent declaration provenance for a
captured hidden class self-binding; red-first two OS
[45251712075](https://github.com/FlareZ123/obfs/actions/runs/45251712075),
green [45252764879](https://github.com/FlareZ123/obfs/actions/runs/45252764879).

A separate admitted edit changing `const secret=40` to `const secret=41`
with `function observed(){return secret+2;}` left byte-identical still
changes `observed()` from 42 to 43, despite preserving both lexical
reference and declaration **name**. The reproducible passing expected-
difference negative control is
[45257492465](https://github.com/FlareZ123/obfs/actions/runs/45257492465).
More complicated accepted changes can rewrite externally sourced
provider values and object properties. Source/lexical identity by
itself is **insufficient** for behavioral equivalence.

These are research prototypes. The output of
`applyObservedFunctionEdits` must not be interpreted as a general
behavior-preserving compiler admission certificate. No production
compiler currently consumes Stage 1 or Stage 2.

## Minimum gate before production use

A proposed selective property rename must establish a conservative,
cross-file owner/key equivalence class across assignments, arguments,
returns, shared references, destructuring, dynamic property access,
reflection and host API boundaries. It must propagate exact source-
spelling obligations from an actually proven callable-source observing
receiver through this class, protecting the full owner/key class
while retaining independently proved unrelated keys as rename
candidates. Named-class inner/outer binding source coupling,
switch discriminant scope, and evaluated read/write roles must be
preserved.

A further value/effect proof must account for captured binding
initializers and writes, property mutation, imported providers, and
external observable errors. Independent native/emitted execution in
Node and Chromium for COO/SNO/SCO is required, with exact error/source
parity, independent rename yield and separate cold/warm compute
measurements against the strict 2.5× limit. Security resistance to a
runtime-controlling attacker must be evaluated independently from
source correctness and compute. Under current evidence the compiler
integration answer remains **NO-GO**.

The canonical companion is Agent 1's
`workplace/agent1-source-observed-owner-closure-2026-11-23.md`,
which describes the concrete owner/property source-spelling
propagation issue in CSSOM and the `src/properties.js` and
`src/core.js` integration seams.
