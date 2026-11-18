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

## Cross-platform reviewed-byte reproducibility

The checked-in CLI example caught an independent build-pipeline
boundary: a file approved by exact SHA-256 on Ubuntu was checked out
with different bytes on Windows because the Git working-tree default
converted LF to CRLF. In the pinned
[Windows/Ubuntu run 44287863699](https://github.com/FlareZ123/obfs/actions/runs/44287863699)
at `f05c5128e382ca259e6caf584df547a08c781631`,
the Ubuntu example passed, but the Windows example observed
`sha256(theme.css)=6c6fb86fb7d714f2a550118968a1fe904e768ba4df1c4d94790e5f9ded6f4672`
instead of independently approved
`fd001f31bc523d4952567bbddf6c5ccd203efab9928b6ec2b63f4d8628bf0a74`.
The sample's upfront digest assertion failed deliberately before any
publication. This is a real exact-byte review and portability mismatch.

[Fix `ad8f27b`](https://github.com/FlareZ123/obfs/commit/ad8f27bc8e1afb9780cfe72cf29f11774befabfb)
added a narrow `.gitattributes` rule
`examples/reviewed-assets-cli/source/theme.css text eol=lf`,
consistent with the repository's existing source-snapshot LF policy.
The subsequent [CI run 44288401149](https://github.com/FlareZ123/obfs/actions/runs/44288401149)
at that exact commit **passed the executable native/compiled example
step on both Windows and Ubuntu**, including CSS byte identity,
COO/SNO program parity and stale-approval preflight. Its overall jobs
remained red due to the four independently observed SCO external
JSDoc diagnostics, which this Git attribute does not address.
A production review must pin actual distributed file bytes, not assume
that a repository text blob hashes identically after cross-platform checkout.

## Pinned fully green targeted gate and deterministic adversarial corpus

The later [two-platform run 44289772836](https://github.com/FlareZ123/obfs/actions/runs/44289772836)
at exact source `a5f07315523dcd2ed4e1f6c93c274b62212c904b`
supersedes the earlier red overall CI statuses for this narrowly scoped
research lane. All jobs completed **green** on Ubuntu and Windows:
18 reviewed-asset hand-written cases, 8 real three-mode CLI cases,
the full runnable cross-platform example, four historical
old-accept/current-reject attack controls, the new seeded adversarial
corpus, and both strict JSDoc gates.

The seed-pinned
[`test/reviewed-opaque-manifest-fuzz.test.js`](../test/reviewed-opaque-manifest-fuzz.test.js)
uses xorshift32 seeds `0x25a551e` and `0x25fe11e` and covers 256
unique indexed asset inventories (2–13 assets each) under exact
acceptance, stale data, duplicate/missing published path, unapproved
published path, unused approval, case mismatch, injected manifest
iterator and injected published-file iterator. A second 128-case
sample checks that both approval records and published-file record
accessors are evaluated exactly once per entry. All 384 seeded
corpora completed without a discrepancy. The compiler emits no extra
obfuscated instructions for this admission layer, so a stronger
runtime-budget conclusion would be unjustified.

The strict external JSDoc failures previously reported in the
SCO test files were fixed by a concurrent Agent 1 source integration
at `9c3a1a119`, present in the green targeted source pin.
The [18 November Critic decision](../communications/broadcast/2026-11-18T1050Z_critic_artifact-freeze-before-security-candidate.md)
distinguishes source-pinned compatibility from byte-frozen executable
attacker trials. This asset review work is a trusted-build consistency
improvement, not a nominated obfuscation-security candidate.
The release-blocked security assessment in `results/README.md`
remains unchanged.

## Emitted-byte invariance across the three modes

A later exact-source
[Ubuntu/Windows manual gate 44291038156](https://github.com/FlareZ123/obfs/actions/runs/44291038156)
at `cf32a9fe9935a9b829f9afd6a936f5eb75d48947`
completed **green** on both operating systems. Alongside the full
focused reviewer/CLI/seeded-fuzz tests and both JSDoc checks, it ran a
new 36-pair compiler-output differential:
`test/reviewed-opaque-manifest-snapshot.test.js` compiles a native
two-file CommonJS worker plus one exact approved CSS asset in COO,
SNO and SCO, for twelve deterministic seeds each. The comparator
asserts the `files` source text, bytes, metadata and compiler metrics
match exactly with and without the optional approved manifest.

This establishes **zero extra emitted runtime instructions or changed
runtime bytes** in these 36 paired compiler examples, by direct
byte comparison. The validation does extra SHA-256 and inventory work
at compile or SCO server setup time. It does not establish a general
2.5× bound on obfuscated work, short sessions or end-to-end SCO RPC.
The full results decision index remains release-blocked.

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
