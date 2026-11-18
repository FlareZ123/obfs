# Indexed opaque-asset approval and publication snapshots (18 November 2026)

**Status:** source-pinned executable trusted-build admission repair. This is
intermediate security engineering evidence, not an obfuscation-confidentiality
result under a fully controlled runtime.

## Authority and counterexample

The optional `reviewedOpaqueAssets` manifest is supposed to bind an
independently approved list of exact relative paths and SHA-256 bytes to
published opaque files. Before this change, `assertReviewedOpaqueAssets`
iterated both the approved manifest and published file inventory using
`for...of`, and read approved record accessors several times.

A caller-supplied array can have an own `Symbol.iterator` that yields
records different from its indexed entries. A getter can also append another
record while `for...of` continues over a live array, or change `path` and
`sha256` between validation and insertion. Consequently the old validator
could return successfully for an asset absent from the reviewer-visible
indexed approval list.

Historical exact-source negative control:
`src/reviewed-assets.js` at commit
[`0875dc83f22d455cafbd20cb98daea2bdc9ca38b`](https://github.com/FlareZ123/obfs/commit/0875dc83f22d455cafbd20cb98daea2bdc9ca38b),
Git blob `d7a4e94ecdb1e5fd9a5e013578138a8bb256138a`.
Its bytes are retained in
[`sims/fixtures/reviewed-opaque-legacy.cjs`](../sims/fixtures/reviewed-opaque-legacy.cjs).
The independent
[`sims/reviewed-opaque-manifest-attack.js`](../sims/reviewed-opaque-manifest-attack.js)
executes this historical checker and the current checker on the same
three independently reconstructed scenarios.

| Controlled surface | Historical checker | Indexed checker |
| --- | --- | --- |
| Manifest iterator yields a new unindexed `preferences.txt` approval | accepts | rejects |
| Published-file iterator hides the actual unreviewed file, yields approved `theme.css` | accepts | rejects |
| Record path getter appends an unindexed approval before iteration ends | accepts | rejects |

The first two are alternate-array-iterator controls. The third is a
changing-collection control without a custom iterator. The attacks do not
need to find SHA-256 collisions: they supply valid hashes for the attacker
selected bytes and modify **which records are consulted**.

## Repair and test evidence

The compiler now captures the initial indexed array length, reads each
manifest record's `path` and `sha256` once, validates the exact captured
primitive values and uses those values in the lookup. The exported
final-distribution recheck also walks an indexed file array, capturing each
asset's `sourceType`, `path` and `code` once. Sparse arrays fail
rather than allowing `for...of` to skip an uncontrolled inventory slot.

- [First patch `11f0b6a`](https://github.com/FlareZ123/obfs/commit/11f0b6a5dba7dd4b88fb5f26ee717ed0a7b822eb): approved-record snapshot and five focused cases.
- [Second patch `7f827b5`](https://github.com/FlareZ123/obfs/commit/7f827b548031d056a6201ed641950edf1254b64e): indexed output file recheck and four additional cases.
- [Source-pinned adversarial replay `156e3cf`](https://github.com/FlareZ123/obfs/commit/156e3cfe72fa9861b2fadefbf5532ad67a1d8ac5): historical implementation retained and manual workflow enhanced.

The exact-source
[Ubuntu/Windows CI run 44284037495](https://github.com/FlareZ123/obfs/actions/runs/44284037495)
completed green at `156e3cfe72fa9861b2fadefbf5532ad67a1d8ac5`.
Both platforms passed the 17 combined prior/new reviewed-asset tests, all
three baseline-accept/current-reject source-pinned attack scenarios,
`npm run typecheck` and `npm run typecheck:external`.
An earlier [green two-platform gate](https://github.com/FlareZ123/obfs/actions/runs/44283298264)
at `7f827b5` independently ran the 17 reviewed-asset cases and both
JSDoc checks before the historical replay fixture was added.

## Duplicate actual-asset path and CLI admission follow-ups

A fourth independent negative control exposed another weakness in the
standalone final-distribution validator after the indexed-loop repair:
the old integer `matched` counter accepted two copies of `theme.css`
against two reviewed entries `theme.css` and `preferences.txt`, despite
the second reviewed path never being present. This required no getter
tricks or hash collisions. [Patch `de6507d`](https://github.com/FlareZ123/obfs/commit/de6507d943de2cebc006822fe338801a6ca5bca2)
stores distinct matched path identities in a Set, rejects duplicates,
and validates exact matched-set cardinality. The new
`sims/fixtures/reviewed-opaque-pre-duplicate.cjs` preserves exact
prepatch source bytes at blob
`7b56fa7eeb2e86e6d52052ed577c72419a8d9aea`.
An additional source-pinned adversary assertion verifies the old and
prepatch implementations accept while the repaired one refuses.

The [two-platform run 44284975291](https://github.com/FlareZ123/obfs/actions/runs/44284975291)
at exact `de6507d943de2cebc006822fe338801a6ca5bca2`
passed **18/18** focused tests and all **4/4** historical
old-accept/current-reject scenarios, plus compiler strict JSDoc on
Ubuntu and Windows. The overall job was **red**, independently:
external JSDoc failures were observed in concurrently committed
`test/sco-selected-graph.test.js` (TS2322/TS2345) and
`test/sco-selected-handler.test.js` (TS2769/TS2810). Those source
files were last edited by Agent 18. Exact failures and follow-up
were sent to Agent 18 under
`communications/agent18/2026-11-18T1026Z_agent25_sco-test-typecheck-red.md`.
No overall green claim is made for that revision.

All three executable CLI entrypoints now accept the optional
`--reviewed-assets <manifest.json>` argument, with a JSON array of
`{path,sha256}` records stored outside the source root. COO/SNO apply
it to all copied assets and SCO to the explicitly selected public
`--asset` set. The external source-root restriction avoids recursively
copying an approval document as an untransformed public asset.
[Source commit `0d9b5c4`](https://github.com/FlareZ123/obfs/commit/0d9b5c4e53d82d7287b49e1a9701af632e8e35ac),
[JSDoc repair `035a2db`](https://github.com/FlareZ123/obfs/commit/035a2dbf00e677d27c54864ffb036a29b913bc75),
and [six cross-mode CLI tests](../test/cli-reviewed-opaque-assets.test.js)
cover exact emitted bytes, rejection before output, outside-root
preflight and actual SCO HTTP delivery. The
[source-pinned Linux/Windows run 44286470985](https://github.com/FlareZ123/obfs/actions/runs/44286470985)
confirmed the new CLI tests, 18 reviewed asset tests,
4/4 historical controls and compiler strict typecheck pass on both
OS. The same four unrelated external JSDoc test diagnostics made
that run **red overall**. No general integration verdict follows.

## Interpretation and limits

This establishes a narrower, reproducible **trusted-build admission**
property for ordinary indexed arrays, including custom iterators and
accessor-backed records. Runtime obfuscated JavaScript was not modified.
The additional loops execute during compilation/verification, outside the
project's recurring protected-code runtime budget. No new 2.5× claim is
needed for accepted programs.

It does **not** demonstrate confidentiality against a publisher who can
freely approve different source-bearing bytes or replace the output after
verification. A caller can mutate the published `Buffer` or output
inventory *after* a final recheck, so the publication process must emit the
same snapshot that was hashed. Proxy objects and maliciously patched
built-ins are not an independent trust boundary. Exact source-map detection
is separately incomplete for arbitrary opaque encodings, and client/server
full-control attackers retain their existing analysis and bypass abilities.

Keep future claims scoped to the reviewed manifest + exact emitted byte
identity, and rerun the source-pinned control after any change to its
publication contract.
