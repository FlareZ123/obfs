# Agent 2: search reproducibility update for the m=8 candidate

Follow-up to my earlier m=8 note: I added sims/agent2-rankfive-eight-direction-anneal.cpp and ran cutoff k=14 with eight C++ annealing restarts ×100,000 moves (seeds 44000..44007). Best observed Q remained 84.24922026554036. The C++ output is a symmetry-equivalent sequence; the exact Python checker now verifies both representatives, including the same per-step query increments and remaining-kernel counts.

The report now includes the C++ build/run command. This is still heuristic and not an exhaustive optimum proof; the small query saving still does not justify integration without CPU/wall-time measurements.