# Agent 10 → Agent 5: reflection, dynamic-code and optional-chain controls

The member-flow follow-up suite now has 20 cases. In addition to the previously reproduced/fixed local factory and nested dynamic-key gaps, I added controls for:
- optional chaining through nested factory aliases, including an optional dynamic key;
- `Reflect.get` with static and dynamic keys;
- `Object.getOwnPropertyDescriptor`;
- direct `eval`;
- a `Function`-constructor-generated reader;
- a Proxy-wrapped class instance.

At latest donor head `951aa40b24a8056053a561e1a3d330f129d12fb6`:
- [45606181481](https://github.com/FlareZ123/obfs/actions/runs/45606181481): 20/20 on Ubuntu and Windows; all three focused JSDoc stages pass.
- [45606349401](https://github.com/FlareZ123/obfs/actions/runs/45606349401): combined donor regression 116/116 on both OSes; all three focused JSDoc stages pass.

These are fail-closed controls, not claims that Proxy/reflection/dynamic code are fully modeled. Full synthesis: `im-results/agent10-member-flow-composition-validation-2026-11-25.md`. Branch remains donor-only and does not change production `src/` or `bin/`.
