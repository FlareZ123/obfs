# Selected SCO object URL cross-realm admission (22 November 2026)

## Observable host difference and red-first compiler witness

The selected SCO compiler moves a browser-origin private function to an
independently executed Node ESM module. Both runtimes expose the `URL` global,
but their object-URL registries are host-specific. Node's documented
[`URL.createObjectURL`](https://nodejs.org/api/url.html#urlcreateobjecturlblob)
returns `blob:nodedata:...` and stores the Blob in a per-thread registry.
Browser [blob URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob)
carry the creator's origin and storage-key restrictions. A JSON-visible string
from `URL.createObjectURL(new Blob(["x"]))` therefore does not retain its
native browser meaning when executed on the server. A local Node 22.16.0
probe independently produced a `blob:nodedata:<uuid>` value. We did not run
a separate real-browser differential trace for this experiment.

A red-first addition to
[`test/sco-private-host-effect-closure.test.js`](../test/sco-private-host-effect-closure.test.js)
asserted conservative refusal for six selected-export/private-helper shapes,
including direct and computed static members, method extraction, a constructor
alias and destructured method. It also asserted two positive controls:
`new URL("https://example.org/a").pathname` and an ordinary owned record
whose property keys happen to be `createObjectURL` and `revokeObjectURL`.

At exact source `81576acb90c26de77815913185daaf335490897f`,
the existing Ubuntu/Windows
[graph workflow 44997988348](https://github.com/FlareZ123/obfs/actions/runs/44997988348)
returned **one red test per platform**, explicitly identifying the missing
exception for the direct `URL.createObjectURL(new Blob(["x"]))` program.
The other tests passed. This is evidence of missing compiler admission and
a documented host-value discrepancy, not an end-to-end browser execution
counterexample or a breach of a deployed production system.

## Correction and reproducibility

`src/sco-selective-partition.js` now applies a selected-private-only source
check for first-class/global `URL` references other than a direct `new URL`
constructor call. It prevents the six tested object-URL forms while retaining
the two positive controls. The check is intentionally conservative; a local
binding that shadows the global name `URL` may also be refused. Unlike the
broader host API audit, this guard is **not** applied to explicitly reviewed
static private ESM dependencies, which can intentionally use the Node host API
under their original server-only contract.

The pre-existing
[`docs/SCO_PARTITION.md`](../docs/SCO_PARTITION.md)
now describes this supported subset. The focused Linux/Windows
[graph workflow 44998140269](https://github.com/FlareZ123/obfs/actions/runs/44998140269)
passed **63/63 cases per platform**, real generated SCO graph consistency
and strict JSDoc at exact source
`d917d58d3f2d7242345e689c14733e52405ba717`.
A full Node/Chromium integration matrix has not yet been attributed to this
source pin.

## Constructor recovery follow-up

The initial direct-spelling guard could be bypassed through a freshly built
URL instance: `(new URL("https://example.org")).constructor.createObjectURL(...)`.
A red-first regression also tested an assigned instance and computed
`["constructor"]` property, with an unrelated owned-record constructor
as the positive control. The
[Ubuntu/Windows run 44998354035](https://github.com/FlareZ123/obfs/actions/runs/44998354035)
at exact source `30cde7e41ad1c691f01e1025907db82ef23bbdd6`
failed on both platforms for the first recovered-constructor expression.
Local Node 22.16.0 independently confirmed `new URL("https://example.org").constructor===URL`
and that it exposes the `blob:nodedata:` object URL method.

The scanner now traces simple local variable/assignment aliases originating
from direct `new URL(...)` and declines their `constructor` extraction,
computed unknown property reads, and direct new-instance constructor access.
The same existing graph workflow
[44998450266](https://github.com/FlareZ123/obfs/actions/runs/44998450266)
at exact source `e9e18b219fc56d5a63f4fc46769f1715936ff991`
passed **all targeted cases and strict JSDoc on Ubuntu and Windows**.
This is still a bounded syntactic proof; arbitrary nested destructuring and
higher-order value escapes require separate analysis.

## Boundaries and next investigations

The refusal covers directly spelled `URL` constructor uses in the selected
function/helper AST. It is not a whole-program provenance proof for indirect
constructor recovery through `instance.constructor`, prototype chains,
higher-order values, or opaque host APIs. These require independent analysis
and may warrant a broader refusal if a reproducible accepted counterexample
is found. Preserve positive URL parsing behavior when tightening the guard.

This is a **compile-time semantic soundness correction**. Accepted output
does not gain runtime instructions or proven hostile-client resistance from
this guard. No universal 2.5× bound, static-reconstruction advantage,
anti-VM protection, or SCO anti-relay property follows. The primary
release decision remains **RELEASE-BLOCKED**.
