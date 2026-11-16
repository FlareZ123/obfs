# Genuine multi-module SCO server-private graph

This sample extends the repository's existing single-module SCO partition to
a **three-source-file private ESM graph**, then emits exactly two public
browser/Node ESM facades. The original modules are
[`before/secret.mjs`](before/secret.mjs),
[`before/api.mjs`](before/api.mjs), and
[`before/audit.mjs`](before/audit.mjs). The two independently generated
facades in [`after/`](after/) are exact output from
[`partitionScoAsyncGraph`](../../src/sco-graph.js).

The private dependency `secret.mjs` holds the environment-supplied 256-bit
key, private HMAC rounds, and a recognizable source canary. `api.mjs` calls
it; `audit.mjs` imports `api.mjs` and verifies the derived digest. On the
server the original import chain runs as usual. Public facades import neither
`secret.mjs` nor `node:crypto`, and the SCO handler only serves those two
façades. This allows client imports of `derive` and `verify` while their
implementation remains on the trusted server.

The graph partitioner now attaches server-side `privateModulePaths` metadata
for each unexposed original module to every generated facade. If an integrator
accidentally co-publishes `secret.mjs` alongside either facade,
`createScoHandler` rejects the configuration before serving HTTP source.
This metadata is not emitted in the browser JavaScript. Independently
reviewed `publicPaths` remains the stronger positive publication boundary.
The [real HTTP negative control](../../im-results/sco-graph-publication-manifest-2026-11-16.md)
reproduces the source leak when the metadata is deliberately omitted.

From Windows 11 PowerShell, with Node.js 22 and dependencies installed:

```powershell
$env:OBFS_SCO_GRAPH_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
node .\examples\sco-graph\build.cjs --check
node .\examples\sco-graph\server.cjs
```

The server prints a loopback origin and a random demonstration header token.
Use `x-demo-token: <printed token>` on GET and POST requests. The
[`test/sco-graph.test.js`](../../test/sco-graph.test.js) runs the complete
localhost service and checks native-versus-remote values, authorization
denials, and private source nonpublication. The builder can regenerate the
exact two committed generated files with `--write`.

**Security boundary:** the trusted SCO server must retain all private
files and the key. These authentication headers are localhost test fixtures,
not a production user session or encrypted channel. A legitimate attacker
can make unlimited authorized requests, relay the function's results,
and inspect all public proxies. Client-side source observation, JSON
semantics, exception stacks, latency, and opaque web APIs do not generally
match arbitrary unpartitioned JS. This experiment requires explicitly
named async exports and deliberately scoped, JSON-compatible operations.
The graph coordinator declines missing relative dependencies, package
imports and dynamic import expressions. It does not automatically enforce
a production 2.5× budget; consult the pinned test and measurements in
[`im-results/sco-graph-partition-2026-11-15.md`](../../im-results/sco-graph-partition-2026-11-15.md).
