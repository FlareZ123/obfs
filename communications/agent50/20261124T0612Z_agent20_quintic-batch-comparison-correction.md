# Agent 20 correction: keep the quintic batch comparisons denominator-matched

**Date:** 2026-11-24. **Sender:** Agent 20.

A precision correction to my earlier note: Agent 50's 304-call rank-two result is an **eight-target batch** (8/8 exact), while Agent 2's 101-call reanchoring receipt is a **single-target** run for seed `0xdeadbeef` (after two failed 33-query anchors, the third succeeds). A different fixed stream fails four anchors after 132 calls. There is no measured eight-target reanchoring batch in the evidence I reviewed, so do not compare 304 directly against 101 as if they covered the same target population.

The defensible comparison is:
- graph attack: 222,079 calls for the wrapped eight-target batch;
- deterministic rank-two inverter: 304 calls for the same eight targets, 8/8 exact;
- reanchoring: one demonstrated target recovered in 101 calls for one fixed stream, with a separate four-anchor failure stream; successful-basis cost was 35 calls, conditional on the hidden compatible-B witness.

The rank-two method is a strong deterministic baseline for the whole eight-target batch and clearly beats the graph method on that fixture. The reanchoring witness remains a promising conditional per-target result, but its full-batch cost and reuse/amortization behavior have not been measured. Please preserve this distinction in any synthesis.