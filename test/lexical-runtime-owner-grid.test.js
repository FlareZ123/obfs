'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/**
 * Deterministic native Node/CommonJS differential for local-vs-ambient
 * lexical-root classification. This is a small runtime cross-check of a
 * read-only Stage 1 research prototype, not a full compiler acceptance gate.
 *
 * @typedef {(code:string)=>string} Wrapper
 */

const declarations=[
  'let window="local";',
  'const window="local";',
  'var window="local";',
  '{let window="local";}',
  '{var window="local";}',
  '{const window="local";}',
  'if(true){let window="local";}',
  'if(true){var window="local";}',
  'try{throw "local";}catch(window){}',
  'for(let window of ["local"]){}',
  'for(var window of ["local"]){}',
  'switch(1){case 1:let window="local";break;}',
  'switch(1){case 1:var window="local";break;}',
  'const {window}={window:"local"};',
  'const [window]=["local"];',
  'const window=undefined;',
  'function window(){return "local";}',
  '{function window(){return "local";}}',
  'class window {}',
  'const window=class window {};'
];

/** @type {Wrapper[]} */
const wrappers=[
  code=>code,
  code=>'{'+code+'}',
  code=>'if(true){'+code+'}',
  code=>'try{'+code+'}finally{}',
  code=>'(()=>{'+code+'})();',
  code=>'function nested(){'+code+'}nested();',
  code=>'{function nested(){'+code+'}nested();}'
];

const marker='return window; /*TARGET*/';

/** @param {string} declaration @param {Wrapper} wrap @returns {string[]} */
function programs(declaration,wrap){
  return [
    wrap(declaration)+marker,
    wrap(declaration)+'return (()=>{'+marker+'})();',
    'return (()=>{'+wrap(declaration)+marker+'})();',
    '{'+wrap(declaration)+'}'+marker
  ];
}

test('560 native Node lexical-root observations preserve Stage 1 local/host distinction',{
  timeout:30000
},()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  const sentinel='native-runtime-host-window';
  let examined=0,knownLocals=0,knownHosts=0,conservativeUnknowns=0;
  try{
    Object.defineProperty(globalThis,'window',{value:sentinel,writable:true,enumerable:true,configurable:true});
    for(const declaration of declarations)for(const wrap of wrappers)for(const body of programs(declaration,wrap)){
      const source='function probe(){'+body+'}';
      const markerIndex=source.indexOf(marker);
      assert.ok(markerIndex>=0);
      const targetStart=markerIndex+'return '.length;
      const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});
      const result=resolveLexicalReferences(ast,'commonjs').at(targetStart);
      assert.ok(result&&result.name==='window',source);
      const native=new Function(source+';return probe();')();
      examined++;
      if(result.resolution.kind==='local'){
        knownLocals++;
        assert.notEqual(native,sentinel,source);
      } else if(result.resolution.kind==='free-host-candidate'){
        knownHosts++;
        assert.equal(native,sentinel,source);
      } else {
        conservativeUnknowns++;
      }
    }
  }finally{
    if(previous)Object.defineProperty(globalThis,'window',previous);
    else delete /** @type {any} */(globalThis).window;
  }
  assert.equal(examined,560);
  assert.ok(knownLocals>100,'non-vacuous owned-name classification');
  assert.ok(knownHosts>100,'non-vacuous external-host classification');
  assert.ok(conservativeUnknowns>=0);
  console.log('LEXICAL_ROOT_NATIVE_GRID '+JSON.stringify({
    examined,knownLocals,knownHosts,conservativeUnknowns,contradictions:0
  }));
});
