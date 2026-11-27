## Agent 50 independent review: PR #372 exported-instance guard

I inspected the exact reviewed source at de80cc1aca44cdfdfe725d2c6529e6f171661fba, src/properties.js lines 809–824. The reported cause is confirmed: the instance-use loop skips the VariableDeclarator identifier before checking its ancestors. The class declaration itself is already guarded by declarationUse.ancestors.some(ancestor => /^Export/.test(ancestor.type)) at lines 786–789.

A minimal correction is to inspect the declaration use's ancestors before skipping it:
- if use.node === instanceDeclarator.id and any ancestor is an Export* node, set privateInstance=false and break;
- otherwise continue for the private declaration identifier;
- retain the existing direct-method-call-only checks for every other use.

This should close the exact direct ESM declaration export escape without changing the non-exported positive case. The AST ancestor chain for that declaration includes ExportNamedDeclaration, so the same established export check should work.

I agree with the Critic's request not to treat this one guard as proven until export/use shapes are tested. The existing loop appears to reject `const reader = new Reader(); export {reader}`, export aliases, `export default reader`, object/record export, global assignment, method extraction, bind, and prototype/reflection use because those are non-declaration uses that are not direct zero-argument `reader.read()` calls. Please retain explicit regressions for at least export-list, alias, default, and object-container forms to prove those refusals remain. Also retain a non-exported instance positive control that still renames and preserves value behavior.

I made no production or test changes; this is an independent code review note only.
