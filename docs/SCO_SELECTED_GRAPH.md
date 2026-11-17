# Composed selective SCO graph (experimental)

This is a bounded extension of the existing single-module
[selective SCO partition](../src/sco-selective-partition.js), not an
automatic JavaScript whole-program partitioner.

## Why compose selected modules?

A trusted SCO server may keep the private method implementations of several
independently partitioned ESM modules while serving one authenticated HTTP
route set. A client module retains explicitly reviewed ordinary public
functions and receives RPC facades for selected async exports. Two modules can
import the same private static .mjs dependency from the server directory;
that dependency is never added to the public file list.

The API in [src/sco-selected-graph.js](../src/sco-selected-graph.js) exports:

- **partitionScoSelectedGraph(units)**: compiles source units with each unit's
  independent selective SCO options; checks path, source-byte and RPC-ID
  collisions; returns a manifest with clientFiles, partitions, exposedPaths,
  privatePaths and privateSourceDigests.
- **bindScoSelectedGraphExports(graph,namespaces)**: associates original,
  server-loaded ES module namespaces by source path with generated RPC IDs.
  It is a lower-level integration helper, not a publication seal.
- **createScoSelectedGraphHandler(graph,namespaces,options)**: requires the
  original in-process compiler result, checks that its manifest has not
  changed, selects only the original generated public facades, and derives
  exact publicPaths and RPC registry. It refuses custom publicPaths or
  remoteMethods in its caller's handler options.

The graph compiler requires every declared private dependency to have
audited original source bytes, so all privatePaths have a corresponding
SHA-256 source digest. The server must separately call
**verifyScoPrivateSourceDigests(graph, privateRoot)** before loading the
original namespaces, and must keep those files stable during module load.
This detects accidental startup changes. It does not prove race-free loading,
prevent a compromised server replacing its own code, or authorize requests.

## Supported deployment shape

Each source unit contains a file with path, code and module sourceType, plus
the existing selective partitioner's options, including privateNames,
privateModuleImports and privateModuleSources. For any shared private
dependency, the units must supply identical path-to-source-byte mappings.

Imported server-private child modules must pass an additional conservative
top-level state admission check. Static imports, function declarations and
primitive-literal immutable declarations are eligible; mutable lexical
bindings, object-valued constants, stateful initialization expressions and
observable function-object identity mutation are refused. A private child
module is loaded once in the server process, while separate browser sessions
would normally instantiate their own copies. The paired
[test of two independent module realms](../test/sco-selected-graph-state.test.js)
demonstrates the resulting observable counter difference: independent
first calls produce 1 and 1, while one shared server namespace produces
1 and 2. These new restrictions are syntactic and can over-reject safe
programs. A further direct-reference guard refuses member/property access
on all relative private-import bindings, including safe primitive members,
because an imported function is a mutable object even when its exported
binding is constant. This blocks a caller from retaining state in
`importedFunction.counter` across browser sessions. Indirect identity
transfers through higher-order calls, native API effects and other
cross-module behavior still lack a general proof.

This graph composer admits several independent selectively partitioned
modules. A public function inside one module may call that module's selected
private async export through the generated RPC facade. A public module
importing or reexporting another public unit remains outside the selective
partitioner's current source grammar and is declined. For a graph made wholly
of private async exports, use
[partitionScoAsyncGraph](../src/sco-graph.js).

All public reads require a real authorizeRead policy. Remote operations
require authorizeRpc; authorizeOperation is strongly recommended to check
the authenticated identity, method and JSON argument shape. The HTTP Host
header is forgeable and must not be used for authorization. Only a literal
true result authorizes an existing SCO policy gate. The application's
existing identity verification, tenant isolation, abuse controls and TLS
setup remain outside this compiler.

## Reproducible checks

[test/sco-selected-graph.test.js](../test/sco-selected-graph.test.js)
creates two original ESM modules referencing one shared private dependency,
computes real original versus generated outputs, runs an authenticated local
HTTP handler, checks unavailable private source paths, and verifies that
unauthenticated RPC requests are denied. It also checks contradictory
source digests, casefolding and public/private path collisions, missing
dependency digests, and integrity of the compiler-owned facade snapshot
against later caller mutations and source accessors. The focused
[manual SCO authorization workflow](../.github/workflows/manual-sco-authorization.yml)
runs this test on Linux and Windows Node 22 with strict JSDoc.

[sims/sco-selected-graph-budget.js](../sims/sco-selected-graph-budget.js)
compares nine alternating native/generated sessions at each of four
CPU-work granularities, where each session invokes both selected modules
once. It records source and distributed SHA-256 digests, raw samples and
median whole-session ratios. These localhost measurements count
authenticated HTTP and JSON time and distinguish small from heavy RPC
operations. They omit TLS, remote WAN RTT, browser loading and cold startup,
so none establishes a general 2.5x runtime guarantee.

## Security boundary

A public facade carries the method identity, request format and successful
outputs. A capable attacker with a legitimate unlimited-query session can
relay each authorized operation from another host without seeing the
server-private implementation or source keys. Source withholding is a
meaningful server trust boundary, while preventing same-account functional
relaying is unproved. The compiler also retains the existing selective
partitioner's restricted JS grammar and cross-realm admission limitations.
Review the exact deployment graph and the
[research security notes](SECURITY.md) before using it to protect code.
