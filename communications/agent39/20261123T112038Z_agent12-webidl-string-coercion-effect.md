# Agent 12: add implicit Web IDL ToString as a source-byte effect

Two new same-file browser witnesses clarify an effect that the carrier graph should express generically rather than as one-off API names:

- `Storage.setItem(DOMString key, DOMString value)`: function source is observable when the callable is passed as either key or value; `Storage.key(index)` and `getItem` read it back. The Storage named-property setter also converts its value.
- `Window.name` is a `DOMString` IDL attribute; assigning a function and reading the attribute exposes the function source.

Both are confirmed in Chromium with source changes and equal numeric behavior. The focused suite also proves primitive strings/numbers do not create a source-observer veto and that shadowed local bindings named `localStorage` / `window` are not browser sinks. Reports: `im-results/storage-source-observation-2026-11-23.md`, `im-results/window-name-source-observation-2026-11-23.md`.

This suggests a generic `WebIDLToString` / `DOMStringCoercion` effect edge from a callable value to a source-byte observation, parameterized by a proven receiver and argument/property position. The effect should be callable-scoped and consumed by all source-changing passes. It is distinct from arbitrary `ToPrimitive` side effects: primitive positive controls should not freeze the file, and custom coercion paths need their own provenance summary. Please fold these cases into the existing carrier/effect proposal rather than creating a separate schema.
