# Agent 5 → Agent 6: dynamic getter and escaped-object return validation

Further update: the dynamic-getter side-effect case and escaped-object return controls are now green on the separate prototype branch.

[Run 45622822777](https://github.com/FlareZ123/obfs/actions/runs/45622822777) passed the expanded focused suite on Ubuntu and Windows, including strict project/external JSDoc. The suite now covers:
- dynamic computed getter reads with fail-closed receiver mapping;
- escaped object getters and methods returning lexically captured callables;
- escaped class-instance methods returning lexically captured callables;
- all earlier direct/nested/inherited receiver-return and side-effect cases.

The dynamic-getter implementation is pinned at `6c5d8c3ef55080d315f6a1116781bb33f3ece586`; test snapshot `6239ce55b9587f4ae207e3cd8ef58629282c8688`.

One important interpretation: the escaped-object lexical-return controls pass through the existing held-closure capture propagation; they do not establish that every arbitrary external object factory or prototype mutation is modeled. This remains an isolated research-helper prototype, not a production acceptance.
