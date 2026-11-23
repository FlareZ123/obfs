'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{value:number,source:string,privateValue:number}} Observation */

/** @type {Input[]} */
const inputs = [
  {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
  {path:'state.mjs',sourceType:'module',code:[
    "import {owner} from './owner.mjs';",
    'class Reader {read(){return owner.secretField;}}',
    'export const instance=new Reader();'
  ].join('\n')},
  {path:'private.mjs',sourceType:'module',code:[
    'const hidden={privateField:13};',
    'function readPrivate(){return hidden.privateField;}',
    'export const privateValue=readPrivate();'
  ].join('\n')}
];

const consumer = [
  "import {instance} from './state.mjs';",
  "import {privateValue} from './private.mjs';",
  'const source=Object.getPrototypeOf(instance).read.toString();',
  'console.log(JSON.stringify({value:instance.read(),source,privateValue}));'
].join('\n');

/**
 * The consumer is deliberately outside the protected input graph.
 * @param {string} directory
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<Observation>}
 */
async function observe(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)
    await atomicWrite(path.join(directory,file.path),file.code);
  if(!files.some(file=>file.path==='consumer.mjs'))
    await atomicWrite(path.join(directory,'consumer.mjs'),consumer);
  const executed=spawnSync(process.execPath,[path.join(directory,'consumer.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(executed.error)throw executed.error;
  assert.equal(executed.status,0,executed.stderr);
  return /** @type {Observation} */ (JSON.parse(executed.stdout));
}

test('undeclared external inspector: value parity without source-closure premise',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-instance-contract-'));
  try {
    const native=await observe(path.join(directory,'native'),inputs);
    assert.deepEqual(native,{
      value:7,source:'read(){return owner.secretField;}',privateValue:13
    });
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const output=obfuscateFiles(inputs,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'external-instance-method/'+mode
        });
        const transformed=await observe(path.join(directory,mode),output.files);
        const renamed=output.crossFile.properties+
          output.files.reduce((sum,file)=>sum+file.metrics.properties,0);
        t.diagnostic(mode+' property rewrites: '+renamed);
        assert.equal(transformed.value,native.value);
        assert.equal(transformed.privateValue,native.privateValue);
        t.diagnostic(mode+' undeclared-inspector source equal: '+
          String(transformed.source===native.source));
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('declared ESM consumer method-source observation stays unchanged',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-declared-instance-'));
  try {
    /** @type {Input[]} */
    const declared=[...inputs,{path:'consumer.mjs',sourceType:'module',code:consumer}];
    const native=await observe(path.join(directory,'native'),declared);
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const built=obfuscateFiles(declared,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'declared-instance-method/'+mode
        });
        const transformed=await observe(path.join(directory,mode),built.files);
        const renamed=built.crossFile.properties+
          built.files.reduce((sum,file)=>sum+file.metrics.properties,0);
        t.diagnostic(mode+' declared-observer graph property rewrites: '+renamed);
        assert.deepEqual(transformed,native);
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('source-observer-free standalone module retains positive private field yield',()=>{
  for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
    const built=obfuscateFiles([inputs[2]],{
      mode,closedWorld:true,properties:true,identifiers:false,
      strings:false,seed:'isolated-private-yield/'+mode
    });
    const rewritten=built.crossFile.properties+
      built.files.reduce((sum,file)=>sum+file.metrics.properties,0);
    assert.ok(rewritten>0,mode+' lost private-field rewrite yield');
  }
});

test('without a closed-world promise, external method-source clients retain source',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-open-instance-'));
  try {
    const native=await observe(path.join(directory,'native'),inputs);
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const built=obfuscateFiles(inputs,{
          mode,closedWorld:false,properties:true,identifiers:false,
          strings:false,seed:'open-graph-external-instance/'+mode
        });
        const actual=await observe(path.join(directory,mode),built.files);
        assert.deepEqual(actual,native,
          mode+' must preserve an unknown consumer method-source contract');
        t.diagnostic(mode+' open-graph rewrites: '+
          (built.crossFile.properties+
            built.files.reduce((sum,file)=>sum+file.metrics.properties,0)));
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('declared ESM prototype method toLocaleString retains exact original source',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-instance-locale-'));
  try {
    const localeConsumer=consumer.replace('.read.toString();','.read.toLocaleString();');
    assert.notEqual(localeConsumer,consumer);
    /** @type {Input[]} */
    const declared=[...inputs,{
      path:'consumer.mjs',sourceType:'module',code:localeConsumer
    }];
    const native=await observe(path.join(directory,'native'),declared);
    assert.deepEqual(native,{
      value:7,source:'read(){return owner.secretField;}',privateValue:13
    });
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const output=obfuscateFiles(declared,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'declared-instance-method-locale/'+mode
        });
        const actual=await observe(path.join(directory,mode),output.files);
        assert.deepEqual(actual,native,
          mode+' must retain native method toLocaleString spelling');
      });
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('proven primitive toLocaleString keeps independent protected field rewrites',async t=>{
  /** @type {Input[]} */
  const safe=[
    {path:'owner.mjs',sourceType:'module',
      code:'export const owner={secretField:7};'},
    {path:'consumer.mjs',sourceType:'module',code:[
      "import {owner} from './owner.mjs';",
      'const nativeNumber=7;',
      'console.log(JSON.stringify({value:owner.secretField,',
      'source:nativeNumber.toLocaleString("en-US"),privateValue:13}));'
    ].join('\n')}
  ];
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-locale-'));
  try{
    const native=await observe(path.join(directory,'native'),safe);
    assert.deepEqual(native,{value:7,source:'7',privateValue:13});
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const built=obfuscateFiles(safe,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'primitive-locale-positive/'+mode
        });
        const actual=await observe(path.join(directory,mode),built.files);
        assert.deepEqual(actual,native);
        const rewrites=built.crossFile.properties+
          built.files.reduce((sum,file)=>sum+file.metrics.properties,0);
        assert.ok(rewrites>0,mode+' must retain proven primitive locale positive');
      });
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('declared dynamic prototype method locale key preserves exact source',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dynamic-locale-'));
  try{
    const dynamicConsumer=consumer.replace(
      'const source=Object.getPrototypeOf(instance).read.toString();',
      'const selector=true?"toLocaleString":"valueOf";'+
      'const source=Object.getPrototypeOf(instance).read[selector]();'
    );
    assert.notEqual(dynamicConsumer,consumer);
    /** @type {Input[]} */
    const declared=[...inputs,{
      path:'consumer.mjs',sourceType:'module',code:dynamicConsumer
    }];
    const native=await observe(path.join(directory,'native'),declared);
    assert.deepEqual(native,{
      value:7,source:'read(){return owner.secretField;}',privateValue:13
    });
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const built=obfuscateFiles(declared,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'dynamic-prototype-locale/'+mode
        });
        const actual=await observe(path.join(directory,mode),built.files);
        assert.deepEqual(actual,native,
          mode+' must preserve a runtime-selected native source method');
      });
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});

for(const [caseName,reader] of /** @type {Array<[string,string]>} */ ([
  ['captured method locale', 
    'const method=Object.getPrototypeOf(instance).read;'+
    'const source=method.toLocaleString();'],
  ['array of captured method locale',
    'const source=[Object.getPrototypeOf(instance).read].toLocaleString();'],
  ['Object prototype locale.call',
    'const source=Object.prototype.toLocaleString.call('+
      'Object.getPrototypeOf(instance).read);'],
  ['String method coercion',
    'const source=String(Object.getPrototypeOf(instance).read);'],
  ['destructured method toString',
    'const fn=Object.getPrototypeOf(instance).read;'+
    'const {toString:readSource}=fn;const source=readSource.call(fn);'],
  ['destructured method toLocaleString',
    'const fn=Object.getPrototypeOf(instance).read;'+
    'const {toLocaleString:readSource}=fn;const source=readSource.call(fn);'],
  ['destructured direct instance method toString',
    'const fn=instance.read;const {toString:readSource}=fn;'+
    'const source=readSource.call(fn);'],
  ['destructured computed instance method toLocaleString',
    'const fn=instance["read"];'+
    'const {toLocaleString:readSource}=fn;const source=readSource.call(fn);'],
  ['identity-forwarded instance method toString',
    'function identity(value){return value;}'+
    'const fn=identity(instance.read);const {toString:readSource}=fn;'+
    'const source=readSource.call(fn);'],
  ['arrow-forwarded instance method toLocaleString',
    'const identity=value=>value;const fn=identity(instance.read);'+
    'const {toLocaleString:readSource}=fn;const source=readSource.call(fn);'],
  ['await-forwarded instance method toString',
    'const fn=await Promise.resolve(instance.read);'+
    'const {toString:readSource}=fn;const source=readSource.call(fn);'],
  ['conditional-selected method toLocaleString',
    'const fn=true?instance.read:()=>99;'+
    'const {toLocaleString:readSource}=fn;const source=readSource.call(fn);']
])) {
  test('declared ESM implicit instance source: '+caseName,async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-instance-native-locale-'));
    try{
      const alternative=consumer.replace(
        'const source=Object.getPrototypeOf(instance).read.toString();',reader
      );
      assert.notEqual(alternative,consumer);
      /** @type {Input[]} */
      const declared=[...inputs,{
        path:'consumer.mjs',sourceType:'module',code:alternative
      }];
      const native=await observe(path.join(directory,'native'),declared);
      assert.equal(native.value,7);
      assert.equal(native.privateValue,13);
      assert.match(native.source,/secretField/u);
      for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
        await t.test(mode,async()=>{
          const built=obfuscateFiles(declared,{
            mode,closedWorld:true,properties:true,identifiers:false,
            strings:false,seed:'instance-source-locale-'+caseName+'/'+mode
          });
          const actual=await observe(path.join(directory,mode),built.files);
          assert.deepEqual(actual,native);
        });
      }
    }finally{
      await fs.rm(directory,{recursive:true,force:true});
    }
  });
}

test('inline inert record toString destructure preserves independent private work',()=>{
  const code="'use strict';const owner={secretField:7};"+
    'const plain={foo:1};const {toString:format}={foo:1};'+
    'module.exports=owner.secretField+format.call(plain).length;';
  const result=obfuscateFiles([{path:'safe.cjs',sourceType:'commonjs',code}],{
    mode:'sno',properties:true,identifiers:false,strings:false,
    closedWorld:true,seed:'inert-plain-record-source-positive'
  });
  const rewrites=result.crossFile.properties+
    result.files.reduce((sum,file)=>sum+file.metrics.properties,0);
  assert.ok(rewrites>0,'Inert record source-method read should retain private rewrite');
});
