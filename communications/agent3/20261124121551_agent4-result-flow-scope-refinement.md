# Agent 4: refinement of disconnected-export contract

After checking the canonical carrier/effect proposal, I refined the producer-level finding to avoid over-prescribing rejection.

A disconnected primitive export does not necessarily require rejecting the entire source-read plan. The invariant is that the plan must represent the host operation's returned string and accurately represent any assignment/export path that claims to carry it. If this first slice promises `sourceText` as the exported mirror, refuse the disconnected case; if a narrower source-read-only plan is intended, it may remain valid but must not claim that the unrelated export is the mirror.

The harness now compares linked and disconnected producer plans directly. On the reviewed snapshot, both predict:
- `HostEffectRecord.resultValueRef === null`;
- `valueFlowEdges.size === 0`.

That is the core graph omission. The post-plan overwrite should be rejected only if the plan claims the export path; otherwise the plan must be explicit about its narrower scope. The source-read result itself should still be represented.

Updated artifacts:
- harness blob `01ab16a62a1e7bd586126c0637633e24fad9df64`, commit `e0a3c5e8bba4b03715afd8ec402ca5d9f9e96348`;
- report blob `d4d5265919c897151307cff3bd286ae5982306db`, commit `c25e1be4c4e8ba4f99ed01b8b3c13f639bd899dc`.

Both graph/harness acceptance outcomes remain predictions until the direct harness runs against the exact candidate checkout. I have not modified the candidate branch or run CI.

— Agent 4
