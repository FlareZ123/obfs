# SCO runtime ESM source trace: observed dependencies versus untested inputs

**Date:** 16 November 2026. **Class:** intermediate, reproducible defensive
source-publication experiment. **Owner:** Agent 36. No claim of general static
source-closure or tamper resistance.

## Question

Can trusted Node.js ESM resolution tracing identify a private dependency
that an existing syntax-only `privateModuleSources` graph audit cannot
statically discover? What does a partial input trace leave unprotected?

The previous [private dynamic-loader attack grid](sco-constructor-chain-static-closure-2026-11-16.md)
found eight real native ESM loader cases, five statically admitted with missing
private dependencies, and five corresponding HTTP 200 accidental source
disclosures when the omitted leaf was also mistakenly included in the
public source list. `createScoHandler({publicPaths})` blocked all five at
handler construction. This follow-up tests an executed module-resolution
diagnostic rather than adding another syntactic blacklist.

## Reproduction design

Executable: [`sims/sco-private-runtime-source-trace.js`](../sims/sco-private-runtime-source-trace.js).
The Node.js 22 process registers a synchronous `node:module.registerHooks`
`resolve(specifier,context,nextResolve)` hook **before** importing the
private engine. It collects file URLs returned by the real resolver, filters
them to the owned private root, and materializes all ESM files through the
project's atomic writer into an isolated temporary directory. The hook does
not rewrite, block or fabricate the original imports.

The original `private/engine.mjs` constructs a dynamic importer from the
computed `constructor` property using `String.fromCharCode`, beyond the
current finite scanner. Its `deriveProof(v)` selects
`./deep/even.mjs` or `./deep/odd.mjs` based on the parity of `v`, with
distinct primitive return values. The compiler's declared static source
snapshot includes only the original engine; the public facade is generated
by the real `partitionScoSelectedAsyncExports` implementation. Observed
file paths may be supplied separately as exact
`additionalPrivateModulePaths` input to that compiler. The application
is deliberately small and cannot stand in for a full protected algorithm.

**Node version:** `module.registerHooks` was introduced in Node 22.15.0,
with active-development stability in that Node line, per
[Node's documented module customization API](https://nodejs.org/download/release/v22.23.3/docs/api/module.html).
The simulation runs in a dedicated process because registered hooks remain
active; this API is used as a trusted diagnostic, never promoted here as a
portable production hardening mechanism.

## Cross-platform measured outcomes

[Pinned SCO targeted gate 43829602350](https://github.com/FlareZ123/obfs/actions/runs/43829602350),
exact source SHA `9e9fb1e1e7efb1e0fdbf00a553348ffcbefa8c06`,
passed on Ubuntu and Windows using Node 22.23.4. Ubuntu had 118/118
passing Node tests; Windows had 117 passing and one expected skip; both
strict JSDoc configurations passed after explicitly adding the two
standalone simulation files to `jsconfig.external.json`.
The independent runtime diagnostic returned the same JSON on both systems:

| Step | Linux | Windows |
|---|---|---|
| Native `deriveProof(2)` | 13 | 13 |
| Hook after only even input | `private/deep/even.mjs` | Same |
| Private odd module absent from partial trace | Yes | Yes |
| Accidentally published untraced odd leaf | **HTTP 200** | **HTTP 200** |
| Native `deriveProof(3)` | 20 | 20 |
| Hook after both inputs | even and odd paths | Same |
| Compiled manifest after both traces | includes engine, even, odd | Same |
| Handler accepts accidentally published odd source | **No, rejects** | **No, rejects** |
| Independent `publicPaths:['entry.mjs']` blocks partial-trace publication | Yes | Yes |

## Meaning

The synchronous Node resolution hook recorded an otherwise unlisted
runtime-loaded ESM source when the corresponding input was **executed**,
and the compiler's existing `additionalPrivateModulePaths` facility used
that observation to keep the specific source off its HTTP publication list.
This is a practical *observability aid for trusted build/startup tests*.

The contrasting held-out odd input demonstrates that an untested private
branch remains invisible. `registerHooks` tracing is dynamic, mutable
by a runtime owner, and requires a complete representative invocation
set to observe paths. It is **not** a proof of arbitrary import closure,
general semantic equivalence, server secrecy if other HTTP routes serve
private files, security against a compromised trusted server, or prevention
of legitimate online SCO RPC relays. Module-hook runtime overhead and
interactions with custom loaders, Workers, dynamic `require`, and
instrumentation escape were not profiled. For the supported SCO source-private
deployment, the operator-reviewed `publicPaths` boundary remains
independent and stronger against accidentally supplied extra source files.

**Performance scope:** the diagnostic executes in its own test process
before application deployment and adds no instructions to the generated
browser facade. Its startup instrumentation time and production
request-time overhead were not measured. A production runtime hook would
need its own whole-session 2.5× performance and compatibility evaluation.

## Follow-up directions

- Test a representative stateful private application with distinct cold/hot
  loader branches and documented input coverage.
- Study whether a build-time trace can be packaged as a separately executed
  advisory linter without leaking trusted server keys, while retaining
  independent human-reviewed `publicPaths`.
- Distinguish a static underapproximation that is expected by design from
  an actual trusted-server publication configuration mistake.

## Authenticated end-to-end SCO differential extension

The diagnostic was extended to materialize the native `entry.mjs` and the
actual generated public `client.mjs` facade, bind the original private
export using `bindScoModuleExports`, and run the public facade through a
localhost `createScoHandler` with `authorizeRpc`, `authorizeRead`,
`authorizeOperation` and the exact `publicPaths:['entry.mjs']` policy.
It checks that unauthenticated RPC returns 403, that an authenticated
direct source GET for the odd private leaf returns 404, and that both
private operations and the retained synchronous public export match the
native module.

[Updated pinned cross-platform gate 43830107211](https://github.com/FlareZ123/obfs/actions/runs/43830107211)
at SHA `05991af0ba66f0f2933e2c92461ba1a8f4c1d0b2` passed SCO tests,
both strict JSDoc suites and applicable Chromium tasks on Linux/Windows.
Both platforms reported `nativeValues:[13,20]`,
`clientValues:[13,20]`, `uncoveredOddHttpStatus:200` in the deliberately
misconfigured *partial-trace* handler, and an accepted policy rejecting the
extra private source in the protected full-trace handler.

The tested output identities establish exactly two branch outputs and the
read/authentication/publication outcomes. The RPC facade adds JSON and
network semantics to the original private module, and no calibrated
short/sustained original-to-facade overhead ratio was taken in this
experiment. Do not interpret these passing functional checks as compliance
with the 2.5× limit for general SCO calls.
