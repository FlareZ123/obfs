# Ten native Web IDL string sinks reveal observable transformed function source

**23 November 2026. Intermediate native-browser evidence, Agent 1.** This is a
single reusable source-coercion capability matrix and a diagnostic of compiler
semantic parity. It is not an obfuscation-strength result, source-recovery
claim, general Web IDL completeness proof or production release pass.

## Source, runner and raw data

- Exact browser source pin: `7b5b50f1f732de3cd3f0f21f0019be61056a2ebc`, branch `agent1/cssom-setproperty-source-20261123`.
- Reproduction: `sims/webidl-coercion-capability-matrix.js`, invoked from a branch-only `.github/workflows/manual-browser.yml` step.
- GitHub Actions [manual Chromium run 45098765486](https://github.com/FlareZ123/obfs/actions/runs/45098765486), Ubuntu runner, Node 22.23.4, `CHROMIUM_BIN=google-chrome`.
- The **matrix step succeeded**. The overall browser workflow subsequently exited **red at the intentionally failing, independent CSSOM source-parity regression**; all preceding integration steps, including the matrix diagnostic, completed successfully.
- Full machine-readable original/emitted strings, metrics and classifications are in [the source-pinned JSON matrix](webidl-domstring-source-capability-matrix-2026-11-23.json). This report draws claims only from that exact run.

For each sink the script serves four real browser ESM modules from a local HTTP origin: original source-bearing function, COO-emitted function, an independently original literal-valued positive, and its COO-emitted counterpart. The source-bearing private function is **not exported**; the module exports only the already-observed string and a numeric result:

```js
function inspect(){const state={secretField:31};return state.secretField;}
const el=document.createElement("div");
el.setAttribute("data-observed",inspect);
export const result={
  observed:el.getAttribute("data-observed"),
  number:inspect()
};
```

Every sink is a finite stand-in for a potential implicit native
`ToString` / `DOMString` / `CSSOMString` observation. The script also
tests whether the unrelated literal-valued positive can still rename a
private owner without altering outputs.

## Measured capabilities

| Native family | Exact measured sink | Source observed in Chrome | Native/emitted text parity | Literal positive parity | Properties renamed, negative/positive |
| --- | --- | --- | --- | --- | --- |
| CSSOM | `CSSStyleDeclaration.setProperty` | Yes | **No** | Yes | 1 / 1 |
| DOM attribute | `Element.setAttribute` | Yes | **No** | Yes | 1 / 1 |
| CSS utility | `CSS.escape` | Yes | **No** | Yes | 1 / 1 |
| Reflected DOM attribute | `Element.id = function` | Yes | **No** | Yes | 1 / 1 |
| DOM text | `Element.textContent = function` | Yes | **No** | Yes | 1 / 1 |
| Document node factory | `Document.createTextNode(function)` | Yes | **No** | Yes | 1 / 1 |
| Document node factory | `Document.createComment(function)` | Yes | **No** | Yes | 1 / 1 |
| Element text insertion | `Element.insertAdjacentText("afterbegin",function)` | Yes | **No** | Yes | 1 / 1 |
| Element child insertion | `Element.append(function)` | Yes | **No** | Yes | 1 / 1 |
| Element child replacement | `Element.replaceChildren(function)` | Yes | **No** | Yes | 1 / 1 |

**Aggregate at this one source pin:** 10/10 native source observations,
10/10 transformed source-text mismatches and 10/10 passing literal-valued
positive comparisons, with **one independently counted private property
rewrite** in every original negative and positive transformed module.
The numeric `inspect()` value is 31 in each compared module.

The CSS.escape, Element.setAttribute, Element.id and Element.textContent
families overlap Agent 19's earlier direct native evidence and
[capability-graph proposal](../workplace/webidl-source-coercion-capability-graph-2026-11-22.md).
This matrix adds a uniform source- and yield-checked native browser
witness for `Document.createTextNode`, `Document.createComment`,
`Element.insertAdjacentText`, `Element.append` and
`Element.replaceChildren`. CSSOM setProperty was independently
established by Agent 1 across six call shapes in
[run 45097230788](https://github.com/FlareZ123/obfs/actions/runs/45097230788).
Related normative interfaces appear in the
[WHATWG DOM Standard](https://dom.spec.whatwg.org/) and
[CSSOM Standard](https://drafts.csswg.org/cssom/).

## Test-harness correction and validity

The first matrix prototype inadvertently emitted
`String(hostReadback())` **inside the very source that was to be obfuscated**.
The compiler conservatively classified that explicit unknown return-value
stringification as a possible function-source observer, refusing private
renaming. The harness then appeared source-parity-safe, masking the intended
native implicit conversion defect. The repaired source uses the host getter's
already-string-valued result directly, and requires the CSSOM negative to
exercise at least one real private-property rewrite. This prevents the
regression from silently passing through unrelated no-op refusal. The
intermediate runs with the faulty probe are **not evidence of compiler
correctness**.

A later run stopped at strict JSDoc before reaching the matrix. The test
scripts were added to external strict type checking; conversion of the VM
module export through `unknown`, an explicit server.listen completion
callback and removal of a duplicated object property corrected those
errors. Two-platform strict project and external JSDoc
[focused run 45098587033](https://github.com/FlareZ123/obfs/actions/runs/45098587033)
passed at exact `8806a1030943e1516e50ea1fa76bf7b79f6a7b7e`.
The final matrix browser source pin incorporates those fixes.

## Repair implications and limits

A broad per-method spelling refusal, such as blocking all calls named
`setProperty`, would misclassify an ordinary userland object and lose
renaming yield. The [separate two-owner constraint](../workplace/agent1-source-observed-owner-closure-2026-11-23.md)
shows that freezing only the observed function's source span can also
break numeric behavior when an owner definition **outside** the function
is renamed. The proposed direction is a bounded capability graph with
receiver provenance, source-bearing argument flow and source-reachable
owner/key closure. The target is to preserve exact native source while
still transforming proven independent private owners. This is a
design requirement, **not an implemented proof**.

These ten checks are from one browser engine, one function template and
one compiler seed per sink. They do not establish behavior for every Web IDL
conversion, dynamic call target, service worker, future browser revision,
proxy, monkey-patched host method or script execution environment. A passing
literal positive verifies a narrow useful transform; it does not imply
strong static/dynamic reconstruction resistance, tamper resistance,
authorized-only execution, or universal compliance with the 2.5× compute
budget. The repository release verdict remains **RELEASE-BLOCKED**.

**Coordination:** Feed this consolidated source-pinned matrix to Agent 3's
canonical source-observer integration and Agent 19's shared Web IDL
capability-graph investigation. Avoid ten independent overlapping API-fix
stacks; use one receiver-/owner-aware vertical slice with a consistent
native/compiled/positive gate.
