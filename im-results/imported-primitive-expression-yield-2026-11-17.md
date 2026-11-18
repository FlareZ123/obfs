# Pure imported primitive expressions: closed-world ESM property yield

**Status: bounded compiler-safety and positive-yield result**, 17 November 2026.
This is not a confidentiality, deobfuscation-cost or tamper-resistance claim.

## Motivation and exact existing proof boundary

The cross-file property pass is disabled whenever a supplied ESM module
might stringify a function source, because a property renaming can change
the source spelling of an exported function. A consumer calling
`String(observed)` on an **imported value** previously triggered that
conservative refusal unless the originating binding was an immutable direct
primitive literal. This was a false refusal for immutable, *purely primitive*
expressions with no functions, calls, member reads or ambient references.

The 17 November Agent4 primitive-only expression grammar already exists in
`src/properties.js::isPrimitiveConstantExpression` to admit owned object
values. This investigation reuses that proven grammar as a boolean
provenance fact for direct named ESM imports; it does not add its own
expression parser or execute constant folding.

## Change and test contract

`src/properties.js` exports the existing
`isPrimitiveConstantExpression` helper.
`src/cross-properties.js::collectVerifiedImportedPrimitives` accepts a
unique top-level `const` export when its initializer is either the
previously supported direct primitive literal (including BigInt literals)
or an expression recognized by the existing pure primitive grammar.
The proof is propagated only to direct, uniquely bound named imports
from supplied exact relative ESM modules, under `closedWorld:true`.
Reexports, mutable exports, shadowed names, unproved expressions and
open-world clients retain their previous refusal. The observation
checker receives only the primitive *type* proof, never a new expression
evaluation.

`test/imported-primitive-source-proof.test.js` uses an actual two-module
native ESM linker, `String(observed)` through a named import, and a
private `owner.secretField` read in the producer. It compares baseline
versus generated module execution and asserts that the private field is
**actually renamed**, rather than merely checking a compiler flag.
Seven newly added positive initializer classes are arithmetic,
nullish logical expression, string + number primitive addition,
conditional, untagged template substitution, unary `typeof`,
and a primitive sequence. Each yields one renamed private field and
preserved Node 22 output after the proof. The previous five direct
literal, quoted-export and negative/open-world tests remain in the same
suite. Three new negatives require zero renamed keys: an opaque
function call, a function-bearing member and an ambient global member
read. The static pure-expression proof cannot classify those inputs.

## Reproducible exact two-platform results

- **Pre-fix red:** [manual semantics 44153856363](https://github.com/FlareZ123/obfs/actions/runs/44153856363),
  branch source SHA `b833abfab4ded28d302b961a3d51ffa1f23bf19c`.
  Ubuntu and Windows Node 22 failed exactly the seven new positive
  proof/transform assertions, while the existing and new negative tests
  passed: **13 passes, 7 failures** on each OS. The focused workflow
  stopped before JSDoc due to this expected failure.
- **Post-fix green:** [manual semantics 44154112490](https://github.com/FlareZ123/obfs/actions/runs/44154112490),
  branch source SHA `bbe41423dff07eda5280397e249df2c54744f2fd`.
  Ubuntu and Windows Node 22 each passed **20/20** tests and both
  `npm run typecheck` and `npm run typecheck:external`.
- The existing manually dispatched workflow was shortened on this
  research branch only for attribution and then restored to the
  upstream content in commit `a180170c9948ed24f9e3067c010b6c13a8ba6870`.
  No permanent workflow change is part of this contribution.

These runs do not constitute a full repository regression gate, and
they tested a small static-graph corpus rather than arbitrary JavaScript.
The proof cannot justify any import whose value may be function-bearing,
including dynamic calls or external mutable globals. The existing local
expression grammar excludes composed BigInt arithmetic, since its
exceptions could expose source-shifted Error.stack coordinates. Existing
literal BigInt proof remains accepted.

## Relevance to primary objective

For the seven added positive ESM graphs, safe property renaming yield
increased from 0 to 1 private key each without relaxing the three new
function-source negative controls. This is a **semantics and compatibility
improvement**; its hashed property names remain statically recognizable
and trivially recoverable to an adversary who owns the COO runtime.
No independent attacker-cost win, source confidentiality, full-workload
protected-execution share or universal 2.5× compute certificate follows.
The main candidate-versus-minifier decision remains release-blocked.

## 18 November 2026: three-mode seeded genuine-ESM regression and mainline reconciliation

The proof was ported onto mainline source `f84fae2e4c594cdf294070593fe928242d74193d` without overwriting newer property-name membership and direct-reader provenance analysis. In particular, `src/cross-properties.js` retains `proveDirectReaderPrimitives` and `src/properties.js` retains `inOperatorPropertyEdits`; the change only exports the existing pure-expression predicate and accepts its previously supported grammar as a primitive-producing named ESM `const` origin.

The committed `test/imported-primitive-graph-fuzz.test.js` deterministically generates **128 primitive expressions**, partitioned into four real, two-file ES module graphs containing 32 primitive exports each, one private owner and one exposed reader. It imports those modules through the native Node ESM loader in fresh temporary directories, then compares generated COO/SNO/SCO outputs to originals. For each of 12 positive graph/mode combinations the assertion requires **one transformed private property** and **all 33 result values** to match. A function-valued imported expression is separately declined in all three modes (three negative tests). The generator seed and operators are committed in the test; the values here count finite test assertions, not a general semantics proof.

**Exact source-pinned targeted Linux/Windows success:** [manual semantics 44290495374](https://github.com/FlareZ123/obfs/actions/runs/44290495374) at `f9b78d692c8c2eecb292a633b3341cf8fbd2d422` passed **15/15 tests on each platform** (12 positive and three refusal cases; 396 positive original/emitted string-result comparisons per platform). The temporary focused workflow was restored in subsequent commit `28d6224577ed5e9e65d4c80c2d4ec9427bea9a4d`. These checks run Node.js 22 on both platform runners and do not establish reproducible browser behavior, all-project integration, adversarial resistance or runtime-budget certification.

**Red controls and repair:** The first pre-reconciliation full CI [44288287629](https://github.com/FlareZ123/obfs/actions/runs/44288287629) exposed an overly conservative test fixture and existing branch drift. A source-reconciled later full CI [44289214386](https://github.com/FlareZ123/obfs/actions/runs/44289214386) demonstrated all 15 initial graph tests green on Ubuntu but was globally red due independent selected-SCO test/JSDoc failures on the contemporary mainline. After replacing low-bit generator sampling with high-bit sampling, targeted CI [44290005934](https://github.com/FlareZ123/obfs/actions/runs/44290005934) revealed six invalid negative-token concatenations in two generated graph groups (for example adjacent unary minus with binary subtraction), across three modes on both platforms. Adding token-separating whitespace repaired the fixture; the above final targeted run passed on both OSes. These outcomes support *test harness correction* rather than evidence of an obfuscator vulnerability.

The strict security-release decision remains **blocked**. All successfully rewritten property names are shipped in public COO/SNO output, the suite contains no independent attacker-cost comparison, and the test's module loads and calls are not an end-to-end 2.5× profile.
