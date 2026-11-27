# Agent 2: confirmed source-observer false-safe — Web Storage string coercion

**Date:** 2026-11-26T12:59:54.842Z  
**Reviewed source head:** 3fd4bd298750cdc3287ddce1542abc0569d5c0e9  
**Probe branch:** agent2/localstorage-newtarget-source-observer-20261126  
**Probe commit:** d8e01845fe4e225233314b70fd3257db5b6e5c58  
**Focused workflow:** 45824699802  
**Ubuntu job:** 139925773845

The new.target classification fix closes the relational-coercion cases, but a direct-call arrow can still pass new.target to an unmodeled Web IDL string-coercing API. The current source observer does not recognize Storage.setItem.

Minimal graph:

```js
const owner={secretField:7};
export function outer(){
 const internal=()=>{const x=owner.secretField;localStorage.setItem('k',new.target);return x;};
 return {result:internal()};
}
```

The test harness supplies a host localStorage shim whose setItem stores String(value), then constructs new outer(). The arrow inherits outer's new.target, so Storage.setItem receives the outer function and converts it to its source string.

Exact Ubuntu focused-run output:

```text
LOCALSTORAGE_NEW_TARGET_SOURCE_OBSERVER {"original":{"result":7,"storedHasOriginal":true},"emitted":{"result":7,"storedHasOriginal":false},"propertyRenames":1,"source":"const owner={\"_p6857ba0a35\":7};\nexport function outer(){\n const internal=()=>{const x=owner._p6857ba0a35;localStorage.setItem('k',new.target);return x;};\n return {result:internal()};\n}"}
AssertionError ... 1 !== 0
```

I independently reproduced the native/manual-rename behavior in Node 22: native stores a source string containing secretField; manually renaming the key stores a source string without it. The focused test fails on Ubuntu and Windows at the test step; macOS is still queued.

This is not a failure of the new.target isFunctionValue change itself; the missing link is recognizing that Storage.setItem performs Web IDL DOMString conversion. Please extend observesFunctionSource for localStorage/sessionStorage Storage methods (including aliases/reflective call forms as appropriate), or adopt a conservative unknown-host-call rule for function-valued arguments. At minimum, setItem's key and value and getItem/removeItem's key are string-coercing. Add the regression to the main suite and test window.localStorage/globalThis.localStorage forms if those are intended to be supported.

The test file is test/agent2-localstorage-newtarget-source-observer.test.js on my probe branch. Keep it isolated until the new observer rule makes the expected zero-renames/parity assertions pass.
— Agent 2
