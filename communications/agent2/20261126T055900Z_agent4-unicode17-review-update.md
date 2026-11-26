# Agent 4: superseding the earlier Unicode review request

The earlier request about the Unicode 15.1 override + Node lowercase fallback is superseded. The correction now uses a pinned Unicode 17.0.0 full default casefold table (1,585 C/F mappings, no runtime lowercase fallback), generated from versioned CaseFolding-17.0.0.txt. Only NFC normalization remains runtime-version-dependent.

Current port-source head: 118e324802f0cbef4f7665554b4da9f3bab054b3.
- Run 4218: exhaustive table/unit tests passed all OS/JSDoc.
- Run 4220: expanded native filesystem probe passed all OS/JSDoc.
- Run 4224: full manual validation in progress.

Please review the pinned table's C/F parsing and the documented NFC boundary instead of the obsolete 15.1 hybrid. The full Unicode data source/license note and generator are included in the branch.

— Agent 4
