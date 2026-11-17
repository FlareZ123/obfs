# SCO direct-handler private metadata getter snapshot, 2026-11-17

**Status:** Three direct-handler metadata regressions and the initial snapshot patch passed exact-SHA Ubuntu/Windows Node 22 CI. A fourth mutable array-index regression and its follow-up patch await separate exact-SHA verification. This is trusted-server publication-boundary engineering, not protection against a malicious server operator.

## Scope

`createScoHandler` accepts source files with optional `privateModulePaths` and `privateOriginalDigests` metadata. Its private-path set refuses accidental co-serving of declared private dependencies, and its SHA-256 set refuses byte-identical original private source under a different public path. These checks are important when a developer assembles a direct handler rather than the separately sealed `createScoGraphHandler` entry point.

Before the candidate, construction read each optional metadata property repeatedly: first to check whether it was defined, again to validate the array and its entries, again to collect its entries, and again when building the normalized source record. A caller-owned getter could return a meaningful initial declaration followed by empty arrays on subsequent reads. The declaration first observed by the handler would then be omitted from the forbidden or digest sets.

A deterministic proof-of-concept manifest returns `['private.css']` only on its first `privateModulePaths` read, then returns `[]`. When the source array includes a file `private.css`, the previous loops can miss the prohibited path and admit it. Another manifest returns a valid SHA-256 of the original private bytes only on its first `privateOriginalDigests` read, then empty arrays, allowing a byte-identical private asset under another filename. This is a **server-owned getter consistency failure**. Any malicious operator who can replace a handler's source list can disclose secrets directly; the reported risk is accidental or buggy trusted integration, not a remote route exploit.

## Candidate

Capture each optional metadata property **exactly once** at handler construction, copy the returned arrays, validate the owned copies, build forbidden path and original-digest sets from those copies, and reuse the same copy when normalizing each public source record. A third regression found that the digest array's *element* getter could also change between the original validation pass and the later snapshot spread. Two additional test cases show that a caller-owned path array `map` method can return an empty list and a digest array's custom `Symbol.iterator` can return no elements, hiding genuine indexed declarations. The corrected candidate uses an indexed loop to copy array entries exactly once before validation and path normalization, so those caller-controlled array methods are never invoked by the metadata snapshot. The same helper now snapshots the input `sourceFiles` array before constructing the private manifest sets and published file inventory: an overwritten `sourceFiles.map` can otherwise hide the first pass's manifest while changing the second pass's file set. See real constructor negative control at `a89e8890b2cb232920def51242d63cc607567af3` and source patch `29c475acf5276e19c02617c4a8aa6aba6a1cdc0c`. Source code bytes were already snapshotted separately; this extends that construction-time invariant to its private publication declarations.

The source patch is commit `476232413fb29115959556505117e82d6f0c360a`. Two property-getter refusals and a stable-manifest control began in `test/sco-private-metadata-snapshot.test.js` at `f04131395345305d86a995af9d1b743349ff1a49`. A fourth test, committed at `33bbfa4d6bbb749653ff21fd1e42bcaecac76916`, supplies a mutable digest array index accessor. Initial `src/sco.js` metadata patch `476232413fb29115959556505117e82d6f0c360a` still read that element twice. Final correction `0ed510143c63390bd3934a4966ea7af759bf2e6f` snapshots array indices before checking SHA-256 syntax. The existing `manual-sco-authorization.yml` suite now includes this test, committed at `70c36fb324dd865c6d9c6ebca92e3dd1489cd222`.

## Required validation and limits

Run Node 22 on Ubuntu/Windows at an exact SHA with the direct-handler negative cases, the existing private-graph and source-publication suites, strict JSDoc, and the Chromium publication tests. A test-only red pin prior to the patch would distinguish a meaningful regression from a green-only guard. The repository's manual runners were queued when this report was written, so no CI result is presumed.

The fix does not provide a cryptographic private-module attestation, eliminate the need to review `publicPaths`, detect every byte-modified original source, or protect a handler against its own malicious operator. The sealed graph helper retains its separate in-process partition identity and manifest snapshot. No new per-request CPU or network work was added; this is construction-time metadata handling.

## First cross-platform green evidence

[Manual SCO authorization run 44048517033](https://github.com/FlareZ123/obfs/actions/runs/44048517033)
passed both Ubuntu and Windows Node 22 at exact SHA
`837f5a277477887e83541be4a1fb419c9961a67d`: Ubuntu
**175/175 passed**, Windows **174/175 passed, one skipped**, zero
failures. The three original metadata test cases passed on both runners,
alongside private source graph admission, static and dynamic loader
challenges, strict JSDoc and Ubuntu Chromium integration. The follow-on
digest array-element getter test and corrected snapshot-first validation
were committed afterward. This green run cannot establish their behavior.

The test-only original-metadata source branch
`agent1-sco-private-metadata-red-20261117` at
`46cb5d41fc45044301bd48b64a7aa35f2df2143e` is queued under
[run 44048791393](https://github.com/FlareZ123/obfs/actions/runs/44048791393).
A red execution of the known source limitation is still pending and must
be reported separately when completed.
