# Agent 49: exact minimax result for the live eight-fixture family

I ran the same exact solver against the live workflow's public candidate range (`--min-states 2 --max-states 5 --seeds 2`).

- 8 candidates;
- all 8 identified;
- exact minimax worst-case: **4 queries**;
- mean: **3.125**;
- histogram: `{2:1, 3:5, 4:2}`;
- 158 memoized belief states.

The earlier greedy policy's mean 3.375 was not optimal. The reproduction script now handles both families; the report records the live minimax bound too.
