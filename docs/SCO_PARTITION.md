# Explicit SCO server-only ES-module partition

The programmatic helpers partitionScoAsyncModule and bindScoModuleExports create a narrow, reviewable server/client boundary. They are intended for trusted SCO deployments where an operator owns the server, can authenticate requests, and keeps original implementation modules outside the public route. Other modes cannot rely on this server trust anchor.

## Supported input and preserved interface

The default input must be a single .mjs module (or a .js module explicitly marked `sourceType:'module'`) whose statements are **direct named exported async function declarations or exported immutable async function expressions**. Supported forms include `export async function calculate(a,b){...}`, `export const calculate=async(a,b)=>...`, and `export const calculate=async function(a,b){...}`. Named function expressions also retain their explicit inner name in the generated proxy. Every function must use ordinary identifier parameters, cannot be a generator, and cannot reference `this` or `super`. Exports of mutable bindings, other values, default exports, export specifiers, synchronous functions, imports, and non-exported initializers are refused by default. This strict admission policy prevents the helper from shipping forgotten top-level secrets or silently dropping visible initialization effects. An explicit `serverOnlyInitialization:true` mode lifts the restriction on non-exported top-level code, described below.

The output contains a public `clientFile` with the same module path and named async exports. It preserves exported function names (including explicit function-expression names) and ordinary parameter count. All proxies use async functions so their `arguments` object preserves the actual number of supplied arguments, even when an original export was written as an arrow expression. Each proxy forwards its complete arguments list to an authenticated same-origin JSON RPC endpoint, including extra positional arguments. The original bodies are absent. The helper emits opaque per-method identifiers that are available in the public stub and must never be treated as credentials or secrets.

This is an explicit application contract: both inputs and outputs should be plain JSON-compatible data. JSON cannot transparently retain arbitrary functions, cyclic graphs, object identity, BigInt, undefined array elements, NaN, infinities, prototype classes, transferables, DOM handles, or browser-local state. The original function must have no externally required browser-side side effects. Source-based reflection such as Function.prototype.toString differs, as do exception stacks and completion timing. Under such conditions, operators must leave the original operation client-side or implement a custom transport and semantic adapter. There is no general semantics-preserving compiler from arbitrary JS to RPC here.

## Server integration

The following CommonJS example assumes the original private module is located outside the publicly served directory:

```js
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {
  partitionScoAsyncModule,
  bindScoModuleExports,
  createScoHandler
}=require('./src');

async function start() {
  const privatePath=path.resolve('server-private/protected.mjs');
  const source=await fs.readFile(privatePath,'utf8');
  const privateExports=await import(pathToFileURL(privatePath).href);
  const partition=partitionScoAsyncModule({
    path:'protected.mjs',
    sourceType:'module',
    code:source
  });

  const handler=createScoHandler([partition.clientFile],{
    remoteMethods:bindScoModuleExports(partition,privateExports),
    authorizeRead:request=>verifySession(request),
    authorizeRpc:request=>verifySession(request),
    authorizeOperation:(request,method,args)=>
      verifyPolicy(request,method,args)
  });
  http.createServer(handler).listen(8080);
}
start();
```

verifySession and verifyPolicy are application-defined placeholders. The private file must never be placed in the web root or included in the SCO handler's sourceFiles. The partitioned client file is served as /obfs/protected.mjs. A browser caller can continue using named asynchronous imports:

```js
import {calculate} from '/obfs/protected.mjs';
const result=await calculate(40,2);
```

For a nondefault routePrefix, set the matching same-origin absolute endpoint in partitionScoAsyncModule({path,code},{endpoint:'/your-prefix/rpc'}), and use the same routePrefix on createScoHandler. The partition seed is randomized by default; when deterministic reproducibility is required, provide a seed at build time and keep the corresponding server operation registry and client stub within the same deployment generation.

## Optional private module initialization

Set `serverOnlyInitialization:true` to keep arbitrary non-exported top-level initialization and private imports on the trusted server. The generated browser module contains only the exported async RPC stubs; it omits private imports, local declarations, and secret constants. Reexports and exports of values or functions outside the selected async declaration shape remain forbidden. A private ESM module can therefore import `node:crypto`, initialize a server-only secret, and export an async verification operation as a declaration or immutable async expression without shipping its crypto import or secret to the browser.

This explicitly changes the original module's client-side initialization behavior. Use it only for a deliberately private server module whose initialization is intended to execute on the trusted server. Do not assume that relocating arbitrary top-level effects preserves an existing browser app's semantics or timing. The integrator must load the original ESM module on the server before binding its functions.

## Selective server-only Node.js imports

The stricter mixed public/private helper `partitionScoSelectedAsyncExports` supports `allowServerImports:true` when its private async operation needs a static named import from a Node.js builtin. For example, `import {createHmac as serverHmac} from 'node:crypto'` remains in the original server module and is absent from the generated browser facade. The static imported binding is treated like a server-only constant: any retained public export or explicitly retained public helper that reads it causes a compile-time refusal.

The opt-in accepts only named imports from explicit canonical `node:` specifiers verified by Node's `module.isBuiltin`. It declines namespace/default imports, side-effect-only imports, relative files, package imports, unknown builtins, and unreviewed top-level module effects. Without opt-in all static imports retain the original refusal. The source module must be loaded on the trusted Node server, with its original import declarations intact; the compiler returns only the public client facade and never bundles private import code.

The same selective API accepts `privateModuleImports:['./private/engine.mjs']`, an explicit exact allowlist of canonical relative `.mjs` server dependencies beneath the source module's own directory. The import must use a simple named binding. The compiler refuses `../` paths, URL escapes, percent encoding, query or fragment aliases, directory-traversal spellings, and unsafe Windows names. It also refuses a retained public function or public helper that refers to any imported private binding. The trusted Node server resolves the original module graph, while the generated public module contains only the RPC facades and preserved public functions. There is no automatic deployment isolation: the operator must keep every private module outside publicly served directories and **must not** include private modules in the SCO `sourceFiles` list.

### Optional transitive private-source audit

The programmatic selective compiler also accepts `privateModuleSources`, an array
of `{path,code}` objects containing the exact UTF-8 source for **every
statically reachable private .mjs module**, including the direct modules named
in `privateModuleImports`. Example: supply
`privateModuleImports:['./private/engine.mjs']` alongside
`privateModuleSources:[{path:'private/engine.mjs',code:engineSource},
{path:'private/deep/secret.mjs',code:leafSource}]`. The compiler parses the
supplied files and follows canonical relative static imports and reexports
transitively, handling cycles and preserving each discovered path in
`clientFile.privateModulePaths`. It refuses missing dependencies, duplicate
case-insensitive paths, unrelated supplied files, noncanonical imports, unknown
bare imports, and direct runtime `import()` or common direct loader calls.
When `createScoHandler` receives source files directly, it now reads each
`privateModulePaths` and `privateOriginalDigests` getter exactly once,
validates the declared arrays, and uses owned copies throughout publication.
This prevents inconsistent successive getter values from making a declared
private source disappear during preflight. The first supplied declaration must
still be trustworthy and complete; a reviewed `publicPaths` allowlist remains
a separate, necessary publication boundary.

When an audited graph is supplied, the returned **server-side partition**
also carries `privateSourceDigests`: SHA-256 commitments for the original
mixed module and each supplied private dependency. These commitments are kept
out of `clientFile` and the served browser JavaScript. Before importing the
original server module, call
`await verifyScoPrivateSourceDigests(partition, absoluteDeploymentRoot)`
from `src/index.js` to compare those commitments with the exact UTF-8 bytes on
disk. The verifier resolves filesystem realpaths, refuses symlink targets
outside the selected root, and rejects modified or missing source files. It
runs once during trusted-server initialization and adds no request-time
overhead. This check is a separate, **opt-in deployment preflight**; the
compiler itself does not read the server filesystem.

The preflight does not make an untrusted or concurrently writable filesystem
tamper-resistant. Verify before loading the original server module, keep
deployed files immutable during that load, and do not treat a digest as a
secret-key authentication mechanism. Manually supplemented private paths
outside the audited source snapshot have no generated digest.

In the optional private-source audit, the global Node `process` object is treated
as an ambient capability. Node 22 exposes `process.getBuiltinModule('module')`,
which can retrieve `createRequire` without a static `node:module` import or a
literal `require` reference. The scanner now refuses direct, aliased, and
simple destructured escapes of this global capability, while retaining
narrow direct uppercase environment-value reads. This is a conservative
admission restriction, not an exhaustive detector for every indirect loader.
See [the process-loader admission regression](../test/sco-private-process-loader.test.js)
and [Node's documented API](https://nodejs.org/docs/latest-v22.x/api/process.html#processgetbuiltinmoduleid).

**Verified dynamic-loader limitation (16 November 2026):** In a reproducible
Node.js 22 Linux/Windows source-audited graph, ordinary functions and objects
provided hidden `Function` constructor access using computed `constructor`
keys. Each of eight original private modules dynamically loaded a real,
unlisted `secret.mjs` file. The current conservative audit declined three
variants, but **admitted five** with a manifest containing only their direct
`engine.mjs` dependency. A real HTTP check demonstrated that each of those
five omitted leaves is then publicly retrievable if the operator also
mistakenly includes it in `createScoHandler`'s `sourceFiles`. The independent
`publicPaths:['entry.mjs']` allowlist refused all five misconfigured
publication attempts before serving. The implementation deliberately permits
many ordinary computed-key reads to preserve positive application semantics;
this syntactic guard cannot certify arbitrary JavaScript source closure.
Use an independently reviewed `publicPaths` list for source-private SCO
deployments and keep private directories outside every HTTP public root.
See [the executable native/HTTP challenge](../sims/sco-private-dynamic-loader-grid.js),
[red/green and refusal-yield evidence](../im-results/sco-constructor-chain-static-closure-2026-11-16.md),
and [the pinned targeted gate](https://github.com/FlareZ123/obfs/actions/runs/43827534775).
These checks strengthen publication configuration guidance; they do not
prevent unlimited authorized RPC relaying or prove dynamic-loader absence.

The static audit is **opt-in**. Without `privateModuleSources`, the manifest
still covers only direct imports and explicit `additionalPrivateModulePaths`.
Even with the opt-in, this is a bounded *static* path audit, not proof that a
private module has no dynamic source reads, indirect loaders or cross-realm
side effects. The integrator must keep the input snapshot consistent with the
server's deployed modules, retain the generated manifest, explicitly protect
other deployment routes and review the separated execution contract.
The paired [real HTTP source-publication regression](../test/sco-private-transitive-manifest.test.js)
demonstrates that the direct-only manifest allows a mistakenly served
transitive leaf, whereas the audited manifest causes `createScoHandler`
to refuse the same serving configuration.

See the [built-in HMAC before/after](../examples/sco-static-imports/README.md), the [two-module private graph before/after](../examples/sco-private-graph/README.md), [Node import regression](../test/sco-static-imports.test.js), and [private-graph integration](../test/sco-private-graph.test.js). The [independent authorized online relay challenge](../sims/sco-private-graph-relay.js) demonstrates that a caller may clone permitted outputs even when source bytes remain withheld. Each small RPC can exceed the 2.5× runtime budget; actual cross-platform heavy-operation measurements are in [intermediate evidence](../im-results/sco-private-imports-2026-11-16.md).

## Optional named batched operations

Set `batch:true` (optionally with `maxBatchCalls:32`) to add an explicit named `batch(calls)` export to the generated client. Each call item has `{name:'exportedFunctionName',args:[...]}`. `bindScoModuleExports` automatically registers a private bounded batch handler alongside the original method registry. The proxy translates public function names to generated RPC method identifiers and sends one HTTP JSON request. It validates the batch shape and size before sending, while the server independently applies the configured maximum (64 calls by default, up to 1,024).

For example, given `export async function calculate(value)`, the page may call `await batch([{name:'calculate',args:[10]},{name:'calculate',args:[20]}])` after importing `{batch}` from the generated browser module. Responses contain an ordered array of `{ok:true,value}` or `{ok:false,error:'Operation failed'}` items. This new export is opt-in and cannot be enabled if the original module already exports a function named `batch`.

The outer `authorizeOperation` sees the generated batch method identifier in `partition.batchMethod` and the complete nested call list inside `args[0]`. For batches created by `createScoBatchMethod`, the handler also invokes `authorizeOperation` for each structurally valid nested method ID and its arguments before executing any item. A method-aware policy must approve the outer batch and **every** inner operation. Denying any inner operation prevents all batch side effects. Batching does not roll back side effects from later runtime failures, and per-item failure statuses do not reveal the server's private stack traces. See [the quantitative RPC grid](../im-results/sco-rtt-grid-2026-11-15.md) for the latency benefits and failures under simulated fixed delay.
## Cross-realm admission requirement

A selected SCO partition has two JavaScript execution realms: the original
private functions run in the trusted server runtime, while retained public
functions remain in the browser runtime. These realms do not automatically
share built-in object mutations, legacy `RegExp` match statics or browser
globals. The source may therefore change results after relocation even if
all original code is otherwise valid. For example, mutating
`Object.prototype` privately and reading inherited properties publicly
no longer refers to one shared prototype; a private `window` lookup may
work before splitting and fail in Node.

The compiler conservatively refuses tested forms of prototype reflection,
legacy `RegExp` static reads, native constructor-object mutations and
private browser-only ambient access, including simple aliases and global
destructuring. It is a bounded syntax-level check, not a general proof
that arbitrary JavaScript has no hidden shared state. Review each
server-private operation as an explicit server contract, ensure all
cross-boundary inputs and outputs fit the JSON interface, and test
the original versus split behavior under the intended browser and
server environments. A function that requires browser-only state
should stay client-side or receive an explicit JSON-valued input.
See [the differential admission report](../im-results/sco-cross-realm-prototypes-2026-11-15.md)
for positive, negative and CI-pinned evidence.

## Security and performance boundaries

Original function bodies remain on the trusted server, absent from delivered JS. An attacker controlling the client can still enumerate public method identifiers, invoke every operation authorized to them, modify arguments, measure timing, observe results, and build a black-box approximation. Server-only secrets remain protected only to the extent that no server-side method or output reveals them. Method identities are routing labels, not tokens. Use signed sessions, strict authorization, input validation, rate limits, monitoring, and deliberate response design. Consider CSRF and CORS policy when relying on same-origin cookies.

The authorizeRpc callback first validates the request at the transport level. The optional authorizeOperation(request,method,args) callback can enforce method- and argument-specific policy after the payload has been parsed. For structured batches, it should inspect all requested operations before authorizing execution. The helper itself does not create user accounts or permissions.

Measured HTTP overhead can exceed the 2.5× budget by orders of magnitude for tiny protected operations, even over loopback. See im-results/sco-rpc-cost-2026-11-15.md for both unbatched and bounded-batch results. Coarse server-resident functions and explicitly batched calls are the currently demonstrated performance approach; real deployment measurements remain necessary. The code splitting API does not automatically select a performant partition or justify any universal throughput guarantee.


## Closed private ESM graph deployment verification

`partitionScoAsyncGraph(files,{exposedPaths:[...]})` now returns a
`privateSourceDigests` array with `{path,sha256}` for **every original
source module** in the reviewed graph, including modules selected for public
RPC facades. These commitments are server-only metadata. Their hashes are
computed from the same original source strings used to prepare the graph.

Before importing the original ESM namespaces into the trusted server,
verify the installed source tree:

```js
const path=require('node:path');
const {partitionScoAsyncGraph,verifyScoPrivateSourceDigests,
  createScoGraphHandler}=require('./src');

const graph=partitionScoAsyncGraph(sourceFiles,{
  exposedPaths:['api.mjs'],seed:'reviewed-build-seed'
});
await verifyScoPrivateSourceDigests(graph,path.resolve('server-private'));
// Import the original ESM namespace only after the check succeeds.
// Supply it to createScoGraphHandler with real authorization policies.
```

The runnable `examples/sco-graph/server.cjs` follows this order. A deployed
dependency with even one changed source byte is rejected before the application
imports that original file. The check also covers original modules that have
same-path browser facades. It reuses the path-aware, realpath-constrained
`verifyScoPrivateSourceDigests` helper and needs no new cryptographic scheme.

This is a **trusted-server deployment consistency check**. A concurrent writer
can still change a file between verification and Node ESM loading; an attacker
who controls the server can bypass the check completely. Keep the verified
files immutable through import. Compilation and deployment roots are
application choices, and the helper does not automatically load modules.
The verification runs during server initialization and adds no client/RPC
request-time computation. It does not establish a general 2.5× limit.

The composed `createScoGraphHandler` separately requires the unmodified
same-process graph object returned by `partitionScoAsyncGraph`. It binds RPC
methods and serves JavaScript from a compiler-owned snapshot, so a later edit
to the manifest cannot replace an approved facade with private source. A
roundtripped or shallow-copied graph is intentionally refused. Details,
live HTTP negative control and tested boundary are recorded in
[`im-results/sco-graph-postpartition-seal-2026-11-16.md`](../im-results/sco-graph-postpartition-seal-2026-11-16.md).


### Dynamic evaluator limitation of the closed graph audit

The graph compiler recognizes canonical static ESM imports and literal
`import('./known.mjs')` expressions. An otherwise ordinary private ESM
module can also load an undeclared dependency at runtime through
`eval('import("./hidden.mjs")')` or
`Function('return import("./hidden.mjs")')()`. Real Node 22 execution of
both originals is reproduced in
[`test/sco-graph-private-path-policy.test.js`](../test/sco-graph-private-path-policy.test.js).
The generated `privateSourceDigests` list is based on compiler-supplied
files, so an unlisted dynamically loaded file would lack a commitment.

To avoid the most obvious false closure claims,
`partitionScoAsyncGraph` now refuses runtime references to bare `eval`
and `Function` identifiers (including aliases, `Function.call`, and
sequence expressions), direct global members carrying those names and
corresponding static global destructuring. Plain uncomputed object-member
labels named `Function` are treated as ordinary property names.
This conservative scan can also reject a harmless locally shadowed
identifier because it does not claim a complete lexical identity proof.
Modules that genuinely require those facilities need review outside
the restricted graph partitioner. The
[targeted Linux/Windows Node 22 regression](https://github.com/FlareZ123/obfs/actions/runs/43923571909)
passes both the native dynamic-import counterexample and strict JSDoc.

Arbitrary JavaScript can still obtain executable constructors or module
loaders through more complex aliases, prototypes, reflection, host
capabilities and native imports. Those patterns are not proved absent by
this syntax guard. Operators must independently review private server
sources, their runtime-resolved dependencies and the deployment root.
The trusted-server digest preflight remains valuable for exact files in
the declared source graph. It does not certify all code that could be
loaded later by the Node process.
