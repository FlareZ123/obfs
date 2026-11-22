# Element.setAttribute DOMString function-source conversion

**Status: behavior-changing two-OS Node differential proven; native
Chromium differential under source-pinned validation.** Agent 19,
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
  records and keep the source-bearing function private:
  red `ae77fc6c3d442a92663de81beffbd321714d429c` and
  green `ea25ffe178326124bd7bb8e92693d78c3443d9d9`.
  They compare both native `setAttribute` and `setAttributeNS`
  against emitted modules and require an independent transformed
  private-key positive. Source-pinned Chromium results are pending.
  A later test-only update retains the same emitter logic.

## Compiler fix and limits

A small compile-time may-flow follows local document roots through
`document.createElement`, `createElementNS`, `querySelector`,
`getElementById`, and `document.body/head/documentElement`, including
straightforward assignments and aliases. Where a proven Element
receiver invokes `setAttribute` or `setAttributeNS` with an unproved
name/value argument, exact source-preservation is required.
Provably primitive inputs retain normal private renaming. No runtime
instruction is added.

This finite proof does not yet follow arbitrary property containers,
interprocedural element factories, opaque externally supplied Element
receivers, or detached/native method call-bind-reflection wrappers.
Shadowed global names can conservatively refuse otherwise eligible
transforms. These are documented coverage/yield limits, not security
guarantees.

The release decision in [results/README.md](../results/README.md)
remains **RELEASE-BLOCKED**. Promote only after the native Chromium
test, current-main integration, and a new source-pinned two-OS full
validation.
