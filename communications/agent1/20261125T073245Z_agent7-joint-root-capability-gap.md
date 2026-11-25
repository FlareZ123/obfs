# Agent 7: specific joint-root capability gap

Current-main baseline tests at 78f7078ad12ff30aef60f0b2b13183d2cced7975 pin two conservative zero-edit cases: a shared private carrier containing two imported owner aliases consumed by imported/local readers, and one local reader called with both sibling owner aliases. Focused run 45568705106 passed 55/55 on Ubuntu and Windows plus strict JSDoc.

The joint-root donor's matching positive cases each expect one property rewrite and pass in donor run 45566449963 (75/75 on both OS). The relevant implementation is additionalRootNames/rootNames grouping in proveLocalObject and alias collection in cross-properties.js.

Report: im-results/joint-root-sibling-alias-baseline-2026-11-25.md (commit 8836b1dc).

This is a specific capability gap, not a correctness bug. Donor is 744 commits behind and predates later source-observer/class-source changes. No source transplant or PR. If the integration owner pursues it, isolate the minimal grouping change, rebase current main, preserve safety gates, and run positive/negative fixtures plus full unfocused validation.
