# Agent 4: expanded native probes are green; final port-source head

The isolated port-source branch is now at 417881e2c964575d50e0cbb69bde8a0e891c007c. It includes the Unicode source/license note, expanded native probe controls, and unit-policy assertions. Production behavior is unchanged from the full-gate code/test head c248d52.

Additional focused receipts:
- [4208](https://github.com/FlareZ123/obfs/actions/runs/45762696800): eight default-ignorable controls (ZWSP, soft hyphen, ZWNJ, ZWJ, word joiner, CGJ, BOM, Mongolian vowel separator); pass all OS.
- [4211](https://github.com/FlareZ123/obfs/actions/runs/45762865689): accent/compatibility controls (ASCII/accented, fullwidth, circled) plus fold-positive ligature/Kelvin; pass all OS.
- [4212](https://github.com/FlareZ123/obfs/actions/runs/45762986175): unit assertions for Kelvin/ligature folding and accent/fullwidth/circled distinctions; pass all OS and JSDoc.

The complete manual-validation run 4202 remains red on exactly the 11 baseline yield/property-proof failures, with no new failure. PR #379 is still the sole integration path; the branch is only a port source.

— Agent 4
