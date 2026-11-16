# Constructor-derived loader bypass in SCO's static private-ESM audit (16 November 2026)

**Status:** Reproduced native counterexample, red/green cross-platform regression, bounded compiler-side refusal. Intermediate engineering evidence; not a security theorem. **Owner:** Agent 36.

## Tested claim and failure

The opt-in `partitionScoSelectedAsyncExports({path,code}, {privateModuleImports, privateModuleSources})` accepts exact source snapshots for a private static ESM graph and emits `clientFile.privateModulePaths` for publication refusal by `createScoHandler`. A caller relying solely on the static graph may omit a dependency loaded at runtime. Before this repair, a private `engine.mjs` containing:

```js
const load = (() => 0).constructor('p', 'return import(p)');
export async function deriveProof(v) {
  return (await load('./deep/secret.mjs')).secretValue + v;
}
```

passed the compiler's exact-source graph audit even though its native Node 22 execution dynamically imports an unlisted `private/deep/secret.mjs` module. The independent native test writes both modules to a temporary directory and verifies `deriveProof(1) === 42` with `secretValue === 41`. The AST contains no `ImportExpression`, `Function`, `require`, or `eval` node for the hidden loader; Function is obtained from a function instance's inherited `constructor` property.

If the operator also mistakenly includes the omitted leaf in `createScoHandler`'s public source list and does not set the independent `publicPaths` allowlist, the static-only path list would not exclude that leaf. The existing `direct-only manifest permits accidentally served transitive source` test independently demonstrates HTTP 200 for an untracked source path. The compiler acceptance and Node native dynamic import were directly observed; the combined constructor-specific served-leaf scenario is an inferred consequence of those two separately tested boundaries, not a separate live-HTTP exploit measurement.

## Red/green reproduction

- **Red source:** `69d1fb2c2285919e448b255609282286ce14b880`, [cross-platform workflow 43824527556](https://github.com/FlareZ123/obfs/actions/runs/43824527556). Both Ubuntu and Windows Node 22 jobs failed only the newly introduced constructor-loader test (`Missing expected exception`, first variant). Ubuntu 115 passing, 1 failing, 1 skipped; Windows 115 passing, 1 failing, 1 skipped, out of 117 tests.
- **Patch:** `724348b55db79bad34fe0880cd193543a9adbb04` adds a bounded `walk(ast)` refusal for statically known `.constructor`, `["con"+"structor"]` and object-destructuring `{constructor:...}` in private imported modules.
- **Green source:** `e2e16f2fda90ab7f31dc5b38d03bd50a9e39b333`, [cross-platform workflow 43824718650](https://github.com/FlareZ123/obfs/actions/runs/43824718650). Ubuntu 117/117 passing; Windows 116 passing, 1 skipped; zero failures. Both strict JSDoc suites and workflow's other SCO regressions, simulations, and Ubuntu real Chromium steps passed. Other agents' concurrent commits are present in this green SHA; claims here concern the pinned integration source rather than an isolated-commit gate.

Reproduce by running the ordinary `node --test test/sco-private-transitive-manifest.test.js` on the pinned sources. The test asserts the native dynamic import before checking four unsafe constructor spellings and one accepted benign `record.answer` private property read. No new runner or external packages were introduced.

## Safety and coverage tradeoff

The guard is build-time only and does not add client RPC instructions, keys, public JS, or server request-time instrumentation. It conservatively refuses even benign reads of an inherited or own property literally named `constructor`, because this bounded audit lacks a full ownership and higher-order call proof. The ordinary `record.answer` positive control remains accepted; the existing 32-graph randomized private ESM DAG and 24 negative-mutation corpus remains in the targeted passing suite. The positive private/leaf graph's unchanged client bytes are asserted by the existing same-seed direct-only-vs-audited test.

**Scope limit:** This catches the four tested constructor-based source forms. Variable-key aliases, computed keys whose value cannot be proven, aliased reflection, custom Node loaders, native module methods, and arbitrarily generated imports remain out of scope for this syntactic audit. Existing `publicPaths` publishing allowlists and trusted deploy-time root controls are independent defense-in-depth. This repair addresses an observed acceptance mistake in one finite analysis; it does not prove private-graph completeness, runtime confidentiality under malicious server access, resistance to authorized SCO RPC relaying, or universal 2.5x behavior.

## Follow-up

Compare static private ESM audit acceptance yield on a pinned positive application when adding any broader dynamic-key restrictions. A stronger static closure checker must either prove computed member ownership/key bounds or refuse unproved source-loading capabilities; generic banning of all dynamic indexing would harm ordinary algorithms. Record actual preserved private work and end-to-end semantics, not only the number of declined negative fixtures.

## Follow-up: aliased and runtime-computed keys (07:44 UTC)

The first exact-spelling guard was bypassed by a second real native case:

```js
const key = 'constructor';
const load = ({})[key][key]('p', 'return import(p)');
export async function deriveProof(v) {
  return (await load('./deep/secret.mjs')).secretValue + v;
}
```

The native Node 22 fixture again returned 42 using the otherwise undeclared `private/deep/secret.mjs`. [Red Ubuntu+Windows workflow 43825597226](https://github.com/FlareZ123/obfs/actions/runs/43825597226) at `8a5914363cc529cdd843a4e7b8905aa2d64577d4` failed the new "static constructor key aliases" expected-refusal assertion. The compiler's exact-key-only guard had admitted `({})[key][key]` despite the immutable literal `key` binding.

The follow-up patch `3163292d616023860921316be62c4c065b6f0b01` conservatively propagates constructor-valued string aliases through variable declarations/assignments, supports simple literal template interpolation, and tracks named function-expression bindings. It refuses unknown computed member keys on syntactically known callable receivers because such a key can resolve to inherited `constructor`. Identical-name bindings across scopes may cause benign refusals; no full lexical scope proof is claimed. The additional regression covers six negative spellings, including `['con','structor'].join('')` used to index both inline and named function objects, plus positive controls for `record[key]` on an ordinary private object and `fn['name']` on a callable.

[Pinned green Ubuntu+Windows workflow 43825959203](https://github.com/FlareZ123/obfs/actions/runs/43825959203) at `aad1d12fa60274a081b04ae6c3a464a4d2ab37d5` passed both SCO matrix jobs, including JSDoc and other existing workflow tasks. The positive controls were therefore checked in the same gate as the new negative variants.

**Important residual:** A dynamic computed key on an object with unproved provenance, or a function created by an arbitrary factory, can still reach a constructor without passing this finite syntactic guard. This work exposes the false-confidence risk of calling a syntactic dependency manifest a sound complete graph; it cannot guarantee no runtime module loads in arbitrary JavaScript. Preserve explicit `publicPaths` and refuse public exposure of any server-private root regardless of static scan outcomes.
