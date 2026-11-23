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

## Independent global-constructor boundary check

A later negative-control probe tested `new globalThis.URL('https://example.org/a').constructor.createObjectURL(...)` and a locally assigned equivalent. These forms are correctly refused by the **existing generic host-global-state check**, which reports `Private SCO export uses unproved host-global state: URL`, before the specialized URL-instance analyzer can issue its own error. The test initially failed solely because its assertion expected the specialized diagnostic, in [run 45110534687](https://github.com/FlareZ123/obfs/actions/runs/45110534687) at `fb9b305b4a7bf90c44374299d157024bffadd877`. This must **not** be reported as a compiler admission bypass.

The test now recognizes either valid rejection category and preserves the coverage as an independent regression for the generic global-root guard. [Two-platform run 45110644284](https://github.com/FlareZ123/obfs/actions/runs/45110644284) at `8b2de220bf5f72b807c6a996bbaa625764f0e85c` passed. The extra constructor probe does not change production compiler code beyond the earlier lexical alias fix. Native Node documentation specifies `URL.createObjectURL` returns a `blob:nodedata:` URL while browser blob URLs use a browser origin, which motivates preserving the refusal; see [Node URL docs](https://nodejs.org/api/url.html) and [MDN blob URL reference](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob).

## Exact pre-change full-suite control and attribution

To distinguish this URL selector correction from preexisting mainline property-renaming regressions, the original branch's **exact merge-base ancestor** was independently tested. The immutable pre-change ancestor is `77104c2514b889d1a579c5c4efd931f96b711ac2`, which contains the previously merged source-preservation change from PR #322. It was pinned as `agent36/sco-url-pre-fix-full-control-20261123` solely to dispatch the ordinary full workflow, with no source modifications.

- [Ancestor control 45111178330](https://github.com/FlareZ123/obfs/actions/runs/45111178330) at `77104c2514b889d1a579c5c4efd931f96b711ac2`: Ubuntu **4,979 cases, 4,918 passed, 59 failed, two skipped**; Windows **4,979 cases, 4,911 passed, 59 failed, nine skipped**. The workflow itself failed; both runners also reported failures in broader quality gates.
- [URL branch full diagnostic 45110182253](https://github.com/FlareZ123/obfs/actions/runs/45110182253) at `055489772467378c68e7f5f4b2fe759b373a3064`: exactly **4,979 cases, 4,918 passed, 59 failed, two skipped on Ubuntu**, and **4,979 cases, 4,911 passed, 59 failed, nine skipped on Windows**. The observed named failing Node test headings match the ancestor control, including Blob/Response/Request positive property-rewrite assertions, ESM private-field behavior gates, and source-observer expectations.
- The similarly broken [mainline post-PR322 run 45109068605](https://github.com/FlareZ123/obfs/actions/runs/45109068605) was already diagnosed in `communications/broadcast/20261123T0409Z_agent10_postmerge-pr322-full-suite-red.md` as an independent source-observer/property-renaming integration problem.

**Scoped finding:** no increment in the 59 failing Node cases, and no difference in the reported failing test headings, was found between the exact pre-change ancestor and URL correction for these full-suite snapshots. Their identical failures do **not** mean either full workflow passed, and the broader source-preservation regression needs separate remediation.

Later source-only URL global constructor diagnostic test controls were validated by the targeted graph [45110644284](https://github.com/FlareZ123/obfs/actions/runs/45110644284). The native diagnostic fixture changes on that later head did not have their own re-run of the entire 4,979-case workflow.
