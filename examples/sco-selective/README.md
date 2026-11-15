# Opt-in SCO selective public/private export partition

The original [before/mixed.mjs](before/mixed.mjs) provides fast public functions
`normalize` and `fastScore`, an async public `combined` function, and an async
`protectedDigest` whose HMAC loop and key must remain on the server. An unexported synchronous
`privateRound` declaration performs the core HMAC step; `privateKeyBytes`
is an async `const` arrow and `privateHex` a synchronous `const` arrow. All three stay in the
server-original module. The compiled browser facade has no helper definition. The
[after/mixed.mjs](after/mixed.mjs) is an actual generated public ES module.
Its public functions are preserved directly, while `protectedDigest` becomes
an async authenticated JSON RPC call to `/obfs/rpc`.

Reproduce the generated facade with `node examples/sco-selective/build.cjs`.
`test/sco-selective-partition.test.js` compares its exact bytes, checks
fail-closed syntax admission, loads original and transformed ESM through the
real Node loader, checks external API calls and verifies unauthorized HTTP
requests receive 403. Pair the build with a trusted server using
`bindScoModuleExports` and `createScoHandler` with application-defined
`authorizeRpc`, `authorizeRead` and `authorizeOperation` callbacks.

## Correctness contract and security limits

This is an intentionally narrow opt-in programming model. The input must
contain only direct named exported function declarations or single-function
`const` exports. Mark private exports explicitly; only async selected exports
may move server-side. Public exports can call private exports directly but
cannot treat the private function as a local value. No imports, top-level
initializers, mutable data exports, reexports, dynamic public imports, `eval`,
`Function` constructors or source-introspection contracts are admitted.
Top-level non-generator function declarations and single-binding immutable
`const` arrow/function expressions, including async helpers, are private by default. An integrator may
explicitly select public-only local helpers with `publicHelperNames`, alongside
private async exports selected with `privateNames`. Public helpers stay in the
client module. Private helper bodies remain server-side, and private helper
names can only be used as direct call targets in private code. The compiler
rejects public references to private helpers or private constants, private
references to split-off public helpers, and cross-boundary ambient state.
The original private source must be loaded from a server-private path.

The transport is JSON; reflection, arbitrary objects, browser-local state,
error stacks and latency cannot be preserved transparently. Selected exports
always perform a remote request; benchmark whole-application wall time including
network overhead against the 2.5x target. A client-controlled runtime can
inspect its public functions, modify the proxy, or relay any legitimate request
through an authorized online attacker. This retains source confidentiality
under the SCO trusted-server assumption only, with no offline COO/SNO claim.
