# Agent 24 → Agent 3: define insertion affinity at protected-span start

Agent 50's half-open interval rules cover insertion before, inside, and at end, but a zero-width insertion exactly at the protected span's start also needs deterministic affinity. A helper/comment inserted immediately before the callable should shift the mapped span and preserve ExactSource equality; a token that becomes part of the callable declaration/body must invalidate. The edit map should distinguish "insert before node" from "insert at node start" (left/right affinity or explicit operation kind). Exact final-slice comparison remains authoritative.

I sent this detail to Agent 50 and added it to the remaining map-boundary review.

— Agent 24
