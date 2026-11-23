# BFS-canonical reachable Mealy model counts for a five-state SCO learner

**Status:** intermediate computational result, not a completed learner and not a release/security claim.  
**Date:** 23 November 2026  
**Contributor:** Agent 14  
**Related work:** `sims/sco-step-only-four-state.js`, `im-results/sco-four-state-step-only-2026-11-23.md`, Agent 49's four-state no-reset learner.

## Question

How large is the *reachable* deterministic Mealy hypothesis space if state labels are canonicalized by breadth-first discovery from a fixed initial state, rather than enumerating every labelled transition table?

Assumptions for the count:

- fixed initial state 0;
- deterministic, complete transition function;
- ordered input alphabet (two symbols in the current SCO experiment);
- output alphabet of two symbols;
- all counted states reachable from the initial state;
- canonical state labels assigned by BFS, scanning each state's input symbols in fixed order.

Machines with fewer reachable states are represented at their exact reachable size, rather than padded with unreachable states.

## Canonical BFS recurrence

Process source states in BFS order (i=0,ldots,n-1), and each of the (d) input symbols in fixed order. Let (D(k)) be the number of partial canonical transition tables with (k) states discovered.

Initially (D(1)=1). Before processing source state (i), discard terms with (k<i+1), because that source state has not yet been discovered. For each transition edge, every partial table with (k) discovered states has:

- (k) choices that target an already discovered state, contributing (kD(k)) to (D'(k));
- one choice that discovers exactly the next BFS-numbered state, contributing (D(k)) to (D'(k+1)), if (k<n).

After all (nd) edges, (D(n)) is the number of canonical reachable transition graphs. Each of the (nd) edges independently receives one of (m) output symbols, so the complete Mealy model count is:

[
M(n,d,m)=D_{n,d}(n),m^{nd}.
]

For the binary-input/binary-output case ((d=m=2)):

| Reachable states (n) | Canonical transition graphs | Output assignments | Canonical Mealy machines |
|---:|---:|---:|---:|
| 1 | 1 | 4 | 4 |
| 2 | 12 | 16 | 192 |
| 3 | 216 | 64 | 13,824 |
| 4 | 5,248 | 256 | 1,343,488 |
| 5 | 160,675 | 1,024 | **164,531,200** |

Summing exact sizes gives 1,357,508 machines for all reachable sizes 1–4 and **165,888,708** for all reachable sizes 1–5.

A one-bit-per-model membership bitset for all sizes through five would require approximately 19.8 MiB. This is only the version-space membership bound: current-state tracking, transition lookup/unranking, filtering, and query selection need additional memory and computation. No claim is made that a complete learner already fits a particular runtime or memory budget.

## Independent five-state brute-force cross-check

For five states and two ordered input symbols, there are (5^{10}=9,765,625) labelled transition graphs before output assignments. An optimized exhaustive enumeration found 3,856,200 graphs reachable from state 0.

For an accessible deterministic graph with fixed initial state and fixed ordered input symbols, any state relabelling that fixes state 0 and preserves the transition table must also fix every state reached by every input word. Thus the action of relabelling the other four states is free, and each BFS-canonical graph has exactly (4!=24) labelled representations:

[
3,856,200/24=160,675.
]

Multiplying by (2^{10}=1,024) output assignments yields 164,531,200 canonical five-state Mealy machines, exactly matching the recurrence.

Reproduction core used for the independent count:

```cpp
const uint64_t total = 9765625ULL; // 5^10
uint64_t reachable = 0;
for (uint64_t code = 0; code < total; ++code) {
    uint64_t x = code;
    uint8_t next[10];
    for (int edge = 0; edge < 10; ++edge) {
        next[edge] = x % 5;
        x /= 5;
    }
    uint8_t seen = 1, queue[5] = {0};
    int head = 0, tail = 1;
    while (head < tail) {
        int state = queue[head++];
        for (int symbol = 0; symbol < 2; ++symbol) {
            int target = next[state * 2 + symbol];
            if (!(seen & (1u << target))) {
                seen |= 1u << target;
                queue[tail++] = target;
            }
        }
    }
    if (seen == 31) ++reachable;
}
```

Observed result: `reachable=3856200`, `canonical=160675`, `canonical_mealy_models=164531200`.

## Implications for the current learner

The existing four-state implementation enumerates all (2^{24}=16,777,216) labelled four-state tables, including tables with unreachable states. A canonical reachable enumeration would instead contain 1,357,508 machines across exact sizes 1–4. This is a substantial reduction in the hypothesis count, but does not automatically imply a faster implementation: canonical generation, current-state storage, and transition lookup must be measured.

A five-state canonical search has 164,531,200 models at exactly five reachable states; including exact sizes 1–4 gives 165,888,708 models. A theoretical one-bit active-membership bitmap would use about 19.8 MiB, but it does not store each candidate's current state or provide efficient active iteration. Agent 49's validated active-ID workspace uses 663,554,832 bytes; its sparse block-list representation packs local IDs and state into one byte per candidate plus nonempty-block metadata, reducing candidate storage to 186,624,800 bytes (3.56× smaller) at roughly 1.11× learner runtime. See the follow-on report for measured details.

## Limits

This is a count of a specific finite model class, not by itself an attack result. Agent 14 did not implement a learner from this count; Agent 49 subsequently implemented and validated a five-state canonical learner, summarized in [sco-five-state-step-only-2026-11-23.md](sco-five-state-step-only-2026-11-23.md). The state bound remains a trusted premise. No finite oracle transcript can certify equivalence for arbitrary unbounded finite-state machines: after any finite transcript, a larger machine can reproduce the observed prefix and diverge on a later continuation. The four-state learner should remain described as a conditional continuation certificate under its declared bound. The five-state count only informs the feasibility of a larger bounded search.

This belongs in `im-results/`; it does not establish a general SCO security conclusion or change RELEASE-BLOCKED.

## Follow-on implementation and validation

Agent 49 implemented the five-state canonical no-reset learner using the same BFS model-space recurrence. The canonical generator uniqueness/reachability and exhaustive four-state-set checks passed on both OSes in [run 45105822873](https://github.com/FlareZ123/obfs/actions/runs/45105822873). The subsequent full manual SCO workflow [45106569967](https://github.com/FlareZ123/obfs/actions/runs/45106569967) passed on both OSes with the sparse block-list benchmark and five-state authenticated HTTP matched control. A later full SCO typecheck [45107656016](https://github.com/FlareZ123/obfs/actions/runs/45107656016) also passed with Agent 14's parameterized block-size sweep.

The follow-on report records three offline fixtures (random minimal five-state, delayed-output five-state, and padded four-state) certified in 31, 49, and 31 queries respectively. All 384 held-out traces matched. The initial active-ID implementation used a 663,554,832-byte candidate array; the later sparse block-list implementation reduced this to 186,624,800 bytes with about 11% aggregate runtime overhead. The live five-state authenticated HTTP matched-control experiment also passed. These are attacker-side measurements under a deterministic binary stationary fixed-initial-state model, not evidence that an arbitrary real SCO service is bounded by five states, nor a target-side 2.5× runtime result. See the linked follow-on report for the full methodology and limitations.
