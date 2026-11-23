# Top-level-await and reentrant owner-observation evidence

**Status:** intermediate, test-only evidence. No production compiler code changed.

**Source pin:** `agent18/property-tla-reentrancy-20261123`, final commit
`51883bc332453fc85cd1e4f9a38e39b83e1cf883` (the first three cases were also run at
`33aaa2a20fe5a56be53effd954c7f71c81381e75`).

**Validation:** [manual-validation run 45106733028](https://github.com/FlareZ123/obfs/actions/runs/45106733028), focused test on Ubuntu and Windows with Node 22.23.4. Both platform jobs passed all six native ESM cases and strict project/external JSDoc. The earlier [five-case run 45106417122](https://github.com/FlareZ123/obfs/actions/runs/45106417122) and [three-case run 45106211373](https://github.com/FlareZ123/obfs/actions/runs/45106211373) also passed.

## Questions tested

The experiment targets the late immutable-key proof described in
`im-results/acyclic-late-imported-computed-pattern-2026-11-22.md` and
`communications/broadcast/2026-11-22T165500Z_agent1_computed-key-proof-request.md`.
It checks whether top-level await changes source-order and dependency-completion
assumptions, and whether an asynchronous observer can inspect an exported or
local owner before a later key initializer.

### 1. Acyclic dependency with top-level await: positive

The producer exports a literal object, awaits `Promise.resolve()`, then exports
an immutable string key naming one of the object's fields. An acyclic importer
consumes both exports in a computed destructuring pattern.

Observed:
- the compiler performs an actual positive owner-field rewrite;
- both original owner field names disappear from the emitted producer;
- the computed consumer key is rewritten to the corresponding emitted field name;
- native and generated Node ESM executions have identical status, stdout, stderr and signal.

This is consistent with ESM dependency evaluation: the importer body does not
execute until its acyclic dependency has completed evaluation, including its
top-level await and later key initialization.

### 2. Timer callback observes the owner during top-level await: refusal

The producer exports the object, then awaits a timer callback that evaluates
`Object.keys(bag)`, and only afterward initializes the immutable key. The
importer consumes the owner and key.

Observed:
- the compiler reports zero cross-file property rewrites;
- original and generated ESM executions match.

The asynchronous callback's own-key observation makes the original field
spellings observable before the later key initializer. The tested compiler
conservatively declines the owner rather than changing the observed key list.

### 3. Imported asynchronous observer in an acyclic graph: refusal

A producer imports an async observer from a separate module, exports the object,
awaits the observer with the object as an argument, and then initializes the
later key. The observer yields through a timer and returns
`Object.keys(record)`.

Observed:
- the compiler reports zero cross-file property rewrites;
- original and generated ESM executions match.

This exercises an owner escape through an imported async function in an
otherwise acyclic static graph, rather than only a callback declared in the
producer.

### 4. Local later key after top-level await: positive

A single module creates the owner, awaits `Promise.resolve()`, initializes the
immutable string key, and immediately evaluates a top-level computed
destructuring pattern.

Observed:
- the local owner fields are actually renamed;
- the computed pattern uses the emitted field name;
- original and generated ESM executions match.

This supports the narrow source-order case in which the key is initialized
before the immediately evaluated pattern, despite an earlier top-level await.

### 5. Local timer callback observes the owner before the late key: refusal

A single module creates the owner, awaits a timer callback that evaluates
`Object.keys(owner)`, then initializes the key and evaluates the pattern.

Observed:
- the compiler reports zero local owner-object rewrites;
- original and generated ESM executions match.

The asynchronous callback observes the field names before the key initializer,
so the late-key proof does not authorize a rename.

### 6. Multi-hop named reexport with top-level await: positive

The key producer awaits at top level before exporting the immutable string. A
second module reexports it under an alias and also awaits at top level. A
separate owner module exports the literal object, and the importer consumes the
owner plus the reexported key after its own top-level await. The static graph is
acyclic.

Observed:
- the compiler performs a positive cross-file owner rewrite;
- the computed consumer key is rewritten to the emitted owner field name;
- original and generated Node ESM executions match.

This extends the positive dependency-completion observation from a direct
import to a multi-hop named ESM reexport chain with top-level await at two
dependency levels.

## Interpretation and limits

These six source-pinned cases support three bounded statements:

1. Acyclic imported late-key admission remained behavior-preserving in both direct-import and multi-hop named-reexport cases with top-level await.
2. The local source-order late-key proof remained behavior-preserving when the key was initialized after a top-level await but before the immediate pattern.
3. The tested local timer observer, producer timer observer, and imported async observer prevented owner renaming and preserved native/generated output.

This is not a general proof that all top-level-await graphs are safe, nor that every host callback, reentrant loader, external consumer, dynamic import, custom import map, or runtime observer is covered. It is Node 22 ESM evidence, not native browser evidence. It establishes no confidentiality, tamper resistance, or universal 2.5× performance bound.

The reproducible test is
`test/computed-pattern-tla-reentrancy.test.js` on the source-pinned research branch above. The tests are not yet merged into mainline's test suite; they are available for the canonical property-proof owner to cherry-pick or extend.
