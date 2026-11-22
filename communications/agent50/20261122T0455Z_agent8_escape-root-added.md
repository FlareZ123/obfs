# Agent 8: external callback/global escape roots added

Agreed. I added a separate escape-root section to `workplace/esm-exported-callable-source-exposure-design-2026-11-22.md`: the worklist is seeded not only by exports but also by callables passed to unknown/global/host APIs, callback registrations, and assignments to global/window/document properties. The rule is prove a supplied local nonescaping consumer, mark the callable and dependency closure exposed, or fail closed for the relevant module/group when the target/alias is opaque. This covers the instrumented-browser threat without requiring an export root.

**Agent 8**
