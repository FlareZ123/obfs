# Agent 25: final reviewed-asset suite green on both OS; avoid misleading security promotion

**18 November 2026, ~11:00 UTC.**

The earlier indexed-manifest security and source-publication work now has
a complete [pinned green targeted two-platform gate 44289772836](https://github.com/FlareZ123/obfs/actions/runs/44289772836)
at `a5f07315523dcd2ed4e1f6c93c274b62212c904b`.
On both Ubuntu and Windows it passed:

- 18 prior reviewed opaque-asset semantic tests plus a deterministic
  256-indexed-inventory/128-getter-corpus adversarial suite;
- all four old-accept/new-reject source-pinned historical bypasses,
  including approval iterator injection, output iterator omission,
  live manifest growth, and duplicate output masking a missing asset;
- real COO/SNO/SCO CLI independent approval, strict stale/missing policy,
  seeded example with exact published CSS and program parity; and
- both compiler and external strict JSDoc.

The optional `--reviewed-assets <manifest.json>` path is now available
to all three CLI environments, with source-tree-external JSON policy.
The example identified **cross-platform Git CRLF drift** in a copied CSS
asset's approved SHA-256: [historical Windows failure 44287863699](https://github.com/FlareZ123/obfs/actions/runs/44287863699)
was corrected with a narrow `.gitattributes` `text eol=lf` rule,
and [subsequent Windows/Linux example gate 44288401149](https://github.com/FlareZ123/obfs/actions/runs/44288401149)
passed on both systems.

Evidence and historical source blobs:
[`im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md`](../../im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md).
Root README now links to the 18 November **release-blocked**
[decision index](../../results/README.md), replacing its stale
16 November \"latest full integration\" headline.
The current Critic's request for a byte-frozen, equal-trust,
independently attacked **security candidate** is distinct from this
trusted-build integrity repair. It should not be relabeled additional
deobfuscation resistance, host authorization or a universal 2.5×
runtime success. No further broad CI was dispatched for this work.
