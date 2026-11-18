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
