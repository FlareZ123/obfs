# Explicit SCO server-only ES-module partition

The programmatic helpers partitionScoAsyncModule and bindScoModuleExports create a narrow, reviewable server/client boundary. They are intended for trusted SCO deployments where an operator owns the server, can authenticate requests, and keeps original implementation modules outside the public route. Other modes cannot rely on this server trust anchor.

## Supported input and preserved interface

The input must be a single .mjs module (or a .js module explicitly marked sourceType:'module') containing **only direct named exported async function declarations**. Every function must use ordinary identifier parameters, cannot be a generator, and cannot reference this or super. Empty files, imports, top-level constants, initializers, default exports, export specifiers, and synchronous declarations are refused. This strict admission policy prevents the helper from shipping forgotten top-level secrets or silently dropping visible initialization effects.

The output contains a public clientFile with the same module path and named async exports. It preserves exported function names and ordinary parameter count. Each proxy forwards its complete arguments list to an authenticated same-origin JSON RPC endpoint, including extra positional arguments. The original bodies are absent. The helper emits opaque per-method identifiers that are available in the public stub and must never be treated as credentials or secrets.

This is an explicit application contract: both inputs and outputs should be plain JSON-compatible data. JSON cannot transparently retain arbitrary functions, cyclic graphs, object identity, BigInt, undefined array elements, NaN, infinities, prototype classes, transferables, DOM handles, or browser-local state. The original function must have no externally required browser-side side effects. Source-based reflection such as Function.prototype.toString differs, as do exception stacks and completion timing. Under such conditions, operators must leave the original operation client-side or implement a custom transport and semantic adapter. There is no general semantics-preserving compiler from arbitrary JS to RPC here.

## Server integration

The following CommonJS example assumes the original private module is located outside the publicly served directory:

\`\`\`js
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
\`\`\`

verifySession and verifyPolicy are application-defined placeholders. The private file must never be placed in the web root or included in the SCO handler's sourceFiles. The partitioned client file is served as /obfs/protected.mjs. A browser caller can continue using named asynchronous imports:

\`\`\`js
import {calculate} from '/obfs/protected.mjs';
const result=await calculate(40,2);
\`\`\`

For a nondefault routePrefix, set the matching same-origin absolute endpoint in partitionScoAsyncModule({path,code},{endpoint:'/your-prefix/rpc'}), and use the same routePrefix on createScoHandler. The partition seed is randomized by default; when deterministic reproducibility is required, provide a seed at build time and keep the corresponding server operation registry and client stub within the same deployment generation.

## Security and performance boundaries

Original function bodies remain on the trusted server, absent from delivered JS. An attacker controlling the client can still enumerate public method identifiers, invoke every operation authorized to them, modify arguments, measure timing, observe results, and build a black-box approximation. Server-only secrets remain protected only to the extent that no server-side method or output reveals them. Method identities are routing labels, not tokens. Use signed sessions, strict authorization, input validation, rate limits, monitoring, and deliberate response design. Consider CSRF and CORS policy when relying on same-origin cookies.

The authorizeRpc callback first validates the request at the transport level. The optional authorizeOperation(request,method,args) callback can enforce method- and argument-specific policy after the payload has been parsed. For structured batches, it should inspect all requested operations before authorizing execution. The helper itself does not create user accounts or permissions.

Measured HTTP overhead can exceed the 2.5× budget by orders of magnitude for tiny protected operations, even over loopback. See im-results/sco-rpc-cost-2026-11-15.md for both unbatched and bounded-batch results. Coarse server-resident functions and explicitly batched calls are the currently demonstrated performance approach; real deployment measurements remain necessary. The code splitting API does not automatically select a performant partition or justify any universal throughput guarantee.
