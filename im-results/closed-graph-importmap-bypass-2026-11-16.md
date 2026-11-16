# Host-graph pre-guard execution via browser import-map redirection

**Status:** Intermediate independent negative-security evidence.
**Date:** 16 November 2026, Agent 15.
**Pin:** [manual 43825060899](https://github.com/FlareZ123/obfs/actions/runs/43825060899)
at `9668603b2689d2b4bdb2398b775abd7f9caa8297`.
Real Chromium attacker step and existing Node/Windows validation were green.
Exact reproduction: `node sims/closed-graph-host-import-map-attack.js`
with an installed Chromium (`CHROMIUM_BIN=google-chrome` on CI).

## Question and trust boundary

[The earlier closed-graph hostname-guard implementation](closed-graph-host-2026-11-16.md)
ensures that each declared static ES module receives a guard at the first
executable statement. This works for files delivered under their
expected relative URL resolution. It does **not** control the browser's
module resolution. The new test asks whether a page-level import map can
cause a dependency's body to execute before its nominal importer's guard
while leaving all distributed guarded files unmodified.

The experiment uses three real checked-in public COO files from
`examples/closed-graph-host/after/`. Their guards require hostname
`allowed.example`. The browser receives those files at
`http://127.0.0.1`, an unauthorized hostname. Each public file contains
a visible hostname guard, and no public file is altered by the attacker.

## Independent attacker and exact observable effects

The standalone simulator reads **only** the distributed `after/` files,
without importing the compiler, original source or build seed. It hosts
`/app/entry.mjs`, `/app/logic.mjs` and `/app/state.mjs` exactly as
published. Two real Chromium processes load separate HTML embedding pages:

- **Control page:** no import map. Its
  `import('/app/entry.mjs')` rejects with
  `Unauthorized execution host`. The recorded array of module-body
  events is empty.
- **Attacker-controlled page:** a standard `<script type="importmap">`
  maps `/app/logic.mjs` to `/rogue.mjs`. The rogue file performs
  `globalThis.events.push("rogue-before-guard")` at top level and
  exports the function name that the guarded entry expects.
  The browser evaluates this newly resolved dependency **before** the
  guarded entry module body. The resulting error is still
  `Unauthorized execution host`, but the event array contains exactly
  `["rogue-before-guard"]`.

Pinned browser stdout:

```json
{"attack":"browser-import-map-pre-guard-effect","publishedFilesUnmodified":3,"control":{"events":[],"error":"Unauthorized execution host"},"mapped":{"events":["rogue-before-guard"],"error":"Unauthorized execution host"}}
```

The attack demonstrates an **external dependency's pre-guard effect**.
It does not bypass the protected entry's own guard, execute its
application body, or recover any original private property names.
The separate public-only guard deletion experiment already demonstrates
full client-side functional copying when an attacker can modify
distributed code.

## Implication for the architecture

Compiler-side static path equality is insufficient for general
runtime-module provenance. A host page's import map (and analogously a
custom loader or service worker) may redirect a statically spelled
dependency without altering the declared source graph. This is an actual
browser counterexample to any unconditional claim that a guarded
file-list prevents all pre-authorization effects.

The compiler's feature should continue to require a complete
declared file graph and should be described as a guarded-body
compatibility path under expected module resolution. If the serving
environment is untrusted or dynamically resolves modules, its safety
premise must be established independently or the feature should be
declined. A hostile browser owner can also remove/forge the checks
directly, so a trusted server-side policy remains necessary for
authorization.

This is a negative-control threat result. There is no claim of
improved tamper resistance, static reconstruction cost, or general
2.5× performance compliance. The prior report's paired Node
performance data remain the scoped measurement for the unredirected
graph.
