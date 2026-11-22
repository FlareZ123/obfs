# CSS.escape implicit function-source observation

**Status: direct-case Node and Chromium evidence green; expanded alias regression under verification.** Research
branch `agent19/css-escape-source-observer-20261122`; Agent 19, 22 November
2026. This is intermediate compiler-correctness evidence. It does not establish
code secrecy, hostile-runtime tamper resistance, or the 2.5× compute bound.

## Native API contract

The [CSSOM definition](https://drafts.csswg.org/cssom/#the-css.escape()-method)
defines `CSS.escape(ident)` with a `CSSOMString` input and identifier
serialization. The Web IDL input conversion can invoke JavaScript ToString.
Passing a function can therefore expose its exact `Function#toString`
spelling inside the returned escaped string. A private field rename inside
that function can change observable output.

This is an architectural source-observation contract, even when a program
never calls `.toString()` explicitly. The repository's existing
`src/ast.js::observesFunctionSource` recognized many Web IDL coercers but
did not explicitly recognize `CSS.escape`.

## Reproducible red/green test

- **Red:** [focused Node 22 CI 45081766566](https://github.com/FlareZ123/obfs/actions/runs/45081766566),
  exact `70cb53ed0cfcdb2636e130bbae19e860ccd981e1`. All three
  negative analyzer checks returned `false` rather than `true` for direct,
  `globalThis`, and `Reflect.apply` CSS.escape source uses. The fourth
  positive-control assertion failed for an independent test-harness mistake:
  cross-realm `vm` objects were compared with `deepStrictEqual` without
  converting them to a host-realm record. The test was corrected before green.
- **Green:** [focused Node 22 CI 45081865621](https://github.com/FlareZ123/obfs/actions/runs/45081865621),
  exact `ab7c3e622c0e9ce2df7642dbabf8ca71069b0675`.
  Both Ubuntu and Windows passed the CSS.escape unit test, strict project
  JSDoc and strict external JSDoc. The test uses a `CSS.escape` host stub
  that models *argument string conversion only*.
- **Browser-native follow-up:** `test/css-escape-source-browser.js`
  executes native and compiled COO ES modules in separate Chromium pages.
  The source-bearing negative must preserve literal spellings; a
  primitive-only positive must still rename one private object. Triggered by
  `.github/workflows/manual-browser.yml` at
  `1a5cb304c9a6784086d90b9412e8acc4439d16e3`.
  The complete native Chromium browser workflow passed at exact\n  `1a5cb304c9a6784086d90b9412e8acc4439d16e3`,\n  [run 45081997792](https://github.com/FlareZ123/obfs/actions/runs/45081997792).\n  That pin predates the alias extension, which must be checked separately.

An expanded test at exact `b8efe8e965f49b1c994f1a27ab9dc5511d4c649f`\nreproduced four additional false-negative cases on both Node 22 runners:\nsequence wrapper, transitive immutable alias, direct bound call and object\ndestructuring alias. The [red focused run 45082280292](https://github.com/FlareZ123/obfs/actions/runs/45082280292)\npassed 8/12 cases and failed the other four. A new fixed-point, conservative\nmay-flow proof tracks named and destructured CSS.escape aliases and direct\n`.bind()` wrappers, with no generated hot-loop operations. New validation\nis pending at `7761e83ba8da05a3aa93aef3575f9dbdd34be054`.\n\nThe change adds a predicate for directly addressed `CSS.escape` and
`globalThis.CSS.escape`, `window.CSS.escape`, `self.CSS.escape`. It also
conservatively flags `.call`, `.apply`, `.bind`, and `Reflect.apply`
on recognized methods where source-bearing arguments may be passed.
Only the compile-time source-observation check changes. No runtime
instructions are added by the guard.

## Boundary and follow-up

This finite predicate does not follow arbitrary runtime-selected aliases, monkey-patched
namespaces, host object interception, or calls through unproved wrappers.
It may conservatively refuse source transformations on a program with a
shadowing local `CSS` binding. Such refusal is a positive correctness
tradeoff rather than evidence of attacker resistance.

A future maintainer should validate browser behavior at a fixed source SHA,
then integrate the smallest proven guard into the canonical source-observer
branch owned by Agent 3. Maintain an independently transformed private-key
positive fixture to avoid accidentally converting the compiler into a
trivial all-source refusal.

The project-wide [decision index](../results/README.md) remains
**RELEASE-BLOCKED** for the primary strong-protection objective.
