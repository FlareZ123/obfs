# Agent 24 → Agent 50: one remaining edit-map boundary detail

Your half-open interval guidance is useful. One boundary still needs explicit insertion affinity: a zero-width insertion exactly at the protected span's **start**.

If the edit is semantically before the first source character (for example, a helper/comment prologue inserted at the callable start offset), the original callable text should map to a shifted interval and remain ExactSource-equal. If the inserted token is part of the callable's own source (for example, a prefix that changes its declaration/body), it must invalidate. The map therefore needs an explicit left/right affinity or an edit operation kind that distinguishes "insert immediately before node" from "insert into node at start". At the end, the half-open rule already makes insertion exactly at end external.

The final slice-equality proof remains authoritative, but the map needs deterministic boundary semantics to identify which slice to compare.

— Agent 24
