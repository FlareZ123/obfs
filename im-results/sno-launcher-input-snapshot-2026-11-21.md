# Direct SNO launcher input snapshot for package-scope and manifest consistency

## Problem and observed boundary

The SNO direct `createSnoLauncher(files,entry)` API builds a single CommonJS entry launcher, verifies an exact SHA-256 manifest, and identifies whether a `.js` entry is within a CommonJS or ESM `package.json` scope. Before this change it read the original `files` array repeatedly with `.some`, `.find`, and `.map`, and accessed some source `file.path` and `file.code` fields multiple times. A caller-supplied getter could change the package type between the validation reads and the final hash, or provide a different filename during manifest construction. Caller-modified Buffers could also change after the package check but before hashing.

The resulting inconsistency is local build-input correctness, distinct from resisting an attacker who already owns an SNO filesystem and Node runtime. That stronger threat model remains unsolved.

## Change

Commit `2c49d737f614823da60032e74fa07d76ccb15c21` first snapshots indexed `files` entries, validating each path once through `safePath`, accepting only source strings or Buffers, cloning each Buffer, and retaining the resulting internal `{path,code}` records for all subsequent launcher entry, package-scope, canonical-path collision and manifest digest decisions. This avoids trust in caller array's overridable `.some`, `.find` or `.map` and makes the compile decision use one value for each field.

Regression file `test/sno-launcher-input-snapshot.test.js` added at commit `c7841502d304bdb1f0781fd6b460e796704f1120`, with five checks:

- package metadata getter alternating CommonJS to ESM returns one captured value;
- path and source-code getters return different values if called twice; both must be read exactly once;
- caller array `.some`, `.find`, and `.map` overrides do not alter output;
- later getter mutating a previously owned package Buffer cannot retroactively alter the captured manifest digest or package-scope decision;
- missing array entries and unsupported code types fail before output.

The exact source/test commit is pinned on branch `agent4/sno-snapshot-utf16-parity-20261121`. [Full manual Node22 Linux/Windows and Ubuntu Chromium run 44939555102](https://github.com/FlareZ123/obfs/actions/runs/44939555102) was dispatched and remained in progress at report creation; do not claim success until actual job conclusions are confirmed.

## Limitations

A one-pass snapshot is a deterministic internal value boundary. It is not an atomic snapshot of a caller's entire mutable collection: an earlier getter may change a later entry before that later index is read, and a hostile runtime can change memory or the filesystem after build output. These constraints are explicit. It adds compiler-time Buffer copies and no new protected-runtime instrumentation, so it does not itself establish a universal protected-code 2.5× claim. The project's primary full-control adversary security release remains blocked.


## Validation run

Source-pinned full Ubuntu/Windows Node 22 + Ubuntu Chromium run [44939555102](https://github.com/FlareZ123/obfs/actions/runs/44939555102), exact `c7841502d304bdb1f0781fd6b460e796704f1120`, was still executing when this section was added. The later full text-asset preflight candidate `d869759be31c8aa2a175ecc16a7ab72b5f987157` also includes this snapshot and has a separate [run 44939896026](https://github.com/FlareZ123/obfs/actions/runs/44939896026). Keep job conclusions distinct and source-pinned.
