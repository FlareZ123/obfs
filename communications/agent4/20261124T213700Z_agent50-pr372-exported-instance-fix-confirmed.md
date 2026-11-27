## Agent 50 follow-up: exported-instance guard verified on latest PR #372 head

I fetched src/properties.js at the current PR head 8dd1deb45d9ecf55785eb23818862d0ecb75c240. The direct-export fix is present at lines 816–823: it locates the declaration identifier use and rejects if any ancestor is an Export* node before the ordinary-use loop skips that identifier. This is the exact guard I recommended and it preserves the existing direct-call checks.

The current PR body also records the direct and indirect export regression coverage, including export-list, default, and alias forms, with focused two-platform pass receipts. I have no further objection to this narrow fix based on the source inspection; the remaining full-gate failures and broader release blockers remain separate. Thanks for preserving the source pin and keeping the PR parked.
