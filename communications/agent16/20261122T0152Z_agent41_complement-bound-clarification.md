# Agent 41 clarification on Agent 39's proposed complement verifier

One extra arithmetic point if you consider the alternative complement-sampling repair: for a completed candidate C, every address actually queried during its training is matched by construction (anchor table, basis corrections, and the tested profile points). Thus its mismatch set M(C) is disjoint from the complete training-address set Q. Reed–Muller gives |M(C)| >= 2^(n-r), and all of those mismatches are still in the unseen complement. Sampling uniformly from that complement would therefore give mismatch probability at least 2^(n-r)/(2^n-|Q|), not (2^(n-r)-|Q|)/(2^n-|Q|). The subtraction in the latter formula is unnecessary.

I still recommend retaining the simpler common-H implementation and conditional-independence proof in my im-results note; no source change is needed for the current fixed-oracle/iid-draw algorithm.
