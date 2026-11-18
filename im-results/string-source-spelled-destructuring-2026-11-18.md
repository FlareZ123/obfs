# Computed strings in V8 source-spelled destructuring errors

**Agent 8; 18 November 2026. Intermediate semantic-correctness evidence.**

## Scope

This report records a source-pinned JavaScript semantic defect and its
conservative repair. It is **not a security result**, does not improve static
or dynamic analysis resistance, and does not change the release-blocked
candidate decision in `results/README.md`.

V8 can include the source spelling of a failed operand in
`TypeError.message`. The local property and identifier renamers already
guarded this class for calls, iteration and destructuring. The eager string
encoder had an older, narrower copy of that grammar: it guarded direct array
destructuring but omitted object destructuring and nested destructuring
defaults.

A computed key can therefore keep its runtime string value while still
changing an observable caught error. For example, native source equivalent
to:

```js
const root={secretAlpha:null};
try { const {value}=root['secretAlpha']; }
catch (error) { module.exports=error.message; }
```

reports a failed operand containing `root.secretAlpha` in the tested V8.
Before the repair, the generated program reported the injected decoder
expression instead.

## Frozen pre-repair counterexample

The counterexample was committed on branch
`agent8/string-object-pattern-red-20261118` at exact source
`5d5a35da63e7ec1d0ce788003f0d3e345a818e38` and executed by manual
workflow run
[44378092372](https://github.com/FlareZ123/obfs/actions/runs/44378092372)
on Node **22.23.4** for Ubuntu and Windows.

The script `sims/string-object-pattern-error-attack.js` exercised direct
declaration/assignment and nested default object-pattern cases in COO, SNO
and SCO. Every tested unsafe case had `encodedLiterals=1`. Native messages
contained `root.secretAlpha`; generated messages contained a helper
expression such as `root[_o798642a895a0[0]]`. The differential explicitly
asserted that the messages differed. A separate safe computed-string control
continued to encode, showing the counterexample was produced by a live
transform rather than zero rewrite yield.

This red branch is retained as historical counterfactual evidence. It was not
merged into `main`.

## Repair and durable regression

Main commit `4b1fd57849f959faced7a4622247a55922481e81` extends the string
encoder's failed-operand ancestry guard to:

- `AssignmentPattern` defaults whose left side is an ArrayPattern or
  ObjectPattern;
- `VariableDeclarator` destructuring whose id is an ArrayPattern or
  ObjectPattern;
- `AssignmentExpression` destructuring whose left side is an ArrayPattern
  or ObjectPattern.

The durable differential now contains six source-sensitive forms, including
array-pattern defaults that produce V8's `"... is not iterable"` spelling,
plus a safe positive-yield computed-string control. It runs all three
obfuscation modes. The regression is wired into
`test/property-nullish-destructure-error.test.js`.

At exact main source
`09b58563e6f05aeca7c57b53836bd54df5bf920e`, focused manual run
[44378624593](https://github.com/FlareZ123/obfs/actions/runs/44378624593)
passed on Ubuntu and Windows. Across the six specimens and three modes,
every unsafe row had `encodedLiterals=0` and exact native/generated message
parity. Each mode still encoded the separate safe string.

The same run executed a real Ubuntu Chromium page. It compared **13**
native/generated programs: five existing property-spelling cases, six new
string-spelling cases, one safe property-renaming control and one safe
string-encoding control. The result was:

```text
NULLISH_PATTERN_CHROMIUM {"cases":13,"unsafePropertiesPreserved":5,"unsafeStringsPreserved":6,"safeOwnKeyRenamed":1,"safeStringEncoded":1,"allOutputsMatch":true,"chromium":"google-chrome"}
```

The full existing `manual-validation.yml` integration at the same source is
run
[44378829728](https://github.com/FlareZ123/obfs/actions/runs/44378829728).
Both Node 22.23.4 jobs completed successfully. The Ubuntu job also passed the
workflow's existing Chromium module/host-lock, null-prototype, and ESM
observation integrations.

## Shared grammar follow-up

The defect came from three independent copies of the same engine-observable
failed-operand grammar in the string encoder, property proof and identifier
renamer. A follow-up refactor is being validated separately to move that
classification into a shared AST helper. The intended invariant is that a new
source-spelled V8 failure form is classified once, while individual
transformers can retain their stronger local exemptions where separately
proved safe.

This refactor is maintenance for semantic soundness. Its validation and merge
state should be recorded here only after the full cross-platform gate is
complete.

## Interpretation and limits

The evidence establishes a real observable mismatch for the frozen pre-repair
compiler and exact parity for the listed repaired cases on the tested V8
environments. Error wording and source-spelling behavior are engine-defined,
so this is deliberately a V8/Chromium semantic guard rather than a portable
ECMAScript wording claim.

The conservative skip reduces obfuscation yield only inside expressions that
may be printed as failed operands. Safe computed string reads remain eligible.
No claim follows about confidentiality, tamper resistance, authorized-origin
locking, attacker effort, or the 2.5x performance budget.
