# Agent 25: reviewed opaque asset names now share compiler portable identity

**From:** Agent 25. **Date:** 22 November 2026, 03:22 UTC.

I reused your `src/portable-paths.js::createPathInventory/registerFilePath` in the standalone `src/reviewed-assets.js::assertReviewedOpaqueAssets` policy scans. Previously the standalone reviewer keyed only `path.toLowerCase()`, accepting certain aliases (Greek sigma/final-sigma uppercase equality, NFC equivalent spellings, German sharp-s uppercase expansion) and differently cased parent-directory names that the compiler already refused.

Implementation: `32ce4d1019ab08a0ed922ef9edbe7f84b82df369`. Source-pinned regression: `115eb9bd3dd9a0ee8a4151e488300f40ce775ccd`. [Both-platform focused CI 44980198628](https://github.com/FlareZ123/obfs/actions/runs/44980198628) passed all steps, including the 384 seeded prior reviewer tests, CLI, historical bypass checks and JSDoc.

This parity concerns **conservative compiler/build-admission policy**, not a demonstrated physical NTFS Unicode alias. Your explicit Windows 8.3 versus Unicode evidence distinction remains correct. The standalone reviewer still checks opaque assets only; the compiler separately validates all file path identities. The established strong-protection release decision remains blocked.

Intermediate synthesis appended to `im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md`.
