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

## Independent objective-axis assessment

| Requested axis | Evidence from this exact source-admission work | Limit |
| --- | --- | --- |
| Static deobfuscation and program reconstruction | Compiled JS bytes match the non-review path in 36 paired builds; no additional static transform | **Unchanged**. The review check is a publisher-side byte boundary, not a source-obfuscation primitive |
| Dynamic analysis, instrumentation and runtime extraction | The reviewed manifest creates no new emitted runtime mechanism | **Unchanged**. A full-control client/server owner can still instrument locally under the published threat model |
| Unauthorized modification and integrity bypass | Four historical checker acceptance errors now reliably refuse; exact indexed content and SHA-256 are checked on a trusted build, with cross-OS approved CSS bytes controlled | Build-time file admission only; downstream publication mutation and malicious reviewer approval are outside the contract |
| Execution outside an authorized environment | Neither domain checking nor server identity is changed | **Unchanged**. Authorization should rely on an appropriate trusted SCO server-side access control, not this asset manifest |
| Performance and compatibility | 20 handcrafted approval regressions, 384 seeded corpora, eight CLI tests, four historical pinned attacker controls, actual cross-platform example; 36 paired COO/SNO/SCO emitted files and metrics identical | Extra validation cost is at compile/SCO setup time; no universal 2.5× runtime claim or independent full-application parity follows |

The overall objective-axis decision is therefore a verified improvement
in publisher-side consistency and developer access to that check.
It cannot be promoted to strong obfuscation or whole-runtime integrity
under the COO/SNO/SCO full-control threat assumptions.

## Final trusted-build boundary control at exact source

The last narrowed
[Ubuntu/Windows gate 44291670683](https://github.com/FlareZ123/obfs/actions/runs/44291670683)
at `bb52438a76f8b60c35892335e5deb97158e2bef4`
passed **all steps** on both platforms, including all prior approved
manifest, CLI, seeded-fuzz, historical negative-control, reproducible
example, emitted-code equivalence and strict compiler/external
JSDoc checks.

The additional explicit `approval is not an override` test signs off
two important refusal precedences: even with a correct independently
approved SHA-256 for the whole published bytes, a `.map` asset
containing source-map `sourcesContent` and an HTML asset carrying
inline JavaScript still fail in COO, SNO, SCO compiler mode, and
direct SCO serving. A reviewed manifest can admit otherwise opaque
assets only within the already existing source-disclosure preflight.
This avoids interpreting the new CLI feature as a bypass switch for
specific prohibited source-bearing formats.

## Full integration source-coincidence check without a new CI storm

A separately dispatched
[full Linux/Windows and Ubuntu Chromium validation 44289657106](https://github.com/FlareZ123/obfs/actions/runs/44289657106)
completed successfully at `a74f34a14e790b91cfde4cf042953f9594515b3f`,
including its complete Node behavioral/adversarial test inventory,
blind recovery control, both strict JSDoc gates, benchmark/profile
steps, and Ubuntu's three real Chromium modules/host tests. Its
exact Git blobs for the two production files modified in this
investigation are **identical to the current implementation**:

- `src/cli.js`: `12a33544fedfa56aa4bfacc401394912fec9907a`.
- `src/reviewed-assets.js`: `508f7c5582c490ee2ff6fa69fed09ae17f5dd459`.

Thus that existing full test run exercised the actual updated
production code without dispatching an extra broad matrix. The
subsequent narrower [44291670683](https://github.com/FlareZ123/obfs/actions/runs/44291670683)
also passed the newer tests at exact `bb52438a` on both systems.
A full run at `a74f34a` does not attest to later test/doc-only
commits or freeze Node/dependency/browser binary versions. It proves
only the reported full suite and source-blob coincidence.

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


## 22 November: standalone reviewed-asset portable-name parity

The exported `assertReviewedOpaqueAssets(files,approved)` previously used
only `path.toLowerCase()` for collision identity, whereas the compiler's
`registerFilePath` also checks NFC-normalized uppercase identities and
canonical ancestor-directory spellings. Thus standalone review could accept
two separately approved assets whose output path names failed the compiler's
existing conservative portable-path policy. This distinction matters for
independent post-build review integrations and is a **policy consistency
issue**, not a measured collision on every Windows or macOS filesystem.

Node 22 string comparisons before the patch were lower-distinct for
`Σ.css` versus `ς.css`, for NFC-equivalent `Café.css` versus
`Cafe\\u0301.css`, and for `straße.css` versus `STRASSE.css`.
The normalized uppercase key collides for sigma and sharp-S; both
normalization keys collide for the composed/decomposed accent pair.
`Images/a.css` versus `images/b.css` instead has an ambiguous
ancestor directory spelling.

The minimal repair reuses `createPathInventory` and `registerFilePath`
inside both the indexed reviewed-manifest scan and the final published
opaque-file scan, retaining the exact path/hash comparisons and one-read
snapshot behavior. It does not expand this standalone function into a
general executable-file path validator. The full compiler already checks
the complete output graph separately.

- [Implementation commit 32ce4d1](https://github.com/FlareZ123/obfs/commit/32ce4d1019ab08a0ed922ef9edbe7f84b82df369).
- [Source-pinned Unicode and directory regression commit 115eb9b](https://github.com/FlareZ123/obfs/commit/115eb9bd3dd9a0ee8a4151e488300f40ce775ccd).
- [Focused Ubuntu/Windows workflow 44980198628](https://github.com/FlareZ123/obfs/actions/runs/44980198628): both OS jobs **green** at exact `115eb9bd3dd9a0ee8a4151e488300f40ce775ccd`, including existing reviewed-manifest regression and fuzz tests, the historical acceptance-witness checker, three-mode CLI checks, sample publication, and strict compiler/external JSDoc. The new test checks both manifest and file-inventory collisions, plus distinct Unicode positive controls.

This repair changes build/publisher-side refusal for ambiguous names.
Accepted JavaScript output is unchanged, so no new recurring protected-code
instructions are introduced. No release-wide integration, static secrecy,
anti-instrumentation, host-locking, or universal 2.5× claim follows.


## 22 November follow-up: reuse the compiler's exact path validator

The first path-identity repair above did not yet apply the compiler's
`safePath` validation to standalone reviewed/published opaque records.
Thus standalone review could admit a matching hash for `../theme.css`,
`CON.txt`, an absolute path, a backslash-separated path, or a
`~digits` short-name spelling, even though the complete compiler
would reject those inputs. This was an independent API-contract gap,
not evidence that the compiler distributed such assets.

The `safePath` function was moved **byte-for-byte** from
`src/core.js` into the existing `src/portable-paths.js`, while
`src/core.js` continues exporting the same function. Both the
compiler and `assertReviewedOpaqueAssets` now use that single
implementation. The indexed manifest and published asset scans each
invoke it after capturing the filename once. A dedicated test checks
10 unsafe names in **both** lists, plus a canonical positive control,
while the preceding Unicode/directory cases remain active.

- [Shared helper 97190bb](https://github.com/FlareZ123/obfs/commit/97190bb113838c5ed36afc164c1d2f5170a1c311);
  [compiler reuse 6de159e](https://github.com/FlareZ123/obfs/commit/6de159e1df0ccd79e97b1f24bfc9d1053170be4e);
  [standalone review 172ae6d](https://github.com/FlareZ123/obfs/commit/172ae6d939a1d374a8dc6c648cbee26adcf17746).
- [Unsafe-path test 67f5162](https://github.com/FlareZ123/obfs/commit/67f5162f2da45856d4adc300432e4aa61077c24c),
  with one corrected trailing-space fixture
  [94939e3](https://github.com/FlareZ123/obfs/commit/94939e30326d62a9b2afeca55b97a242a5ee0d14).
- [Two-platform review gate 44980591717](https://github.com/FlareZ123/obfs/actions/runs/44980591717)
  **passed all steps** at exact source `94939e30326d62a9b2afeca55b97a242a5ee0d14`,
  including existing historical manifest bypasses, the indexed
  adversarial corpus, executable three-mode CLI sample, and both
  compiler/external JSDoc checks.

A separate filesystem hypothesis concerned a Microsoft-documented
[Win32 leading ASCII space normalization rule](https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/file-folder-name-whitespace-characters).
No equality was assumed. The existing `sims/path-alias-grid.js`
was extended with three raw-name pairs and added to the
already-existing focused review workflow. Its
[Ubuntu/Windows run 44980902260](https://github.com/FlareZ123/obfs/actions/runs/44980902260)
completed **green** at `e8c5d1a2ae8bce4d5747f59a6b56dde202ac0aac`,
with Node `v22.23.5` on both runners. The Windows exclusive-create
observations found `" probe.js"` and `"probe.js"` separately present;
likewise `" .probe.js"` and `".probe.js"`, and the ideographic
leading-space control. Ubuntu also kept all three pairs distinct.
This is an observed **non-alias on those Node/runner paths**; it does
not establish equivalence across Windows API namespaces, volume
settings or future filesystems. The existing `safePath` rule was
left unchanged for leading ASCII spaces.

The compiler's emitted runtime logic and public obfuscation modes
are untouched by this refactor. These are trusted-build path
admission checks; they do not upgrade the current release-blocked
static, dynamic, host-authentication or 2.5× adversarial verdict.
