'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const acorn=require('acorn');
const {resolveLexicalReferences}=
  require('../workplace/agent1-lexical-reference-resolver');

/**
 * Compare read/write reference roles against actual calls to unqualified
 * global-property getters and setters in an isolated native Node VM context.
 * Every fixture is an ordinary sloppy classic script. The VM is a measurement
 * environment, not an attacker-resistant execution environment.
 *
 * @typedef {{label:string,code:string,roles:string[],events:string[]}} EffectCase
 */

/** @type {EffectCase[]} */
const fixtures=[
  {label:'direct assignment',code:'window=1;',
    roles:['window:write'],events:['window:set']},
  {label:'compound assignment',code:'window+=1;',
    roles:['window:read-write'],events:['window:get','window:set']},
  {label:'update expression',code:'++window;',
    roles:['window:read-write'],events:['window:get','window:set']},
  {label:'member receiver assignment',code:'window.value=1;',
    roles:['window:read'],events:['window:get']},
  {label:'member receiver compound assignment',code:'window.value+=1;',
    roles:['window:read'],events:['window:get']},
  {label:'computed member receiver assignment',code:'window[target]=1;',
    roles:['window:read','target:computed-key'],
    events:['window:get','target:get']},
  {label:'destructuring default evaluation',code:'({field:target=window}=item);',
    roles:['target:write','window:read'],
    events:['window:get','target:set']},
  {label:'destructuring member receiver',code:'({field:window.value}=item);',
    roles:['window:read'],events:['window:get']},
  {label:'destructuring computed-member key',code:'({[window.value]:target}=item);',
    roles:['window:read','target:write'],events:['window:get','target:set']},
  {label:'destructuring computed-call key',code:'({[fn(window)]:target}=item);',
    roles:['window:read','target:write'],events:['window:get','target:set']},
  {label:'computed identifier property key',code:'({[window]:target}=item);',
    roles:['window:computed-key','target:write'],
    events:['window:get','target:set']},
  {label:'for-of member receiver',code:'for(window.value of items){}',
    roles:['window:read'],events:['window:get','window:get']},
  {label:'for-of default expression',code:'for({field:target=window} of items){}',
    roles:['target:write','window:read'],
    events:['window:get','target:set','window:get','target:set']},
  {label:'nested assignment in default',code:'({field:target=(window=3)}=item);',
    roles:['target:write','window:write'],
    events:['window:set','target:set']},
  {label:'nested compound assignment in default',code:'({field:target=(window+=1)}=item);',
    roles:['target:write','window:read-write'],
    events:['window:get','window:set','target:set']},
  {label:'nested update in default',code:'({field:target=++window}=item);',
    roles:['target:write','window:read-write'],
    events:['window:get','window:set','target:set']}
];

/**
 * @param {string} source
 * @returns {string[]}
 */
function nativeEvents(source){
  /** @type {string[]} */
  const events=[];
  /** @type {Record<string,unknown>} */
  const global={
    item:{field:undefined},
    items:[{field:undefined},{field:undefined}],
    fn:()=> 'field'
  };
  const receiver={
    value:1,
    [Symbol.toPrimitive]:()=> 'field'
  };
  Object.defineProperty(global,'window',{
    configurable:true,
    get(){events.push('window:get');return receiver;},
    set(){events.push('window:set');}
  });
  Object.defineProperty(global,'target',{
    configurable:true,
    get(){events.push('target:get');return 'field';},
    set(){events.push('target:set');}
  });
  vm.runInNewContext(source,global);
  return events;
}

for(const fixture of fixtures){
  test('native binding effects: '+fixture.label,()=>{
    const ast=acorn.parse(fixture.code,{ecmaVersion:'latest',sourceType:'script'});
    const roles=resolveLexicalReferences(ast,'script').references
      .filter(r=>r.name==='window'||r.name==='target')
      .map(r=>r.name+':'+r.role);
    assert.deepEqual(roles,fixture.roles,'AST role path');
    assert.deepEqual(nativeEvents(fixture.code),fixture.events,'native accessor events');
  });
}
