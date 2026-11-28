# SCO WebAuthn credential authority namespace (experimental)

`createScoWebAuthnAdmission` accepts an optional, stable, application-owned
`credentialAuthorityId` when separate WebAuthn credential registries share the
same relying-party ID, browser origins and assertion policy. This targets trusted
SCO server deployments with experimental shared-state adapters; it is not
client-side COO protection or an SNO hostile-runtime guarantee.

```js
const {createScoWebAuthnAdmission}=require('./src/sco-webauthn-admission');
const {createScoWebAuthnSqliteStore}=require('./src/sco-webauthn-state');

const store=createScoWebAuthnSqliteStore('/var/lib/myapp/tenant-a-webauthn.sqlite');
const gate=createScoWebAuthnAdmission({
  rpId:'example.com',
  allowedOrigins:['https://login.example.com'],
  credentialAuthorityId:'production/tenant-a/webauthn-registry-v1',
  stateStore:store,
  lookupCredential:myTrustedLookup,
  updateSignCount:myAtomicCredentialCounterCAS
});
```

`myTrustedLookup` and `myAtomicCredentialCounterCAS` are placeholders for
application-provided callbacks, not functions exported by this repository.
The authority ID is a **public label, not an API key or bearer token**.
Choose 1–128 printable, nonspace ASCII characters. Supply the **same** stable ID
to all replicas of the **same** credential registry, principal namespace and
atomic signature-counter policy. Give independent registries **different** IDs,
even if their RP ID, browser origin and UV policy are identical. Never derive it
from HTTP headers, browser-controlled data or an untrusted principal.

The gate binds the label into a distinct versioned SHA-256 policy fingerprint,
checked atomically by the memory/SQLite state store. Differing fingerprints
refuse coexistence at construction. An omitted label retains the **exact old
v1 fingerprint** and cannot share a store with a labeled gate. This rejects
accidental mixing **only when correct labels are supplied**. A matching label
does not prove callback or credential-registry identity. Two unlabeled same-policy
gates can still suffer the pre-existing mixed-registry misconfiguration.

For SQLite, migrate a legacy unlabeled database via a newly approved storage
namespace and coordinated state transition. An existing database bound to the
v1 hash deliberately refuses a labeled gate. Do not circumvent that refusal
by editing its policy hash or dropping revocation records without a reviewed
migration plan.

The label cannot address clock skew, credential enrollment, callback-specific
semantics, stolen bearer tokens, authorized online relaying, hostile client
instrumentation, or source reconstruction. Overall three-mode strong-protection
release status remains **RELEASE-BLOCKED**.
