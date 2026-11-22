'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {{label:string,prelude:string,body:string}} EffectCase */

/** @type {EffectCase[]} */
const effects=[
  {label:"pure-local-control",prelude:"",body:"const external=1;"},
  {label:"explicit-native-call",prelude:"const native=Array.isArray;Array.isArray=function patched(value){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return native(value);};",body:"const external=Array.isArray([1])?1:0;"},
  {label:"global-member-getter",prelude:"Object.defineProperty(globalThis,\"hostNumber\",{configurable:true,get:function observed(){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return 1;}});",body:"const external=globalThis.hostNumber;"},
  {label:"bare-global-getter",prelude:"Object.defineProperty(globalThis,\"hostNumber\",{configurable:true,get:function observed(){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return 1;}});",body:"const external=hostNumber;"},
  {label:"proxy-get-trap",prelude:"globalThis.hostObject=new Proxy({value:1},{get:function observed(t,k,r){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return Reflect.get(t,k,r);}});",body:"const external=globalThis.hostObject.value;"},
  {label:"implicit-toprimitive",prelude:"globalThis.hostObject={[Symbol.toPrimitive]:function observed(){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return 1;}};",body:"const external=+globalThis.hostObject;"},
  {label:"proxy-has-trap",prelude:"globalThis.hostObject=new Proxy({present:true},{has:function observed(t,k){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return Reflect.has(t,k);}});",body:"const external=('present' in globalThis.hostObject)?1:0;"},
  {label:"implicit-iterator",prelude:"globalThis.hostObject={[Symbol.iterator]:function observed(){const c=arguments.callee.caller;if(c&&c.name===\"privateWorker\")globalThis.observedSource=Function.prototype.toString.call(c);return [1][Symbol.iterator]();}};",body:"let external=0;for(const item of globalThis.hostObject){external=item;break;}"}
];

/** @param {string} body @returns {string} */
function sourceFor(body) {
  return [
    'const otherOwner={otherField:3};',
    'const bonus=otherOwner.otherField;',
    'function privateWorker(){',
    '  const owner={secretField:17};',
    '  const value=owner.secretField;',
    '  '+body,
    '  return value+bonus+external;',
    '}',
    'module.exports=privateWorker();'
  ].join('\n');
}

/**
 * Every observed host hook forwards or returns the ordinary expected result.
 * The emitted program should preserve both semantic output and the text seen
 * through the actual sloppy call chain when the host can see its caller.
 * @param {EffectCase} effect
 * @param {string} code
 * @returns {{value:number,source:string}}
 */
function execute(effect,code) {
  /** @type {{module:{exports:unknown},observedSource?:string}} */
  const realm={module:{exports:null}};
  vm.runInNewContext(effect.prelude+'\n'+code,realm,{timeout:3000});
  return {
    value:/** @type {number} */ (realm.module.exports),
    source:realm.observedSource??''
  };
}

for(const effect of effects) {
  test(effect.label+' native host trace is well formed',()=>{
    const result=execute(effect,sourceFor(effect.body));
    assert.equal(result.value,21,effect.label);
    if(effect.label==='pure-local-control')assert.equal(result.source,'');
    else assert.ok(result.source.includes('secretField')||!result.source,
      effect.label+' capture should be either absent or the exact worker source');
  });

  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    test(mode+' '+effect.label+' source parity and independent private yield',()=>{
      const source=sourceFor(effect.body);
      const baseline=execute(effect,source);
      const output=obfuscateFiles([{path:'effects.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'host-source-effect-grid/'+effect.label+'/'+mode,
        closedWorld:true,strings:false,identifiers:false,properties:true
      }).files[0];
      const transformed=execute(effect,String(output.code));
      assert.equal(transformed.value,baseline.value,'ordinary result must be stable');
      console.log('HOST_SOURCE_EFFECT '+JSON.stringify({
        effect:effect.label,mode,
        properties:output.metrics.properties,baselineObserved:baseline.source.length>0,
        emittedObserved:transformed.source.length>0,
        sourceEqual:transformed.source===baseline.source,
        nativeResult:baseline.value,emittedResult:transformed.value
      }));
      if(baseline.source)assert.equal(transformed.source,baseline.source,
        'The host observed a changed sloppy caller function body');
      assert.ok(output.metrics.properties>=1,
        'Independent private own record should retain at least one rewrite');
    });
  }
}
