# Native-bound private-target property proof (experimental)

**Date:** 2026-11-26  
**Owner:** Agent 1  
**Implementation branch:** `agent1/exported-closure-owner-proof-20261126`  
**Implementation revision under validation:** `8eee5ba06475edfa2ee83ff24d353fda8ca3a6b8`  
**Status:** full `manual-validation.yml` gate passed on `7558e44` (Ubuntu and Windows, behavioral/adversarial suite, typechecks, performance profiles, and its integrated Chromium subset); broader `manual-browser.yml` Chromium suite also passed on comment-only successor `a16a46f` (run `45842358680`); experiment branch intentionally isolated

## Question

Can the local closed-world property proof safely treat a non-exported function binding as a private owner reader when its only source-visible use is to create a native bound wrapper that is itself exported?

The previous proof admitted direct private function invocation but rejected this bound-target shape. Four focused positive-yield controls were associated with this gap: bound runtime interception, bound minifier control, source-stable bound export, and SNO bound runtime interception.

This experiment extends rewrite eligibility for a deliberately narrow subset. It does **not** claim that native bound functions hide their target from a hostile host runtime.

## Candidate proof contract

The candidate is enabled only when the caller sets `closedWorld:true` and every supplied executable file passes the graph checks.

A candidate target must satisfy all of the following:

1. The target binding is a local, non-exported `const` initialized directly with an `ArrowFunctionExpression`. Ordinary FunctionDeclaration and FunctionExpression targets are refused because an externally constructed bound wrapper exposes the target through `Object.getPrototypeOf(new hot()).constructor`.
2. Every use of that target binding is a direct, noncomputed, nonoptional `target.bind(null)` call.
3. Each bind call has exactly one argument, the literal `null`; partial application and dynamic receivers are refused.
4. Every bind call is at top level, not nested in a function body.
5. The supplied graph contains no other call expressions, dynamic imports, `with`, `this`, constructors, tagged templates, async/generator suspension, iteration/spread/destructuring, class definitions, getters/setters/methods, or member-mutation paths admitted by the current lexical gate.
6. Dynamic computed member paths and known prototype/reflection escapes are refused. The denylist includes `constructor`, `prototype`, `__proto__`, legacy prototype getter/setter accessors, and CommonJS loader escapes.
7. Global capabilities such as `Function`, `globalThis`, `Object`, `Reflect`, `Proxy`, `eval`, `require`, `process`, browser globals, and runtime-specific globals are refused.
8. Unresolved ambient identifier references and parameter-derived host receiver/alias flows are refused. The only global exceptions are immutable language constants and the ordinary CommonJS `module.exports` publication write.
9. Static imports must resolve within the supplied JavaScript graph; unresolved CommonJS requires and non-source executable assets prevent admission.
10. Any `import.meta` use is refused. Its host-provided object may expose effectful getters that run before the top-level bind call and mutate the realm's `Function.prototype.bind`.

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
- The positive bound-target witnesses are same-file. Sibling-module tests are
  negative mutation controls only; they do not establish positive admission
  for an imported target or a cross-file owner alias. Treat those cases as
  unproven and fail-closed until dedicated positive and negative fixtures
  cover module cycles, imported bindings, and cross-file owner flow.
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


## 26 November follow-up: cross-file yield, receiver provenance, and new.target false-safe

The earlier scope note that cross-file owner admission was unproven is superseded for one narrowly specified ESM pattern. The current experiment branch has a reproducible positive witness:

- state.mjs exports a plain object { secretField: 23 }.
- app.mjs imports that object, defines a private local arrow function reading state.secretField, binds it with internal.bind(null), and exports only the bound wrapper.
- The external test harness calls the wrapper but does not import or inspect the owner object.
- test/agent1-bound-target-crossfile-probe.test.js asserts crossFile.properties === 1 in COO, SNO, and SCO; verifies that both modules no longer contain secretField; and compares result, bound wrapper name, and length.
- Focused workflow 45819017577 passed on Ubuntu, Windows, and macOS.
- The same fixture with a benign ESM import cycle (unused imported marker, no reentrant call) also passed all three modes/platforms in focused workflow 45820483598.
- A cross-file imported callable target with one formal parameter was refused (crossFile.properties === 0) while preserving runtime behavior in the same workflow.

These are bounded witnesses, not a general proof for arbitrary cycles, imported targets, re-exports, CommonJS interop, multiple owner importers, or custom loaders. The tested cycle is specifically benign and does not exercise TDZ reads or reentrant initialization.

### Native-bind gate hardening

An AST-only red/green regression exposed that the original graph-wide gate treated any syntactic .bind(null) call as native, including namespace methods, optional calls, inline function expressions, and aliases. The predicate now requires a non-optional direct .bind(null) call on a locally declared function or a const initialized directly with a function/arrow expression.

- Red focused workflow 45821213767 failed on the newly added receiver-provenance cases.
- Green focused workflow 45821674911 passed on Ubuntu, Windows, and macOS after the gate was tightened.
- The cross-file owner witness uses a local const internal = (...) => ..., so it remains within the intended admission grammar.

### Newly discovered semantic false-safe: new.target source coercion

Agent 2 independently identified a more serious false-safe in the private bound-target lane. new.target inside a target function is a MetaProperty, not a NewExpression; the prior gate did not reject it, and the source-observer analysis did not recognize that a relational comparison implicitly coerces the target function to source text.

A bound wrapper exported from the graph can be constructed externally. In new hot(), bound-function construction forwards the original target as new.target. Comparing that function with a string (for example new.target < 'function internal(){const x=owner.m') reaches Function.prototype.toString() through implicit primitive conversion. Renaming secretField can therefore change the comparison result and program output.

This was independently reproduced with Node v22.16.0:

- Native source: {"result":0}
- Manually renamed source: {"result":7}

The regression fixture is now ported as test/agent1-newtarget-bound-source-observer.test.js, with coverage across COO, SNO, and SCO. The experiment branch adds a conservative refusal for MetaProperty new.target in hasUnsafeNativeBindMutationSurface (commit c87d18fe6eba46be4f8f66f99a29c2033614b374). Focused and full CI for this correction are still pending; the native-bound lane must remain provisional until they pass.

### Current validation boundary

The prior full manual gate 45805807618 validates source revision 8eee5ba06475edfa2ee83ff24d353fda8ca3a6b8, before the receiver-provenance and new.target hardening. It does not validate the current source. The focused runs above establish only their exact test files and commits. A fresh full manual validation on the hardened branch is required before any promotion or porting. No security-strength claim follows from these parity/yield tests; hostile runtime extraction of the transformed target remains an acknowledged limitation.


## 26 November follow-up: constructibility and import.meta false-safe correction

**Implementation revision:** `7558e44c2492478c142ccf979e0ae33e27558dea` on `agent1/exported-closure-owner-proof-20261126`.

Agent 3 supplied a concrete external extraction counterexample to the earlier target grammar. When the exported bound wrapper targets a constructible ordinary function, an external consumer can call `new hot()`, then recover the target with `Object.getPrototypeOf(instance).constructor` and obtain its source with `Function.prototype.toString`. The earlier grammar admitted FunctionDeclaration and FunctionExpression targets, so the target could not be treated as private. The gate now admits only a local `const` arrow target; ordinary function declarations and expressions fail closed. This blocks that particular constructor/prototype extraction path because a bound arrow is nonconstructible. It does **not** block a hostile preloader from intercepting native `bind` and capturing the already-transformed target source.

A second Agent 3 witness showed that `import.meta` is not inert lexical metadata: the host can install an effectful getter on `import.meta.env` that mutates `Function.prototype.bind` before the module's top-level `internal.bind(null)` executes. The gate now rejects any `import.meta` use in the supplied graph.

Exact focused validation on revision `7558e44`:

| Test | Workflow run | Platforms | Outcome |
|---|---:|---|---|
| `test/agent1-native-bind-call-target-shape.test.js` | `45839483365` | Ubuntu, Windows, macOS | Passed |
| `test/agent1-bound-constructor-target-extraction.test.js` | `45839491149` | Ubuntu, Windows, macOS | Passed |
| `test/agent1-native-bind-import-meta-host-getter.test.js` | `45839499605` | Ubuntu, Windows, macOS | Passed |
| `test/agent1-bound-target-crossfile-probe.test.js` | `45839778770` | Ubuntu, Windows, macOS | Passed |
| `test/source-stable-bound-export.test.js` | `45839787982` | Ubuntu, Windows, macOS | Passed |

The first three runs include the focused runner's project and external JSDoc checks. The latter two preserve the narrow cross-file arrow-target positive and the source-stable bound-export positive after the new restrictions. The full manual-validation workflow was then rerun on `7558e44` and passed: [run 45840812964](https://github.com/FlareZ123/obfs/actions/runs/45840812964), with successful Ubuntu and Windows jobs. It executes the complete compact behavioral/adversarial suite, exhaustive low-rank oracle test, blind post-answer audit, project/external JSDoc checks, performance sample, paired session profiles, whole-process budget profile, and the workflow's integrated Chromium tests. The broader manual real-browser workflow [45842358680](https://github.com/FlareZ123/obfs/actions/runs/45842358680) also passed on `a16a46f` (Chromium job success); this successor changes only an explanatory comment, not executable code. The browser suite includes the hostile bound-target interception demonstration, so this pass is compatibility evidence and not a source-secrecy claim. The earlier full run `45805807618` remains evidence only for its older source revision `8eee5ba`.

Agent 10's Storage source-observer extension is a separate candidate attached to PR #382. Its full Node rerun and a review question about the reference-only Storage override's dependence on unmodified `WeakMap.prototype.set` remain outstanding. Do not combine its focused receipts with this branch's tests or treat either as a complete release gate.

### Current bounded claim

The admitted positive is a non-exported local arrow target, used only by a top-level literal-null native bind call, under the existing closed-graph and no-observer grammar. The current evidence establishes behavior parity and actual property rewrite yield for the listed fixtures. It does not establish general function-source secrecy, anti-instrumentation, tamper resistance, universal compatibility, or a universal 2.5× runtime bound.
