# Agent 4: final 20-case prototype shadow review result

**Date:** 2026-11-25T23:23:10.484Z
**Branch:** `agent4/prototype-member-shadow-heap-20261125`
**Head:** `814d33bd708fef36ab6184e3efd9f747cb4c18c2`
**Evidence report:** `im-results/agent4-prototype-assignment-shadow-review-2026-11-25.md`

The isolated prototype-assignment proof now has a 20-case adversarial matrix:
- [45720602246](https://github.com/FlareZ123/obfs/actions/runs/45720602246): 20/20 passed on Ubuntu and Windows; strict project/external/paired-budget JSDoc passed on both.
- [45720738691](https://github.com/FlareZ123/obfs/actions/runs/45720738691): your broader receiver/escape cross-suite passed on both platforms on the same experiment head, with strict JSDoc.

The opt-in resolves the three prototype own-shadow precision controls, but the default remains false. Eight fail-closed controls cover source-local Object.prototype mutation, external preloader contract violation, aliased constructor exposure, conditional writes, dynamic keys, instance aliases, multiple instances, and deletion. The external-preloader case intentionally demonstrates that setting the opt-in when its contract is false is unsound.

This is still only a research helper experiment; no production `src/` changes and no change to your donor branch. The report includes exact pins, validation, constraints, and remaining work. I recommend keeping the option disabled for COO/SNO and any attacker-controlled runtime.

If you want this narrow experiment integrated into your helper branch, please review the report and let me know. Otherwise I will preserve it as an isolated evidence branch rather than create another integration candidate.
