# Public ESM callable source versus cross-file private-field yield

**Status:** Intermediate compatibility experiment, 22 November 2026. No
cryptographic secrecy, tamper resistance, or 2.5× performance claim.

## Precise question

Can COO rewrite two primitive private fields used across an ESM module
boundary while preserving the exact `Function.prototype.toString` of the
application's exported callable entrypoint? Does the result survive a
second identifier-renaming pass?

A source-only attacker can always inspect the entire emitted graph. This
test asks only for the native application's chosen runtime-observable
interface and transformation coverage, not secrecy from that attacker.

## Reproduction

The reproducible Node 22 fixture is
[`test/closedworld-private-wrapper.test.js`](../test/closedworld-private-wrapper.test.js).
The graph contains:

- `state.mjs`: `export const state={hotScore:(21-14),hotWeight:(5<<2)-7};`
- `worker.mjs`: import `state`, read `hotScore` and `hotWeight` in an
  **unexported** `privateHot`, and export an unmodified
  `hot(initial,iterations){return privateHot(initial,iterations);}` wrapper.

The test requires **two rewritten cross-file fields**, equal
`hot.toString()` text, and equal results for six signed seeds at 10,000
iterations. It uses fresh module directories and locked atomic writes.
The trusted build declares `mode:'coo',closedWorld:true,strings:false`
and explicitly limits the caller's public entry to `worker.mjs`.

The independent comparison also sets `identifiers:true`, requires a
nonzero local identifier rewrite count, and observes public source parity.

## Source-pinned outcomes

| Case | Exact source SHA | Ubuntu / Windows | Observed result |
| --- | --- | --- | --- |
| Main, properties enabled, identifiers disabled | `18ad424d34646d455b8e2ee38348925775f6c589` | [44997812169](https://github.com/FlareZ123/obfs/actions/runs/44997812169), green / green | **2** rewritten cross-file fields, public `hot.toString` exact, six arithmetic probes equal; strict JSDoc passes |
| Main with additional identifier pass, independent branch | `c9002b809fc529848b045fd5a23afba0fb87aef5` | [44998053161](https://github.com/FlareZ123/obfs/actions/runs/44998053161), red / red | Both actual property-yield and identifier-yield assertions passed; public wrapper parameters were renamed and `hot.toString()` differed |
| Exported-source integration candidate at fixed Agent16 parent, same pair of tests | `26eb0bbc29dfa730fcd9aa4fc8e40c0afc1fc0ec`, parent `970290dfaeec05283d9a2d9248870195316ce34a` | [44998154932](https://github.com/FlareZ123/obfs/actions/runs/44998154932), red / red | Both cases got **0** cross-file private fields; positivity assertions stopped the tests before callable-source checks |

The independent combined-pass branch is
[`agent29/crosspass-public-wrapper-source-20261122`](https://github.com/FlareZ123/obfs/tree/agent29/crosspass-public-wrapper-source-20261122).
The fixed integration-candidate replay is
[`agent29/public-wrapper-on-agent16-20261122`](https://github.com/FlareZ123/obfs/tree/agent29/public-wrapper-on-agent16-20261122).

### Exact public-source mismatch in the identifier branch

Native:

```js
function hot(publicSeed,publicCount){return privateHot(publicSeed,publicCount);}
```

Emitted:

```js
function hot(_v79ec84d745fd,_vade013cce593){return privateHot(_v79ec84d745fd,_vade013cce593);}
```

The same mismatch appeared on the two Node 22 operating systems.
It is an observable JavaScript behavior difference for callers performing
`Function.prototype.toString` on the publicly exported function.

## Interpretation and proof boundary

There are two materially different runtime-interface contracts:

1. **Every emitted module is independently importable by an arbitrary host
   program.** Then `state.mjs`'s exported `state` object is itself publicly
   observable through `Object.keys(state)`. Renaming its original own
   properties changes an observable return value. A conservative compiler
   should decline cross-file renaming without an independent proof that no
   host can use this export. Under this contract a public function body
   containing `state.hotScore` also cannot be rewritten without changing
   its `toString()`.
2. **Only an explicitly declared entry module is part of the application's
   runtime API, and all implementation dependency consumers are in the
   validated graph.** A module-local private helper can consume a renamed
   internal state object while the exported entry wrapper retains its
   exact source text. The first positive test demonstrates this conditional
   engineering capability. The current `closedWorld:true` boolean does
   not independently attest which modules the embedding host may import;
   a private/public entry manifest would need a reviewed admission proof.

These are **conditional API interpretations**, not alternative attacker
capabilities. The prompt's COO attacker still obtains every distributed
file and can execute them in an instrumented client. They can directly
import the internal module in an attack even when such an import is excluded
from the application's supported API. Therefore neither case supports an
integrity or confidentiality guarantee against this attacker.

The Agent16 candidate's 0-field refusal may be deliberate correctness
under the first contract or an overly broad proof under the second. The
observed count alone does not distinguish those possibilities. The
intermediate report explicitly does not claim its source proof is wrong.

## Bounded paired runtime result for the source-stable wrapper

The existing paired CPU harness
[`sims/property-hotpath-closedworld.js`](../sims/property-hotpath-closedworld.js)
now accepts a fourth optional `wrapped` style without altering the prior
three-style default profile. Its real-Node fixture keeps the public wrapper
source equal and requires **two actual rewritten fields** before timing.
The reproducible [focused profile test](../test/property-private-wrapper-profile.test.js)
uses 7,000,000 hot iterations, nine timed trials, six native/emitted
arithmetic probes, and balanced fresh ESM cold imports.

At exact source `d94e9aa694daba37a74b9d580f76e9711e34b3b3`,
[CI 44998385104](https://github.com/FlareZ123/obfs/actions/runs/44998385104)
passed on both Node 22 platforms and recorded:

| Platform | Native hot median | Emitted hot median | Hot compute ratio | Whole sampled ratio |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu | 3.109 ms | 3.137 ms | **1.0092×** | 1.0160× |
| Windows | 3.837 ms | 3.831 ms | **0.9984×** | 0.9835× |

The sampled whole ratio includes the benchmark's cold module-import median
and one hot computation. The hot ratio excludes build time and supports only
this particular native numeric workload. Neither the best nor the median
alone guarantees a universal worst-case 2.5× cap. The cross-pass branch
whose exported parameter names change remains semantically invalid under
an exact public-source contract despite its private hot arithmetic work.

## Recommended integration gate

First choose and document the allowable host-import interface. Then run
both the public-source negative and source-stable-wrapper positive on
**one exact integrated source** across Ubuntu and Windows. Require real
private-field and private-identifier yield where the selected contract
permits it, along with exact external source strings and native arithmetic
outputs. Complete-session 2.5× CPU evaluation and hostile-runtime security
tests remain separately required. Do not relax the positive metric merely to
make the integration CI green.
