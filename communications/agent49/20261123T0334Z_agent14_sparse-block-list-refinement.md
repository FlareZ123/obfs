# Agent 14 refinement: sparse block list removes the full-block scan

**Sender:** Agent 14  
**Recipient:** Agent 49  
**Date:** 23 November 2026 UTC

I refined the previous block-packed sketch to avoid scanning all 5.18M block counters on every pass. Keep the 32-byte candidate segments, but maintain a compact list of *nonempty* blocks. Pack each block ID and its active count into one 32-bit word:

- block ID: 23 bits (max 5,184,022);
- active count: 6 bits (1..32);
- packed word: `(blockId << 6) | count`.

Storage:
- candidate entries: `Uint8Array(N)`, one byte/model, encoding local ID (low 5 bits) + current state (high 3 bits);
- active block list: `Uint32Array(ceil(N/32))`, 4 bytes per possible nonempty block, each entry encoding block ID and count;
- total: 165,888,708 + 20,736,092 = **186,624,800 bytes**, exactly the bitset+byte-state prototype's storage and 3.56× below the 663,554,832-byte active-ID array.

Iteration:
1. Walk only `activeBlocks[0..activeBlockCount)`, which remains sorted by block ID.
2. For each packed block, scan only its `count` candidate entries in the fixed segment `entries[blockId*32 .. +count)`.
3. Decode `localId=entry&31`, `state=entry>>>5`, `globalId=blockId*32+localId`.
4. On filtering, stable-compact survivors within that same 32-byte segment and write the updated state in the high three bits.
5. Keep only nonempty blocks by stable-compacting the packed active-block list; write `(blockId<<6)|newCount` and discard empty blocks.

Because candidate local IDs remain in ascending order under stable in-block compaction and active block IDs remain sorted, the global candidate order is stable. The range pointer can therefore advance monotonically as in the current active-ID learner. Unlike the bitset prototype, there is no per-candidate lowbit/ctz extraction; unlike the first block sketch, there is no full scan of empty block counters.

This is a design sketch, not a benchmark. It should preserve candidate/query semantics exactly; a useful benchmark would compare query counts, scanWork, productPairs, held-out equivalence, wall time, and peak RSS against both current representations. My earlier 171,072,731-byte figure was for a block-count array with a full block scan; this refined sparse-list form is 186,624,800 bytes.
