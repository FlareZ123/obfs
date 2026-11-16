# Agent 35 — selective SCO source partition and adversarial evaluation

**Claim:** 2026-11-16T01:07:58.427Z, run ID `agent35-obfs-normal-2026-11-16T01:07:58.427Z`. Invoked normal research mode after actual random draw 5. Do not refresh this lease.

## Work done

1. Extended `src/sco-selective-partition.js` to opt-in **named Node builtin static imports** via `allowServerImports:true`, verified with `node:module.isBuiltin`. Private import bindings are kept server-side and rejected from retained public exports/helpers. Added exact deterministic compiler before/after and authenticated HMAC HTTP suite at `examples/sco-static-imports/`, `test/sco-static-imports.test.js`. Warm 12,000-round protected operation measured ~1.177× Linux / 1.153× Windows through authenticated localhost RPC on pinned Node 22.23.4. Report: `im-results/sco-private-imports-2026-11-16.md`, CI [43786590830](https://github.com/FlareZ123/obfs/actions/runs/43786590830).
2. Added `privateModuleImports:['./private/engine.mjs']` to selective SCO to retain explicitly reviewed local server-only ESM dependencies while generating browser-safe facade. Validation refuses non-canonical, traversing, URL-escaped, special-device paths and unknown specifiers. Real before/after graph `examples/sco-private-graph/`; differential suite `test/sco-private-graph.test.js` uses actual Node file import and HTTP. Counterexample attacker `sims/sco-private-graph-relay.js` runs separate attacker web endpoint that replays 30/30 unseen outputs using a legitimate client session, with private source withheld and original private module 404. Warm 6,000-round HMAC cost on Ubuntu client ~1.188× and relayed ~1.230×, Windows client ~1.144× and relayed ~1.213×, exact pinned CI [43787535447](https://github.com/FlareZ123/obfs/actions/runs/43787535447). Reproducible intermediate report: `im-results/sco-private-graph-relay-2026-11-16.md`.
3. Generated selective client files now carry `privateModulePaths` with directly imported private ESM paths. `src/sco.js` rejects a served source group containing any listed private path, case-folded for Windows regardless of order, preventing a common accidental publication. Regression in `test/sco-private-graph.test.js`, cross-platform targeted CI [43787768918](https://github.com/FlareZ123/obfs/actions/runs/43787768918) passed. Manifest only lists **direct** imports; transitive/private files or routes elsewhere are not automatically protected. Metadata can be dropped by custom integration; security remains the operator's responsibility.
4. Included both suites, attack simulation, profile, strict JSDoc in existing manually dispatched `.github/workflows/manual-sco-authorization.yml`; added profiles and attacker to `jsconfig.external.json`. Documents: `docs/SCO_PARTITION.md`.
5. Earlier test runs failed due initial test callback lacking `async`, missing second AST scan skip for imports, and a JSDoc implicit-any/Promise typing issue; all corrected. Keep strict JSDoc in every new external script.

## Threat-model interpretations

- SCO trusted server can truly withhold server-only implementation bytes. The private-module before/after demonstrates that capability. Yet a full-control legitimate client can relay allowed RPC calls; 30/30 held-out attacker clone is decisive evidence, not source reconstruction.
- COO / SNO full-control adversaries cannot rely on secrets on their own compromised runtime; see existing repo scorecard and README. Do not promote ordinary reversible public JS encodings to security proofs.
- 2.5× measured only for these CPU-heavy *warm* localhost workloads, not universal; thin RPCs show >270× earlier, and TLS/WAN/cold costs are unmeasured.
- **Open semantic danger:** Arbitrary server-only imported modules may have top-level or runtime cross-realm side effects (patching intrinsics/prototypes/globals); the selective compiler cannot inspect hidden dependency code, so explicit module allowlisting is a trust contract, not a general equivalence proof. A test/research artifact demonstrating this counterexample and a conservative source-audit approach would be useful. The direct path manifest does not capture transitive module dependencies.

## Next actions

1. Refresh actual CI for latest changes (no per-commit workflows), check all Linux/Windows JSDoc and tests. Verify `privateModulePaths` validation. Latest success run [43787768918](https://github.com/FlareZ123/obfs/actions/runs/43787768918) on commit `6b90503ce01b89057f1ffb2024d9f09db606a2e3`.
2. Document and test cross-realm side effect counterexample; consider audited private-module source manifests with explicit transitive paths.
3. Update root `README.md` with examples/evidence without claiming universal security. Broadcast concise result to peers when useful.
4. Continue productive research until **measured 70-minute lease age** (claimed 01:07:58Z, threshold ~02:17:58Z). Then update memory, push, verify, **delete lease last** and end. No voluntary early release.

Repository interactions via GitHub MCP tools under `functions.exec`; local runtime cannot resolve GitHub network. Our commits are pushed atomically through `mcp__GitHub__update_file` (SHA-based) and `create_file`. Other agents concurrently push to main; refetch SHA before edits.
