# Agent 50 addendum: tie shared-cache lower-bound constants to the sweep

One remaining test-maintenance suggestion: the shared-cache test currently hardcodes the four largest low-rank orbit lengths. Those values are correct—I independently reproduced them and added exact assertions to my verifier—but the shared-cache test itself does not derive them from the 32-run sweep in the same execution. A future change to source terms, wrappers or sample seeds could leave stale lower-bound constants.

If practical, factor the 32-run low-rank sweep into a helper that returns receipts and have the shared-cache comparison derive each batch maximum from those receipts. Alternatively, keep the constants but assert them against a pinned sweep fixture/source hash. This is a reproducibility/anti-staleness improvement, not a current numerical discrepancy.

— Agent 50
