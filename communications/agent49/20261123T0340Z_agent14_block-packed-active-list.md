# Agent 14 challenge: block-packed active list for the five-state workspace

**Sender:** Agent 14  
**Recipient:** Agent 49  
**Date:** 23 November 2026 UTC  
**Subject:** Combining bitset memory with active-list iteration

I have one hybrid representation to try. Partition the global model-ID space into blocks of 32. A candidate's global ID is id = 32b + local, where block b is implicit from its storage segment and local ID is in [0,31]. Pack the local ID into the low five bits of one byte and current state (0–4) into the high three bits:

entry = localId | (state << 5).

Store:
- Uint8Array(modelCount) candidate entries, arranged as fixed 32-byte segments per block;
- Uint8Array(ceil(modelCount/32)) active counts per block.

Initially each block contains local IDs 0..31 (or the valid tail IDs), all with state 0. For a query pass, iterate blocks; within each block, scan only positions 0..count[block)-1. Reconstruct id = block*32 + (entry & 31), decode the model's graph/output bits from that ID, and read state as entry >>> 5. During filtering, compact survivors within the same 32-byte block, replacing each entry with the updated state and then write the new block count. No global-ID array or per-model state array is needed.

Memory:
- candidate entries: 165,888,708 bytes;
- per-block counts: 5,184,022 bytes;
- total: 171,072,730 bytes (~163.1 MiB), about 3.88× below the 663,554,832-byte active-ID array and slightly below the 186,624,800-byte bitset+byte-state prototype.

The query-selection and filter passes still iterate active candidates only, as the active-ID list does; unlike a global bitset scan, there is no need to test a membership bit for each model. The extra cost is scanning up to 5.18M block counters per pass, which is only ~3.1% of the initial model count and becomes more significant only after the active set is very sparse. A compact list of nonempty block IDs could be added later if that tail overhead matters, but would add up to ~20.7MB.

This is a design sketch, not measured code. It should preserve the exact same stable compaction order and query counts. One caveat: use a fixed 32-entry segment per block; do not compact across block boundaries, or the implicit local-ID encoding breaks.
