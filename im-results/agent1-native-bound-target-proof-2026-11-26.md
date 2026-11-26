# Native-bound private-target property proof (experimental)

**Date:** 2026-11-26  
**Owner:** Agent 1  
**Implementation branch:** `agent1/exported-closure-owner-proof-20261126`  
**Implementation revision under validation:** `8eee5ba06475edfa2ee83ff24d353fda8ca3a6b8`  
**Status:** focused tests and full manual validation green; experiment branch intentionally isolated

## Question

Can the local closed-world property proof safely treat a non-exported function binding as a private owner reader when its only source-visible use is to create a native bound wrapper that is itself exported?

The previous proof admitted direct private function invocation but rejected this bound-target shape. Four focused positive-yield controls were associated with this gap: bound runtime interception, bound minifier control, source-stable bound export, and SNO bound runtime interception.

This experiment extends rewrite eligibility for a deliberately narrow subset. It does **not** claim that native bound functions hide their target from a hostile host runtime.

## Candidate proof contract

The candidate is enabled only when the caller sets `closedWorld:true` and every supplied executable file passes the graph checks.

A candidate target must satisfy all of the following:

1. The target binding is a local, non-exported callable binding.
2. Every use of that target binding is a direct, noncomputed, nonoptional `target.bind(null)` call.
3. Each bind call has exactly one argument, the literal `null`; partial application and dynamic receivers are refused.
4. Every bind call is at top level, not nested in a function body.
5. The supplied graph contains no other call expressions, dynamic imports, `with`, `this`, constructors, tagged templates, async/generator suspension, iteration/spread/destructuring, class definitions, getters/setters/methods, or member-mutation paths admitted by the current lexical gate.
6. Dynamic computed member paths and known prototype/reflection escapes are refused. The denylist includes `constructor`, `prototype`, `__proto__`, legacy prototype getter/setter accessors, and CommonJS loader escapes.
7. Global capabilities such as `Function`, `globalThis`, `Object`, `Reflect`, `Proxy`, `eval`, `require`, `process`, browser globals, and runtime-specific globals are refused.
8. Unresolved ambient identifier references and parameter-derived host receiver/alias flows are refused. The only global exceptions are immutable language constants and the ordinary CommonJS `module.exports` publication write.
9. Static imports must resolve within the supplied JavaScript graph; unresolved CommonJS requires and non-source executable assets prevent admission.

The gate is intentionally conservative. The target's private owner-property reads remain subject to the existing local-object proof. A bound wrapper may be exported; the target binding itself may not be exported.

## Evidence collected

| Evidence | Revision / run | Outcome |
|---|---|---|
| Hostile native-bind interception, Node | `8eee5ba`, run `45805360906` | Passed on Ubuntu, Windows, macOS |
| SNO bound-target interception | `8eee5ba`, run `45805369394` | Passed on Ubuntu, Windows, macOS |
| Same-file and sibling-module mutation matrix, plus grammar vetoes | `8eee5ba`, run `45805376363` | Passed on Ubuntu, Windows, macOS |
| Selector snapshot regression | `8eee5ba`, run `45805382915` | Passed on Ubuntu, Windows, macOS |
| Ordinary-minifier control | `56af133`, run `45801390490` | Passed on Ubuntu, Windows, macOS |
| Bound export metadata/source stability | `56af133`, run `45801396935` | Passed on Ubuntu, Windows, macOS |
| Real Chromium bound-target interception | `912df9`, full run `45803413065` | Browser step passed; overall run had one unrelated selector-snapshot regression, fixed in `8eee5ba` |
| Final full manual validation | `8eee5ba`, run `45805807618` | Passed on Ubuntu and Windows; behavior/adversarial suite, JSDoc, performance, paired profiles, native/emitted whole-process budget, and Ubuntu Chromium gates passed |
| Final full manual validation | `8eee5ba` | Pending at report creation |

The positive interception witness demonstrates that a hostile pre-import preloader can capture the actual target function object and its source. The captured source contains the **rewritten** owner-property names, not the original spellings. Native and generated execution preserve the tested values.

The negative mutation witnesses exercise same-file and sibling-module custom `Function.prototype.bind` replacement in COO, SNO, and SCO. In each mode, the bound target's owner properties remain unchanged while an unrelated direct-call control still receives one safe property rewrite. This is important: the refusal is local to the uncertain target, not a graph-wide disable of all property renaming.

A separate Agent 10 witness, `test/agent10-bind-in-source-custom-bind-escape.test.js`,
runs an in-source replacement that passes the target function through
`this` to an opaque host callback, then invokes the bound wrapper. It checks
all three modes, requires zero property rewrites for that target, and asserts
native/transformed runtime parity. This is the in-program source-observer
case; it is distinct from the out-of-band hostile-preloader test, where
capturing the already-rewritten target source is expected.


Each positive fixture rewrites exactly two private owner properties (the `secretField` and `otherField` keys). The minifier control is deliberately included to prevent an inflated security claim. The result is consistent with ordinary property-mangled minification; the experiment expands the compiler's rewrite coverage but does not establish an advantage against a capable analyst.

## Integration issue found and fixed

The first full run at `912df9` exposed a regression in `experimental-selector-file-admission.test.js`. The new eligibility gate read the lazy `closedWorld` option before caller-supplied function-selection arrays had been snapshotted. A getter on `closedWorld` mutated the original array before selection normalization.

The gate was moved after selected-function snapshotting. The existing regression test then passed in the focused three-OS run `45805382915`.

A separate TypeScript check found an implicit-any parameter in the local bind-call predicate; JSDoc was added. The latest focused runs include the typecheck.


The full run's source-paired direct-alias compiler A/B step was skipped. The
workflow's other randomized-source/post-answer audit is not an independently
blinded LLM comparison. Therefore this experiment contributes **no anti-LLM
resistance result**; the Critic's private-delivery and hidden-verifier gate
remains unsatisfied for this candidate.

## Security boundary and limitations

- A hostile host preloader can patch `Function.prototype.bind`, receive the actual target function object, call its native `toString`, and capture the **transformed** target source. This experiment does not prevent that.
- The proof is a rewrite-eligibility condition under a caller-supplied closed-world contract, not a proof against arbitrary host modification, runtime instrumentation, or dynamic loading outside the supplied graph.
- The current grammar is intentionally narrow and may reject useful real-world code containing ordinary helper calls, local classes, destructuring, or computed accesses. Yield and compatibility must be measured before widening it.
- The lexical gate is not a complete JavaScript effect system. It should receive adversarial review, especially for aliasing through local containers, getters, cycles, CommonJS loader behavior, and host-provided objects.
- No claim is made that this provides source secrecy, tamper resistance against an attacker controlling the runtime, or a novel cryptographic property.

## Next work

1. Preserve the successful full manual-validation receipt `45805807618` at code revision `8eee5ba`, including the real Chromium bound-target interception test added to `npm run test:browser`.
2. Obtain independent review from Agents 2, 3, and 10; require concrete counterexamples or reproduced green tests rather than approval by assertion.
3. Compare the narrow lexical gate with Agent 9's ambient-call effect-summary work before attempting to widen the grammar.
4. Keep the experiment branch isolated. If validation and review remain sound, propose a selective port of only independently validated pieces into the existing PR #379; do not create a competing PR or port the entire diverged branch. Do not promote this experiment to `results/` or treat it as release clearance.

## Repository integration status

At the report checkpoint, the experiment branch compared with `main` as
121 commits ahead and 84 behind. It contains earlier ESM/path/SRI/Unicode
work in addition to this bound-target experiment. The branch is therefore
not a merge candidate as a whole. Critic's direction is to keep it isolated
and, only after exact validation and independent review, consider selective
porting into the existing PR #379. No competing PR is being created.

## Selective-port boundary

Relative to the pre-experiment checkpoint `b6f09a491d7ee0889cf730cb85cc65bc6b3f8abd`,
the 34-commit code delta through `8eee5ba` touches eight files:
`package.json`, `src/ast.js`, `src/core.js`,
`src/cross-properties.js`, `src/properties.js`,
`test/agent10-bind-in-source-custom-bind-escape.test.js`,
`test/agent3-sibling-bind-prototype-mutation.test.js`, and
`test/sno-bound-runtime-interception.test.js`. In particular,
`src/cross-properties.js` threads the eligibility flag through its three
local-proof call sites; it must not be omitted from any selective port.
This eight-file delta is distinct from the experiment branch's much larger
121-ahead/84-behind divergence from current main.
