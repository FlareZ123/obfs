# Selective SCO intrinsic-realm mismatch and conservative proof guard

**Status:** intermediate correctness research, 2026-11-15. This is a reproducible negative compatibility witness followed by a bounded compiler refusal. It is not a security result.

## Mode and original behavior

A selected-SCO mixed ES module can contain:

```js
export async function protectedOp() {
  Object.prototype.__obfsRealmCanary = 41;
  return 1;
}
export function visible() {
  return ({}).__obfsRealmCanary ?? 0;
}
```

In an original single JavaScript realm, `await protectedOp();visible()` returns 41. After partitioning, `protectedOp` executes in the trusted server realm while `visible` executes in the browser realm. Those realms have different `Object.prototype` instances; a write on one does not populate the other. The observable output would become 0. Node `vm.createContext` creates separate intrinsic objects and the real test asserts the 41-versus-0 witness.

The issue is a semantic admission condition, independent of whether private function source stays on the server, authorization works, or the RPC client is instrumented.

## Reproducer and paired regression

- The actual compiler admission API is `src/sco-selective-partition.js::partitionScoSelectedAsyncExports`.
- Test source is `test/sco-intrinsic-realm.test.js`. The first tests cover explicit prototype access through private functions, public functions and both helper classes, plus an admitted independent control.
- A second four-value by six-alias matrix (24 refusal scenarios) covers `Object.getOwnPropertyDescriptor(Object,'prototype').value`, `Reflect.get(Object,'prototype')`, a binary-computed property spelling, a same-function computed-key alias, destructured `{prototype:proto}=Object`, and `({})['__'+'proto__']`.

**Pre-fix evidence:** targeted [Ubuntu/Windows run 43769778464](https://github.com/FlareZ123/obfs/actions/runs/43769778464), source `a0e0139df188ba6a6e4450e94e702c0c9e0da601`, had **53 passing / 1 failing out of 54 focused Node tests on each OS**. Test 14 was an expected failure: `Missing expected exception: Expected refusal for Object.getOwnPropertyDescriptor(Object,'prototype').value with value 7`.

**Post-fix evidence:** targeted [Ubuntu/Windows run 43770100025](https://github.com/FlareZ123/obfs/actions/runs/43770100025), source `ae45d1aa921601d3355a0ac7b085f5eec646031c`, passed the focused suite on both OS, including JSDoc, SCO browser client modules and real authenticated HTTP fixtures. The workflow runs `node --test` on its named SCO suite and `npm run typecheck` and `npm run typecheck:external`, with separate Chromium fixtures on Ubuntu.

The guard now refuses direct `.prototype` / `.__proto__`, known intrinsic computed-key ambiguity, direct `Object` and `Reflect` prototype reflectors, prototype reflection against known constructors, and destructuring their prototype. The static key reader reuses `src/ast.js::staticString` for bounded concatenated literals. The existing accepted safe sample remains admitted. These checks add parser cost at compiler/build time; runtime protected-work overhead of accepted output is unchanged by this admission guard, but this was **not** separately benchmarked.

## First-class reflective method follow-up

A subsequent independent alias-oriented regression added nine further
first-class or immutable-alias spellings: `const reflect=Object.getOwnPropertyDescriptor`,
`const reflect=Reflect.get`, `const alias=Reflect;alias.get(...)`,
`const alias=Object;Reflect.get(alias,...)`, a locally bound constructor
with a computed key, `globalThis.Object` aliasing, and destructured method
aliases from `Object` and `Reflect`. These patterns do not all carry the
literal `.prototype` spellings previously recognized.

The compiler now follows straightforward constructor and Reflect variable
aliases to a fixed point before examining body uses, and conservatively
refuses direct references to reflective methods and known prototype keys.
The [targeted SCO Ubuntu/Windows run 43770705761](https://github.com/FlareZ123/obfs/actions/runs/43770705761)
passed at immutable `9d53eb3147dec7011e5e2f92ada7c6346d34a219`
with the nine-case addition, strict JSDoc and browser SCO fixtures. This
extends the tested refusal coverage while reducing admission for some
legitimate introspective functions. No universal completeness claim follows.

## Independent legacy RegExp match-state counterexample

Node `vm.createContext` supplies an independent intrinsic `RegExp` state
for each realm. In one context `/(XY)(Z)/.test("XYZ");RegExp.$1`
returns `"XY"`; a second fresh context's `RegExp.$1` remains the
empty string. A mixed-module private match followed by a retained
public `RegExp.$1` read can therefore diverge after SCO relocation,
despite no visible `.prototype` property and no shared user global.

The new `SCO split must refuse legacy RegExp match state shared between
exports` test in `test/sco-intrinsic-realm.test.js` reproduces the
realm separation and checks compiler refusal for four literal and
immutable-alias public reads: `RegExp.$1`, `RegExp.lastMatch`,
`const Rx=RegExp;Rx["$"+"1"]`, and `const Rx=RegExp;Rx.input`.

**Pre-fix** [Ubuntu/Windows run 43770956356](https://github.com/FlareZ123/obfs/actions/runs/43770956356)
at `e1742cfd112e29e597afa14522ac1d1d85c783a0` failed the new
semantic refusal on each platform. **Post-fix**
[Ubuntu/Windows run 43771299189](https://github.com/FlareZ123/obfs/actions/runs/43771299189)
at `a2613893b92662e75293540d5264b6bd85aadb0c` passed both
platforms' targeted SCO tests, static checks and browser fixtures.
The compiler now refuses these legacy RegExp static state properties
(and their bounded computed and local alias spellings) wherever they
appear in a selected-SCO public or private body.

The evidence covers V8 legacy RegExp match properties in Node;
other JavaScript engines, alternate aliases and unrelated hidden
per-realm runtime state need separate investigation. It does not
establish a general realm-isolation equivalence theorem.

## Independent intrinsic static-object mutation witness

A separate three-family Node `vm.createContext` control checked mutations
to built-ins that do not access a `.prototype` property:

- `Math.__obfsRealmCanary=41` is observable from `Math` in the same
  context but absent in a second context.
- `JSON.__obfsRealmCanary=41` likewise remains only in the writing realm.
- `Error.stackTraceLimit=0` replaces the original V8 limit for one realm,
  while another context retains its default value 10.

The new `SCO refuses writes to realm-specific intrinsic static objects` test
in `test/sco-intrinsic-realm.test.js` checks the VM split, private write /
public read compiler rejection, first-class intrinsic aliases, global
constructor aliases and `Object.assign(Math,...)` mutation. This is a
conservative verifier: a module that writes a built-in but never relies on
that write across the split is still refused. Static member reads on
unmodified intrinsics remain supported.

The added refusal was validated in focused
[Ubuntu/Windows run 43771699712](https://github.com/FlareZ123/obfs/actions/runs/43771699712)
at immutable `3618667d2c573b0c52f3478fb259e39d2e8afef9`;
the complete selected SCO targeted workflow including browser fixtures,
JSDoc and the new test passed. This expands supported **refusal evidence**,
not evidence of application-level deobfuscation resistance. The full
integrated-suite validation is tracked separately.

## Mutation-matrix and browser-private ambient follow-up

The static mutation witness was expanded to 32 mutation spellings:
eight native objects and constructors (`Object`, `Array`, `Math`, `JSON`,
`Error`, `RegExp`, `Intl`, `Promise`) by four direct and
locally aliased write forms. A read-only `Math.PI` and
`Number.MAX_SAFE_INTEGER` public control remained accepted. The
[Ubuntu/Windows focused run 43772074557](https://github.com/FlareZ123/obfs/actions/runs/43772074557)
passed with this matrix at `a3697506b7f051dd396321c566e46542b3c78e7c`.

A distinct deployment hazard is private code that reads browser-only state.
The test builds a browser-like Node VM context exposing
`window.externalBridge.value=41` and a server-like VM context with no
`window`. The expression succeeds in the browser context and throws
`ReferenceError` on the server. The selective compiler had previously
admitted such a private export when no public export used ambient state,
despite the private operation becoming non-executable after relocation.
The admission guard now declines obvious browser globals (e.g.
`window`, `document`, `navigator`, `location`, browser storage),
direct `globalThis` members, simple global-object aliases and
destructuring. Negative examples retain ordinary browser-side public
exports. The targeted
[Ubuntu/Windows run 43772338478](https://github.com/FlareZ123/obfs/actions/runs/43772338478)
at `a6ceb7482f174a475f9f7dd7c5e4836fc5b903de` passed direct ambient
cases. A follow-up alias/destructuring matrix passed in
[Ubuntu/Windows run 43772538549](https://github.com/FlareZ123/obfs/actions/runs/43772538549)
at `bbf1c7467d660512168a91daaced1627277ebfbc`.

The wider [manual full-suite 43771808471](https://github.com/FlareZ123/obfs/actions/runs/43771808471)
was green on both platforms at `9e70a1dc7840a4c3077e005d827b9066384cf3c6`,
covering source changes through the intrinsic-state refusal and broader
suite/benchmark/browser gates. The subsequent browser-ambient admission
change was validated by the targeted SCO workflow only. All claims are
pinned to the tested commit, rather than projected onto future HEAD.

## Limits and follow-up

The checker remains syntactic and can still miss dynamic method aliases, opaque function calls that mutate intrinsic prototypes, alternate access paths through unmodeled native APIs, or other mutable realm state. Known first-class intrinsic method aliases are now refused; arbitrary alias graphs are outside this proof. Declining a known spelling is neither a general purity proof nor evidence of tamper resistance. The strict 2.5× runtime budget still requires representative whole-session measurement for each deployment.

Next: challenge the guard with independent alias-generation fixtures; improve refusal for first-class reflective methods without indiscriminately disabling useful object APIs; audit accepted clients for remaining cross-realm side effects. The private-source boundary remains subject to authorized chosen-input oracle and relay attacks.
