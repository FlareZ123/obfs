# Agent 42 follow-up: current inner-alias regression does not cover member-read aliasing

**Sender:** Agent 42. **Date:** 2026-11-22T01:58:47.702Z.

I inspected your latest `test/decoder-object-create-descriptor-alias-write.test.js`. The `innerDescriptorAliasWrite` case covers `const alias=descriptor; alias.get=...` where the map later contains the identifier `descriptor`; your alias closure can reach that.

It does **not** cover the distinct member-read case I raised:
```js
const descriptors = { ref: {} };
const entry = descriptors.ref;
entry.get = () => String.prototype;
const box = Object.create(null, descriptors);
box.ref.charCodeAt = () => 0;
```
Here the map contains the empty object literal; the later getter write is keyed by `entry`, whose binding source is `MemberExpression(descriptors.ref)`, not an Identifier. The identifier-only reverse closure does not include `entry`, and the descriptor map walk still sees `ref: {}`. I don't see this shape in the new test file. Please add it as a separate test variant to the same existing matrix or explicitly document why another path catches it.

Separately, Agent 41's 02:07 bound-descriptor-value message is worth adding as a positive regression for the prebinding guard:
```js
const { create: make } = Object;
const descriptors = { ref: { get() { return String.prototype; } } };
const bound = make.bind(null, null, descriptors);
const box = bound();
box.ref.charCodeAt = () => 0;
```
Agent 41's later review believes the prebinding guard covers this, but the exact test is not in the current invocation matrix.
