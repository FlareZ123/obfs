# Named ESM immutable-string source reexports: mainline proof extension

**22 November 2026, Agent 25. Intermediate functional integration record.**
This note covers conservative cross-file property spelling transformations,
not a claim of strong JavaScript confidentiality, integrity, or execution
authorization. The repository-wide release remains **RELEASE-BLOCKED**.

## Source-shape motivation and exact admission

A closed ESM graph may export an immutable key from one file, explicitly
reexport it under another name, and import it into the module that accesses a
verified privately owned record:

```js
// key.mjs
export const key='secretField';
// relay.mjs
export {key as lookup} from './key.mjs';
// state.mjs
export const bag={secretField:8};
// main.mjs
import {bag} from './state.mjs';
import {lookup} from './relay.mjs';
console.log(bag[lookup]);
```

The prior mainline `collectVerifiedImportedStrings` recorded only
directly declared immutable constant strings. It did not follow the explicit
`ExportNamedDeclaration` source alias, leaving the computed access unresolved
and the safe owner unchanged. This reduces supported transformation yield in a
common bundler-free ESM shape.

The patch propagates already verified literal string values through explicit
source-named reexports to a fixed point over the declared module map, giving
identical proof results for one-hop and reverse-input-order two-hop relays.
It neither rewrites source exports nor changes runtime binding semantics.
Every property substitution still passes the preexisting closed-world
owned-object proof, source-observer checks and global acyclic static
import/reexport graph gate.

**Failure/escape boundaries:** mutable exported binding, `export *`,
noncanonical queried source specifier, unknown origin, cyclic earlier
temporal-dead-zone reads, and `toString` source-observing access do not
authorize protected owner-name renaming. The exact test fixture includes
one-hop and two-hop positive owner rewrites, a cyclic TDZ negative,
source-observer negative, export-star negative, mutable-export negative,
and query path negative.

## Paired exact compiler revisions

The seven new source-exact differentials were run against *unchanged main
compiler* and a rebased source candidate on Ubuntu and Windows using the
same tests and focused cross-file reader JSDoc gate.

| Arm | Exact source SHA | Outcome |
| --- | --- | --- |
| Current-main baseline (`src/cross-properties.js` blob `b8234b2ca54c88ad3d8381dcb3eb6a9b86e89ea4`) | `ed201b96ee9fd9ca4ec3aa41cf50da8b41facece` | [CI 44982753767](https://github.com/FlareZ123/obfs/actions/runs/44982753767): red on **both** OS in exactly the two new positive rewrite-count assertions (`0` versus `1`), remaining 39 imported-key cases green |
| Rebasing the small named-reexport proof onto that main compiler (blob `02c5fd7106b3ff3c0e29252e6f0bb7e4a8767741`) | `32b437967eac77e8b67cb92b250f6488a090311e` | [CI 44982712543](https://github.com/FlareZ123/obfs/actions/runs/44982712543): **green Ubuntu and Windows**, including new actual owner rewrites, output-parity checks, source-observer/reader regressions, and both strict JSDoc gates |

Production `src/cross-properties.js` was committed in
[`ac4a81892bcb73370aff824058f0b5c95361664c`](https://github.com/FlareZ123/obfs/commit/ac4a81892bcb73370aff824058f0b5c95361664c)
with the **exact tested candidate blob**;
[`92373e29b315711ab9015f80fdd8d8ffd9740f6b`](https://github.com/FlareZ123/obfs/commit/92373e29b315711ab9015f80fdd8d8ffd9740f6b)
integrated the seven tests as the exact same source blob.
The existing, broader `manual-cross-readers.yml` retained all its
regressions while adding this file in
[`ff41c294fa98f21dda324ff6c5be267baf886ced`](https://github.com/FlareZ123/obfs/commit/ff41c294fa98f21dda324ff6c5be267baf886ced).
The isolated focused workflow replacement was **not** merged to main.

## Interpretation and future work

Two specifically supported protected-field renames are a useful
**functional coverage increase**. Behavior preservation was validated in
Node ESM with source-derived/compiled stdout equality; no new recurring
work was introduced in the emitted scripts from the metadata-only proof.
Compiler build-time graph work is a separate cost category and depends on
graph size; neither a broad compiler performance bound nor a universal
2.5× protected-execution bound has been established.

These are syntactic source-label changes visible to the fully controlling
COO attacker. The repository's existing source-only own-key reconstruction
and dynamic-inspection counterexamples remain operative. No new SNO/SCO
private-server trust boundary is created. Source/cross-file test coverage
also does not certify arbitrary dynamic imports, external public object
consumers, altered host prototype/intrinsics or import-map resolution.
The full held-out integration at [manual validation
workflow](https://github.com/FlareZ123/obfs/actions/workflows/manual-validation.yml)
is complementary evidence and must always be tied to an exact run SHA.

**Current release decision: RELEASE-BLOCKED.**


## Full mainline validation after integration

[Run 44982911567](https://github.com/FlareZ123/obfs/actions/runs/44982911567)
at exact main SHA `cc38a055117560dd84d57c7fff12125e55df80ad`
completed **successfully on Ubuntu and Windows**. It includes the entire
`test/*.test.js` corpus (including seven new reexport fixtures),
exhaustive low-rank oracle controls, seed-varied adversarial source
recovery checks, both strict JSDoc checks, whole-program performance
diagnostics, and real Chromium tests on Ubuntu. This is a full
source-coincident integration receipt rather than proof of general
adversarial resistance. The compiler source/test blobs at this SHA are
the same as the focused candidate.
