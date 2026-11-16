# SCO private graph admission: ambient Node module-loader bypass and bounded refusal

**Status:** Intermediate implementation and reproducible regression. **Research mode:** normal, Agent 5. Date: 2026-11-16.

## Threat boundary and prior gap

The selective SCO compiler's opt-in `privateModuleSources` provides a static, canonical .mjs import/reexport closure and emits a route-denial manifest. The compile-time audit had explicitly rejected literal `require` identifiers, dynamic `import()`, `import.meta` and static imports of `node:module`, `node:vm`, `node:worker_threads` and `node:child_process`. However, its global-alias walk only tracked `globalThis`, `window`, `self` and `global`. It omitted Node's ambient `process` object.

Node 22 documents `process.getBuiltinModule('module')` as an alternate builtin loader, and the returned `module.createRequire` function can load other on-disk modules. Thus source with no banned `require` identifier and no static `node:module` declaration could acquire a loader at runtime:

```js
const moduleApi=process.getBuiltinModule('module');
const load=moduleApi.createRequire(process.cwd()+'/entry.cjs');
export function deriveProof(v){
  return load('./unlisted.cjs').deriveProof(v);
}
```

Because `process` was not a tracked global root, the previous source scan did not flag this direct form. The emitted static closure manifest only included explicitly supplied direct files, so an accidental separate `createScoHandler` source-file entry for the dynamically loaded module was not covered by the graph audit. This is a concrete **source-closure admission failure** and a potential accidental source-publication route; exploiting it requires an operator to additionally publish that unlisted file. It is not a server compromise or proof of cryptographic obfuscation failure.

[Node 22 process.getBuiltinModule](https://nodejs.org/docs/latest-v22.x/api/process.html#processgetbuiltinmoduleid) and [module.createRequire](https://nodejs.org/docs/latest-v22.x/api/module.html#modulecreaterequirefilename) describe this capability. Local `node v22.16.0` confirmed both method functions exist. Before-fix compiler admission is inferred from the original `globalRoots` and syntax scanner; this report does **not** claim a before-fix CI execution of the entire example.

## Implemented conservative restriction

At [source commit 20442eb8](https://github.com/FlareZ123/obfs/commit/20442eb8a9e4f30307819a4d1251fb5e61e43f6e), `collectPrivateStaticImportClosure` now:

1. Includes `process` in the source-global root set.
2. Follows immutable-style direct identifier and nested member aliases of root-derived objects; direct `process.env.UPPERCASE_KEY` reads remain recognized as inert snapshots rather than propagating a root capability.
3. Rejects destructuring from an ambient global root and destructuring assignments that would otherwise hide loader methods in local identifiers.
4. Reuses the existing direct call, constructor call, assignment, update and delete refusal on these roots and aliases.

This is deliberately over-conservative, because abstract interpretation of arbitrary user-defined JavaScript loader paths is incomplete. Valid private modules using other `process` features may now be refused. It does not prove absence of indirect source reads, simulated loaders, metaprogramming, malicious deployment changes or outside handler routes.

## Validation

Added [eight negative admissions plus a safe control](../test/sco-private-process-loader.test.js) and integrated them into the existing [manual SCO authorization workflow](../.github/workflows/manual-sco-authorization.yml). The negative programs cover direct `getBuiltinModule`, `mainModule`, identifier aliases, `globalThis.process`, chained global aliases, captured loader method and two destructuring forms. The positive control admits `node:crypto` and a direct `process.env.SCO_TEST_SUFFIX` value while confirming no server-only key name/import appears in the public client source.

[GitHub Actions run 43800907331](https://github.com/FlareZ123/obfs/actions/runs/43800907331) at immutable head `8fd60a7f848acabb99453b3a569fb972436f22e7`: the whole targeted SCO HTTP/partition test command, including these cases, **passed on Ubuntu and Windows**. The entire workflow **failed** in both jobs only later, at unrelated JSDoc errors `TS7034` and `TS7005` in a contemporaneous `src/statement-flow.js` contribution. All earlier SCO profile/attacker/browser steps were also green where run, but this is not an integrated release green gate. Sent diagnostic to Agent 37.

## Security-performance interpretation

This is a build-time admission guard. It does not add instructions to the generated client facade and therefore does not itself increase per-call RPC compute. It does not resolve SCO's authorized online-relay vulnerability. Under full client control with unlimited legitimate requests, permitted computations remain replicable by forwarding requests to the original server. The new test exercises compiler refusal, **not** a general quantitative resistance improvement. It belongs in `im-results/` and must not be promoted to an established obfuscation-security result.

**Next challenges:** review ways to obtain first-class loader capabilities from non-`process` aliases, distinguish required server-only ambient reads from unsafe escapes with a sound provenance proof, and add an explicit positive public-file allowlist at the trusted SCO server boundary to reduce accidental source publication even when static dependency inference is incomplete.
