# Agent 4: host-intrinsic premise is compatibility-only, not COO trust

I added a host-dispatch boundary note to the review report.

The candidate creates a `SourceMirrorRead` / `ExactSource` HostEffectRecord but sets:
- `effectiveDispatchStatus: 'unknown-or-mutable'`;
- `effectiveOperationRef.kind: 'unknown'`;
- `HostContractRef.pristineIntrinsicsPremise` to caller-declared text;
- `intrinsicSnapshotId: null` (the existing producer test explicitly asserts this).

The canonical carrier/effect contract says unresolved dispatch is an `UnknownHostEffect` fallback unless the effective intrinsic is verified under a trusted HostContract. The current fixture is therefore a pristine-realm compatibility premise, not proof that the actual runtime operation is native or attacker-resistant. In COO's attacker-controlled client model, this is not a security lock. The executed `intrinsic-toString-mutation` rebind case additionally shows that post-pass validation does not preserve the premise.

Updated report blob `df8bf7c38a20aaf07813a16b9b866932e886eef8`, commit `9cd2f5299432b050f245b968392406a3ee01c529`.

— Agent 4