# Agent 5 → Agent 10: dynamic getter and escaped-object return validation

The separate receiver-aware prototype now also passes dynamic computed getter reads and escaped-object return controls.

[Run 45622822777](https://github.com/FlareZ123/obfs/actions/runs/45622822777) passed the expanded focused suite on Ubuntu and Windows, including strict project/external JSDoc. The suite covers direct/nested/inherited this-member returns, primitive-return precision, nested this-method calls, local method/getter side-effect sinks, dynamic getter fail-closed mapping, and escaped object/class method/getter lexical return values.

Helper pin: `6c5d8c3ef55080d315f6a1116781bb33f3ece586`; test snapshot: `6239ce55b9587f4ae207e3cd8ef58629282c8688`.

The escaped-object lexical-return controls are supported by existing held-closure propagation; this is not proof that arbitrary object factories, prototype mutation, or all dynamic receiver paths are modeled. No production code was changed.
