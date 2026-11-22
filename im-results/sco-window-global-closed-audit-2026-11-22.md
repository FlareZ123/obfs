# SCO selected-private Window global admission and primitive-local proof

**Date:** 22 November 2026  
**Agent:** 36  
**Classification:** intermediate compatibility/source-migration evidence. The compiler
now refuses an expanded explicitly documented host-API surface and admits a
narrow, proved local exception. This is neither an exhaustive host-global
analysis nor evidence of stronger obfuscation or authorization.

## Actual defect and boundary

In selected SCO, the designated browser private function and an optionally
audited static private ESM graph run in the trusted Node server. Unqualified
browser-owned `Window` global references do not necessarily denote the same
value in Node. In particular, `typeof caches` and `typeof origin` can return
valid but different values across the two realms; they need not throw.

The earlier shared `browserOnlyRoots` list covered thirteen names. Twenty
additional directly documented web/DOM globals were absent:

- Document/window state: `caches`, `origin`, `devicePixelRatio`,
  `isSecureContext`, `crossOriginIsolated`, `matchMedia`;
- Window scheduling: `requestAnimationFrame`, `cancelAnimationFrame`,
  `requestIdleCallback`, `cancelIdleCallback`;
- Browser constructors and observers: `MutationObserver`, `ResizeObserver`,
  `IntersectionObserver`, `FileReader`, `FileList`, `Image`, `Audio`,
  `HTMLElement`, `Element`, `Node`.

A local Node.js 22.16.0 check found all twenty names absent from
`globalThis`; this is an environmental observation, not a promise about
future Node versions or all browsers. MDN independently documents the web
members, including [Window.caches](https://developer.mozilla.org/en-US/docs/Web/API/Window/caches),
[Window.origin](https://developer.mozilla.org/en-US/docs/Web/API/Window/origin),
[devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio),
[isSecureContext](https://developer.mozilla.org/en-US/docs/Web/API/Window/isSecureContext),
[matchMedia](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia),
[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame),
[requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback),
and [FileReader](https://developer.mozilla.org/en-US/docs/Web/API/FileReader).

## Closed positive exception

Simply refusing every identifier whose spelling is a browser API
can reject deterministic local values, such as:

```js
const caches = 41;
export function deriveProof(value) { return caches + value; }
```

The static ESM collector now derives one *proven module-local* set from
AST binding counts. It admits a browser-spelled name only when a module-top
`const` initializer is a primitive AST literal and `collectBindings`
observes **exactly one declaration** of that identifier in the entire
audited source file. A nested same-name function parameter makes this
proof fail closed. Imported identifiers, assignment-derived values,
literals embedded in opaque expression trees, and ambiguous nested bindings
remain out of scope. The direct selected-export scanner retains its
separate, preexisting function-local ownership handling.

This is a conservative source admission check. It does not rename fields,
generate an alternative client program, or modify the runtime transport.

## Evidence

- **Red-first:** [run 44997356206](https://github.com/FlareZ123/obfs/actions/runs/44997356206),
  source `6478574762d5df4a164c0073b831cc76ab52cf6c`.
  Ubuntu and Windows both failed at the added
  `typeof caches` graph check because the prepatch compiler admitted it.
- **Unsafe-only guard and positive counterexample:** 
  [run 44997547277](https://github.com/FlareZ123/obfs/actions/runs/44997547277),
  source `e5d9ef39eb7155194868e0d7ff3c89c4697ef719`.
  Both platforms refused the newly added twenty host globals, then
  failed at the *safe* module-top `const caches=41` positive case.
  This established the need to recover legitimate acceptance.
- **Narrow positive proof implementation:** 
  [run 44997600435](https://github.com/FlareZ123/obfs/actions/runs/44997600435),
  source `07bdb600cadec04ba284e09843b1d42d5fbb7a52`.
  Targeted SCO and support simulation steps passed both platforms; the
  Ubuntu full job encountered the preexisting unrelated native IPv6
  Chromium `pending` problem. Check the linked job conclusion before
  claiming full platform success.
- **Concurrent guarded-import compatibility regression:**
  [run 44997873483](https://github.com/FlareZ123/obfs/actions/runs/44997873483),
  source `923ff09e17645114ae19f36b639eb36acc5e2511`.
  A concurrent main-only change by Agent 35 refused all
  `ImportExpression` nodes in a selected private export. This rejected
  the repository's previously supported `import('node:crypto')` trusted
  server examples and caused multiple original/generator HTTP positive
  tests to fail on both operating systems. The issue is independent of
  the expanded browser-global set; Agent 35 was notified.
- **Bounded module-import repair and integrated CI:**
  [run 44998327554](https://github.com/FlareZ123/obfs/actions/runs/44998327554),
  source `c2f6b1e6162f9d938f3a3dcce690bc58e10541cb`.
  A literal `node:`-prefixed builtin validated by Node's `isBuiltin`
  may remain a trusted server-side dynamic import, except explicitly
  excluded loader-capability builtins. Relative, computed, unknown,
  `import.meta` and opaque loader imports still refuse. A regression
  covers two accepted Node builtin cases and nine declined forms.
  The full Windows SCO targeted workflow and strict JSDoc **passed**,
  including the five-call real authenticated HTTP parity example.
  Ubuntu targeted SCO tests and support simulations also passed, but
  the full job again failed the unrelated, pre-SCO native Chromium IPv6
  smoke `test/sco-host-ipv6-browser.js:65` (`pending`).

The tests at `test/sco-private-host-effect-closure.test.js` exercise
sixty decline cases (20 names, direct selected export and two audited
graph depths), fourteen new positive module-literal cases (7 names,
two graph depths), an ambiguous-binding refusal, byte-identical
generated-client-source checks against no-static-audit production, and
independent inert record-field labels.

The real-HTTP regression in `test/sco-private-transitive-manifest.test.js`
checks a transitive `const caches=41` leaf, an explicit source re-export,
the original server ESM, the generated facade, five numeric inputs,
403 unauthorized rejection on the RPC route, and a 404 on private source publication. It uses an actual
localhost Node HTTP handler. Browser execution on every supported browser
has not been established by this test.

## Limitations and release consequence

The twenty-name list is a partial audited inventory. Unknown host globals,
dynamic reflection, aliases and arbitrary import hooks remain open.
Even with the literal exception, the conservative scanner may refuse
legitimate safe programs when symbols shadow across nested scopes.
The tests establish local behavior preservation and admission boundaries,
not a general JavaScript semantic proof.

Performance impact is compiler-side AST binding counting for an
opt-in private-source audit. For admitted input the emitted client file
has byte-exact equivalence to the same seed's direct-only build. No
runtime 2.5x bound is thereby established or improved. The main
`results/README.md` assessment remains **RELEASE-BLOCKED**.
