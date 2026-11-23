# SCO URL instance alias lexical provenance (23 November 2026)

## Scope

This is intermediate evidence about preserving semantics when a selected SCO private function is relocated from a browser-like runtime to Node. The result concerns source-admission correctness for native `URL` instance aliases. It does not establish strong obfuscation, static secrecy, anti-instrumentation resistance, or the 2.5× application performance budget.

## Confirmed compiler admission counterexample

The prior `usesUnprovedRelocatedUrlStatic` tracked URL-instance aliases by spelling in a single `Set<string>` across an entire subtree. Consequently, the following unrelated nested binding was incorrectly treated as provenance for an outer **free** `u`:

```js
export async function protectedOp(){
  function nested(){
    const u=new URL('https://example.org/a');
    return u.pathname;
  }
  return u.pathname;
}
export function visible(){return 7;}
```

The outer `u` has no lexical relationship to the nested `const u`. It can resolve to application-provided global state in the original browser and be absent or different in the relocated server runtime. Therefore, the fact that a same-named binding exists somewhere inside the function does not establish safe relocation.

[Two-platform red CI 45109756859](https://github.com/FlareZ123/obfs/actions/runs/45109756859), pinned to `b3d94f55f9af6c36d2c6e54d9ec4e5f2d6b7a15c`, showed `Missing expected exception` on Ubuntu and Windows for the nested free-reference case. This was a compiler admission negative assertion, not a runtime exception test. A similarly disconnected block form was included.

## Bounded correction

In `src/sco-selective-partition.js::usesUnprovedRelocatedUrlStatic`, source provenance now requires:

1. A direct `const` declarator at the immediate statement level of a known `BlockStatement` or `Program`.
2. A uniquely declared lexical identifier according to the existing `collectBindings` inventory.
3. A direct `new URL(...)` initializer or a previously proved immutable alias referenced inside that source alias's owning lexical scope.
4. Every later reference must remain inside the proof owner's lexical scope.

Unproved assignments, mutable declarators, for-head environments, first-class instance escapes and accesses from unrelated lexical scopes are refused. The existing direct scalar URL member-read and direct zero-argument `toString`/`toJSON` criteria remain. Some benign previously admitted mutable alias patterns are now conservatively declined. No additional runtime wrapper or emitted-code interpreter is introduced for accepted source.

The first fix passed the SCO graph integration and strict JSDoc checks on both OSs in [run 45109923406](https://github.com/FlareZ123/obfs/actions/runs/45109923406) at `e1ac0010e50651ec09d2737d2d8eb8bfc9d9ab93`.

Expanded tests added positive nested-function and nested-block `const` alias cases alongside negative disconnected references and inherited constructor access. [Expanded two-platform run 45110020307](https://github.com/FlareZ123/obfs/actions/runs/45110020307) at `70e5e9d857f2d1241bbc2699a0e0ab3e40705437` passed. The red and green pins are immutable and should remain associated with the exact tested sources.

## Boundaries and follow-up

- An AST ancestry proof alone does not establish that a cross-runtime URL parser behaves identically for every Unicode hostname, invalid URL, IDNA edge or host version. Those concerns require separate native comparisons.
- User-defined global objects, mutable host prototypes, proxy values, dynamic imports, and cross-boundary module identity remain outside this lexical alias proof.
- This probe is distinct from [SCO TextDecoder constructor/alias findings](sco-textdecoder-constructor-escape-2026-11-23.md), though both exposed the unsoundness of inferring lexical identity from matching text alone.
- A complete Node/Chromium application comparison and full integration run for this particular URL branch remain separate validation tasks.
