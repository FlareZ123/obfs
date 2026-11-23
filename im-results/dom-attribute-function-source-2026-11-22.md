# Element.setAttribute DOMString function-source conversion

**Status: behavior-changing two-OS Node and native Chromium red
differentials reproduced; bounded guard green in full native Chromium and
two-OS focused CI.** Agent 19,
22 November 2026. Research branch
`agent19/dom-attribute-string-source-20261122`. Companion red branch
`agent19/dom-string-native-red-20261122`. This work targets semantic
preservation only. It is not evidence of obfuscation attacker-cost gains,
universal tamper resistance, or the 2.5× runtime budget.

## Mechanism and source

The [DOM Standard](https://dom.spec.whatwg.org/#dom-element-setattribute)
defines `Element.setAttribute` using a `(TrustedType or DOMString)` value;
`setAttributeNS` similarly converts its name/value inputs. Web IDL
`DOMString` conversion performs ECMAScript string conversion for ordinary
inputs. A function value can expose its exact native `Function#toString`
through `element.getAttribute(name)` after assignment. If an obfuscator
changes that function's private identifiers or property spellings, the
observable attribute value changes.

The original `src/ast.js::observesFunctionSource` did not recognize
provable DOM Element attribute-write receivers. The compiler could
therefore modify a private function passed to native
`Element.setAttribute` while preserving its executable return value.

## Reproducible red/green record

- **Focused red:** Node 22 on Ubuntu and Windows,
  [run 45084515378](https://github.com/FlareZ123/obfs/actions/runs/45084515378)
  at `5fc589a78d8a2a2bdf8c419daa664712bfa3d95d`, where the
  four direct, computed, aliased-receiver, and namespace attribute
  negative cases changed the returned source text. Representative
  observed native text:
  `function inspect(){const state={secretField:31};return state.secretField;}`.
  Emitted text contained generated `_v...` and `_p...` names while
  returning the same number 31. The separate primitive-only positive
  passed, establishing an actual rewrite opportunity.
- **Focused green:** [run 45084519678](https://github.com/FlareZ123/obfs/actions/runs/45084519678)
  at `943e58b1eaa4f2f53c71b5a86352bde01bce663b`,
  Ubuntu and Windows passed the same behavioral and analyzer cases
  with the unrelated private-key positive and strict JSDoc.
- **Browser-native:** the first Chromium fixture at
  `c09a4095a5d489f615f7884898916b043e154a7f`
  [run 45084124708](https://github.com/FlareZ123/obfs/actions/runs/45084124708)
  passed, but its negative source-bearing function was nested inside
  an exported public callable, which other compiler source guards
  may already protect. That passing browser test **does not establish
  the targeted fix**.
  The corrected fixtures export only already-converted primitive
  records and keep the source-bearing function private. With the
  **unpatched** compiler at `ae77fc6c3d442a92663de81beffbd321714d429c`,
  [full native Chromium red 45084461970](https://github.com/FlareZ123/obfs/actions/runs/45084461970)
  reproduced the exact string mismatch for both `setAttribute` and
  `setAttributeNS`. It reported `negative.properties=1`,
  `negativeContainsSecret=false`; actual output text substituted generated
  `_v...` and `_p...` tokens, while primitive positive still renamed
  its unrelated private property. The patched native Chromium comparator
  at `ea25ffe178326124bd7bb8e92693d78c3443d9d9`,
  [run 45084466723](https://github.com/FlareZ123/obfs/actions/runs/45084466723),
  passed the complete native Chrome workflow.
- **Bound and reflected methods:** Added seven extra native attribute
  invocation cases: bound setter, transitive bound alias, direct
  `.call`/`.apply`, `Reflect.apply` on direct and detached method
  references, and bound namespaced setter. The initial first guard
  [red focused 45084846257](https://github.com/FlareZ123/obfs/actions/runs/45084846257)
  at `43dfe3e9a6890c6f598c7438811460b6f785bc3a`
  failed three out of seven new negative cases on both OSes while its
  existing positive remained safe.
  Fixed bounded arity and method alias proof in
  [two-OS focused green 45084975460](https://github.com/FlareZ123/obfs/actions/runs/45084975460)
  at `9733deb2453f1fd1f7ced2ddd1b5c11304eaa7fa` with strict JSDoc.
  **Full native Chromium** including all eight direct, namespace, bound,
  `.call`, `.apply`, `Reflect.apply`, detached and namespaced
  attribute readback paths passed
  [run 45085069381](https://github.com/FlareZ123/obfs/actions/runs/45085069381)
  at `dbf4fbae8fa586af55ce02670ff8d6b8ff4497e2`.
  The literal-only positive still renamed its unrelated private property.

- **Local Element factory and destructured setter methods:** A further
  four-case extension covered a local function returning an Element, an
  arrow-returning factory, a destructured `setAttribute` method, and a
  destructured `setAttributeNS` method. The earlier guard
  [red focused 45085449544](https://github.com/FlareZ123/obfs/actions/runs/45085449544)
  at `5f070d0bda47621a1a60f492204074aaf76deea4`
  missed the latter three cases on both OSes, despite passing the
  independent literal-only positive. Bounded factory-return and
  destructured-method may-flow corrected those misses:
  [focused two-OS green 45085522164](https://github.com/FlareZ123/obfs/actions/runs/45085522164)
  at `22bf3172be7570a00ea5b29e1fa5e32d915de2b0`,
  including strict JSDoc.
  An initial expanded Chrome test run
  [45085574449](https://github.com/FlareZ123/obfs/actions/runs/45085574449)
  failed before browser execution due to a **test-only missing comma** in
  a generated HTML string array, fixed at `4cd439f7318e9b8f1ff875b53d15659b57fb50fd`.
  The corrected **full Chromium run**
  [45085758590](https://github.com/FlareZ123/obfs/actions/runs/45085758590)
  passed all native setter cases, including factory, destructured normal,
  and destructured namespaced cases with a real transformed positive.
- **Full Node integration:** Ubuntu and Windows full validation
  [run 45085651908](https://github.com/FlareZ123/obfs/actions/runs/45085651908)
  at `7097cb6fe426ce0d7da67594d2561a2cb0813202`
  passed the complete project suite. The only later source change was
  the test fixture comma fix noted above, so the implementation is
  identical. The final **full Ubuntu and Windows Node GREEN**
  [run 45086112082](https://github.com/FlareZ123/obfs/actions/runs/45086112082)
  at exact `4cd439f7318e9b8f1ff875b53d15659b57fb50fd`
  matches the **full native Chromium GREEN**
  [45085758590](https://github.com/FlareZ123/obfs/actions/runs/45085758590)
  at the same source SHA. Both outcomes completed successfully.

## Compiler fix and limits

A small compile-time may-flow follows local document roots through
`document.createElement`, `createElementNS`, `querySelector`,
`getElementById`, and `document.body/head/documentElement`, including
straightforward assignments and aliases. Where a proven Element
receiver invokes `setAttribute` or `setAttributeNS` with an unproved
name/value argument, exact source-preservation is required.
Provably primitive inputs retain normal private renaming. No runtime
instruction is added.

The method-refinement additionally follows locally acquired native
setters across direct `.bind`, `.call`, `.apply`, simple identifier
aliases, and `Reflect.apply`. It conservatively records the greatest
potential DOMString-input arity for a variable that may refer to multiple
setters. This adds compile-time analysis without adding runtime work.

The receiver proof also admits bounded local functions and arrow
functions whose body directly returns a proven Element. Method alias
summaries handle straightforward destructuring from such an Element.

This finite proof cannot establish arbitrary property-container provenance,
multi-branch/nested return factories, opaque imported Element factories,
externally supplied Element receivers, or arbitrary reflection aliases
without known native setter capability. Shadowed global names can
conservatively refuse otherwise eligible transformations. These are
documented coverage/yield limits, not security guarantees.

A separate real Chromium red witness demonstrates that reflected DOMString
properties such as `element.id` and `element.textContent` also expose
function source. Those **assignment sinks are not fixed by this attribute
method PR**; see
`im-results/domstring-reflected-property-source-2026-11-22.md` on branch
`agent19/domstring-reflected-property-red-20261122` and
[native Chrome red 45085898680](https://github.com/FlareZ123/obfs/actions/runs/45085898680).
A general source-coercion registry covering calls and native assignments is
a separately motivated canonical improvement.

The release decision in [results/README.md](../results/README.md)
remains **RELEASE-BLOCKED**. The measured implementation passed
native Chromium, all focused two-OS tests, and full two-OS Node integration.
The **same-SHA** full Node and native Chromium checks are complete.
Integration onto the canonical current-main source observer, followed
by a fresh merged-SHA gate, remains a separate prerequisite for promotion.
