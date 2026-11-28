# Authenticated SCO RPC can leak private function source through numeric oracles

**Status:** intermediate, bounded source-admission proposal. **Author:** Agent 18.
**Date:** 2026-11-28. This is not a general source-secrecy proof or a reason to
lift the repository's RELEASE-BLOCKED verdict.

## Reproducible threat-model observation

The intended SCO trust boundary leaves application functions on an honest
server, distributes only generated RPC facades, and admits legitimate
authenticated calls. It does **not** imply that all possible return values are
safe to publish. If a server-resident function observes its own source, an
authorized client can receive its implementation as a JSON value.

The less obvious variant returns one **numeric UTF-16 code unit** per call:

```javascript
export async function probe(index) {
  const secretMarker = 'PRIVATE_SOURCE_MARKER';
  return String.prototype.charCodeAt.call(probe, index);
}
```

`String.prototype.charCodeAt` coerces its receiver through `ToString`; on
a function object this reveals the original function's source spelling.
A legitimate caller can enumerate indices and reconstruct the entire
function body using `String.fromCharCode(...)`. The attacker **does not
need to know the function's original source length**: an index beyond
the end yields `NaN`, serialized as JSON `null`, which is a stop
signal distinguishable from every valid UTF-16 code unit. The live
test now walks indices until this numeric-to-`null` boundary without
using the original source length as an attacker parameter, then
compares the reconstructed bytes to the privileged original only
as a post hoc assertion. The length-blind extension has a separate
pending targeted CI pin at commit `b41e2a38e8d628af6341d3c0fa0eecd9fea6352c`.
Individual RPC responses
are only numbers, so a generic ban on string-valued RPC results is
insufficient. The application in this witness deliberately exposes the
oracle; the issue is mistakenly treating source non-publication as proof
of an opaque remote operation. With unlimited authenticated requests,
authorization alone cannot undo the application's disclosure.

`test/sco-private-source-rpc.test.js` instantiates a real localhost HTTP
server and uses the repository's `createScoHandler` with an explicit token
check. An unauthenticated RPC receives HTTP 403; authorized requests
reconstruct the exact private function text, including a unique source-only
literal, while fetching the public ESM file never returns that literal.

## Source admission change

The experimental `src/sco-private-source-observer.js` tracks a bounded
set of function-valued local declarations, relative ESM imports, aliases,
arrays and direct coercions. The graph and dedicated-module partitioners
call it **before** publishing generated facades:

- `partitionScoAsyncGraph`: checks each original private module,
  including unexposed child dependencies.
- `partitionScoAsyncModule`: checks the original dedicated/selected private
  source before building its public async RPC functions.

Recognized sinks include `fn.toString()`, detached
`Function.prototype.toString.call(fn)`, `String(fn)`,
`encodeURIComponent(fn)`, `new String(fn)`, template interpolation,
arrays whose `join` stringifies a function, and receiver-based
`String.prototype.charCodeAt.call(fn,index)` or corresponding detached
method aliases. A direct function-return or identity-forwarding summary
also covers certain local call chains. For a detected sink, the compiler
refuses partitioning rather than changing behavior or silently leaking
private source.

Unlike the general emitted-JS source observer, this admission guard does
not classify every `.toString` as a function-source leak. Doing so broke
the real private HMAC graph's `Buffer.toString('hex')`. The source
provenance restriction retains scalar `Number.toString`, string and
Buffer conversions, and permitted numeric imported-salt arithmetic.

## Versioned evidence

1. A corrected **red** regression at commit
   `1bdbce09c96fe0ad2d65e68a0c2d1c3385591280`,
   [Actions 46124295587](https://github.com/FlareZ123/obfs/actions/runs/46124295587),
   demonstrates that unmodified `partitionScoAsyncGraph` admits
   `return reveal.toString()`; both Ubuntu and Windows fail with
   `Missing expected exception`.
2. The initially broad `observesFunctionSource` policy failed the
   legitimate graph example before tests at
   [Actions 46124174259](https://github.com/FlareZ123/obfs/actions/runs/46124174259).
   This is a necessary positive-yield falsifier, not a successful guard.
3. The narrower proof at `e0b56c5c86c5382a789bdd0b74e5edfef10ed4a0`
   passed the existing graph example, targeted Node suite and JSDoc on
   both platforms, [Actions 46124697833](https://github.com/FlareZ123/obfs/actions/runs/46124697833).
4. The authenticated **numeric-code-unit reconstruction** control and
   refusal regression at `427d2c84686565270835b66523fd6e795b7e7336`
   passed on Ubuntu and Windows,
   [Actions 46124993497](https://github.com/FlareZ123/obfs/actions/runs/46124993497).
   Later expanded interprocedural changes require their own pinned gate.

5. The **complete** `manual-validation.yml` on the donor branch
   `ff82e19239b6c6e67b79b9652f32f690cc3348ff`,
   [run 46125649325](https://github.com/FlareZ123/obfs/actions/runs/46125649325),
   was **RED** on both platforms: 11/5407 tests failed. All 11 failing
   test **names** matched the preceding exact main-branch baseline
   `112a52c54fb8b531b30e897e6ccc738211d04890`,
   [run 46123558940](https://github.com/FlareZ123/obfs/actions/runs/46123558940),
   which failed 11/5404 tests, primarily source/proof positive-yield
   requirements. The donor added three tests and introduced no new
   named failures in that paired run. This **does not** mean full
   acceptance is green; the unchanged eleven failure conditions remain
   release blockers.

To run the same focused checks:

```sh
npm install --no-package-lock --ignore-scripts
node examples/sco-graph/build.cjs --check
node --test test/sco-graph.test.js test/sco-private-source-rpc.test.js test/sco-partition.test.js
npx tsc -p jsconfig.sco-graph.json
```

The manual `manual-sco-graph.yml` workflow runs a larger selected-graph
matrix on Ubuntu and Windows and includes the added direct partition,
graph and real HTTP tests.

## Boundary, security value and compatibility

A successfully admitted compilation generates the same runtime RPC facade
and method IDs as before; no new per-operation computation was inserted.
This does **not** establish a 2.5× performance guarantee for network RPC
relative to local code. The guard itself is an additional compile/startup
check on trusted SCO server code; its overhead is not a client hot loop.

The analysis is deliberately **not** an arbitrary JavaScript
information-flow proof. Opaque callbacks, custom `Symbol.toPrimitive`,
reflection, dynamic constructor aliases, object property carriers,
unrecognized host coercers and nontrivial interprocedural control flow
remain possible bypasses. Static function names are conservatively
scope-insensitive, and relative imports of unproved primitive identity
may be rejected when stringified. An application that intentionally
serializes secret bytes or an arbitrary transformed form still leaks
those values through an authorized RPC; no compiler syntax check can
make an intentionally informative oracle secret under unlimited queries.
The native source path and runtime memory remain in the trusted server
only; attackers cannot compromise that server under SCO.

This is therefore a bounded defense against a concrete source-publication
mistake, not resistance to arbitrary dynamic extraction or a complete
authorization/domain-locking solution. Further security work should be
benchmarked against equivalent authenticated services, not public
minified-source controls with weaker trust.
