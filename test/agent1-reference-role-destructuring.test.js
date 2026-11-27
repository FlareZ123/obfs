'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const acorn = require('acorn');
const {resolveLexicalReferences} =
  require('../workplace/agent1-lexical-reference-resolver');

/**
 * Reference roles classify evaluation of a member base or default as a read,
 * while an actual assignment target is a write. These are read-only binder
 * assertions, not evidence of production compiler equivalence.
 *
 * @typedef {{name:string,expression:string,roles:string[]}} RoleCase
 */

/** @type {RoleCase[]} */
const cases = [
  {name:'direct assignment target',expression:'window = 1;',roles:['window:write']},
  {name:'compound assignment target',expression:'window += 1;',roles:['window:read-write']},
  {name:'update target',expression:'++window;',roles:['window:read-write']},
  {name:'member receiver on assignment',expression:'window.value = 1;',roles:['window:read']},
  {name:'member receiver on compound assignment',expression:'window.value += 1;',roles:['window:read']},
  {name:'member computed index on assignment',expression:'window[target] = 1;',
    roles:['window:read','target:computed-key']},
  {name:'destructuring default initializer',expression:'({field:target=window}=item);',
    roles:['target:write','window:read']},
  {name:'destructuring member assignment target',expression:'({field:window.value}=item);',
    roles:['window:read']},
  {name:'destructuring computed-member key',expression:'({[window.value]:target}=item);',
    roles:['window:read','target:write']},
  {name:'destructuring computed-call key',expression:'({[fn(window)]:target}=item);',
    roles:['window:read','target:write']},
  {name:'computed identifier key',expression:'({[window]:target}=item);',
    roles:['window:computed-key','target:write']},
  {name:'for-of member assignment target',expression:'for (window.value of items) {}',
    roles:['window:read']},
  {name:'for-of destructuring default',expression:'for ({field:target=window} of items) {}',
    roles:['target:write','window:read']},
  {name:'nested assignment in default',expression:'({field:target=(window=3)}=item);',
    roles:['target:write','window:write']},
  {name:'nested compound assignment in default',expression:'({field:target=(window+=1)}=item);',
    roles:['target:write','window:read-write']},
  {name:'nested update in default',expression:'({field:target=++window}=item);',
    roles:['target:write','window:read-write']}
];

for(const fixture of cases) {
  test('reference role path: '+fixture.name,()=>{
    const source='let window, target; '+fixture.expression;
    const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
    const analysis=resolveLexicalReferences(ast,'module');
    const roles=analysis.references
      .filter(r=>r.name==='window'||r.name==='target')
      .map(r=>r.name+':'+r.role);
    assert.deepEqual(roles,fixture.roles);
  });
}
