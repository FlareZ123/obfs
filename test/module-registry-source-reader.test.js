'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {parse,observesDistributedSource} = require('../src/ast');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs'|'module',code:string}} Source */
/**
 * Execute a real Node 22 CommonJS module graph so the cache, main module,
 * parent and children are genuine native Module instances.
 * @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {string} entry
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files,entry) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-module-registry-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(root,entry)],{
      encoding:'utf8',timeout:20000
    });
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {string} expression
 * @param {boolean} [withChild]
 * @returns {Source[]}
 */
function graph(expression,withChild=false) {
  const source="'use strict';\n"+
    (withChild?"require('./child.cjs');\n":'')+
    'const io='+expression+';\n'+
    'const privateObject={secretField:31};\n'+
    "const bytes=io.readFileSync(__filename,'utf8');\n"+
    "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
  return [
    {path:'main.cjs',sourceType:'commonjs',code:source},
    ...(withChild?[{path:'child.cjs',sourceType:/** @type {const} */('commonjs'),
      code:'module.exports=7;\n'}]:[])
  ];
}

const paths=[
  ['require.cache direct','require.cache[__filename].constructor._load("node:fs")',false],
  ['require.main direct','require.main.constructor._load("node:fs")',false],
  ['process.mainModule direct','process.mainModule.constructor._load("node:fs")',false],
  ['module.children','module.children[0].constructor._load("node:fs")',true],
  ['module alias','(function(){const m=module;return m.children[0].constructor._load("node:fs")})()',true],
  ['reflective require cache','Reflect.get(require,"cache")[__filename].constructor._load("node:fs")',false],
  ['descriptor require cache','Object.getOwnPropertyDescriptor(require,"cache").value[__filename].constructor._load("node:fs")',false],
  ['enumerated module children','Object.getOwnPropertyDescriptors(module).children.value[0].constructor._load("node:fs")',true],
  ['static key alias','(function(){const key="cache";return require[key][__filename].constructor._load("node:fs")})()',false],
  ['global process root','globalThis.process.mainModule.constructor._load("node:fs")',false],
  ['global process bracket','globalThis["process"].mainModule.constructor._load("node:fs")',false],
  ['global process alias','(function(){const p=globalThis.process;return p.mainModule.constructor._load("node:fs")})()',false],
  ['global alias chain','(function(){const root=globalThis;const p=root.process;return p.mainModule.constructor._load("node:fs")})()',false],
  ['global computed alias','(function(){const key="process";const p=globalThis[key];return p.mainModule.constructor._load("node:fs")})()',false],
  ['global computed root','(function(){const key="pro"+"cess";return globalThis[key].mainModule.constructor._load("node:fs")})()',false],
  ['reflected global process','Reflect.get(globalThis,"process").mainModule.constructor._load("node:fs")',false],
  ['descriptor global process','Object.getOwnPropertyDescriptor(globalThis,"process").get.call(globalThis).mainModule.constructor._load("node:fs")',false]
];

for(const [name,expression,withChild] of paths) {
  test('CommonJS registry source reading is byte preserving: '+name,async()=>{
    const source=graph(/** @type {string} */ (expression),
      /** @type {boolean} */ (withChild));
    assert.equal(observesDistributedSource(parse(source[0].code,'commonjs')),true,
      'The source-reader classifier must recognize this loader route');
    const original=await execute(source,'main.cjs');
    assert.equal(original.status,0,original.stderr);
    assert.equal(original.stdout,'31 true\n');
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      const transformed=obfuscateFiles(source,{
        mode,seed:'registry-source/'+name,strings:true,identifiers:true,properties:true
      });
      assert.deepEqual(transformed.files.map(file=>file.code),
        source.map(file=>file.code));
      assert.deepEqual(await execute(transformed.files,'main.cjs'),original);
    }
  });
}

test('module.parent exposes the Node loader from a child CommonJS module',async()=>{
  /** @type {Source[]} */
  const files=[
    {path:'main.cjs',sourceType:'commonjs',
      code:"require('./child.cjs');\n"},
    {path:'child.cjs',sourceType:'commonjs',code:
      "'use strict';\n"+
      "const io=module.parent.constructor._load('node:fs');\n"+
      'const secretObject={secretField:57};\n'+
      "const bytes=io.readFileSync(__filename,'utf8');\n"+
      "console.log(secretObject.secretField,bytes.includes('secret'+'Field'));\n"}
  ];
  const native=await execute(files,'main.cjs');
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'57 true\n');
  assert.equal(observesDistributedSource(parse(files[1].code,'commonjs')),true);
  const output=obfuscateFiles(files,{mode:'sno',seed:'parent-source',
    strings:true,properties:true,identifiers:true});
  assert.deepEqual(output.files.map(file=>file.code),files.map(file=>file.code));
  assert.deepEqual(await execute(output.files,'main.cjs'),native);
});

test('unrelated ordinary CommonJS private property remains transformable',()=>{
  const source=graph('null');
  const clean=[{...source[0],code:
    'const owned={secretField:31};console.log(owned.secretField);'}];
  const output=obfuscateFiles(clean,{mode:'sno',seed:'registry-positive',
    strings:false,properties:true,identifiers:false});
  assert.equal(observesDistributedSource(parse(clean[0].code,'commonjs')),false);
  assert.equal(output.files[0].metrics.properties,1);
  assert.doesNotMatch(String(output.files[0].code),/secretField/u);
});

const internalFsRoutes=[
  ['direct process.binding',"process.binding('fs')"],
  ['global process.binding',"globalThis.process.binding('fs')"],
  ['aliased process.binding',"(function(){const p=process;return p.binding('fs')})()"],
  ['aliased global process binding',"(function(){const root=globalThis;const p=root['pro'+'cess'];return p.binding('fs')})()"],
  ['Reflect.get process binding',"Reflect.get(process,'binding')('fs')"],
  ['Object descriptor process binding',"Object.getOwnPropertyDescriptor(process,'binding').value('fs')"]
];

for(const [name,expression] of internalFsRoutes) {
  test('Node 22 internal filesystem binding preserves source bytes: '+name,async()=>{
    const code="'use strict';\n"+
      'const io='+expression+';\n'+
      'const privateObject={secretField:31};\n'+
      "const bytes=io.readFileUtf8(__filename,0);\n"+
      "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
    /** @type {Source[]} */
    const files=[{path:'main.cjs',sourceType:'commonjs',code}];
    const native=await execute(files,'main.cjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31 true\n');
    assert.equal(observesDistributedSource(parse(code,'commonjs')),true);
    const output=obfuscateFiles(files,{mode:'sno',seed:'node-internal-fs/'+name,
      strings:true,properties:true,identifiers:true});
    assert.equal(output.files[0].code,code);
    assert.deepEqual(await execute(output.files,'main.cjs'),native);
  });
}

test('ordinary process environment reads do not suppress own-field renaming',()=>{
  const code='const privateObject={secretField:31};console.log(privateObject.secretField,globalThis.process.env.NODE_ENV);';
  assert.equal(observesDistributedSource(parse(code,'commonjs')),false);
  const output=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'process-env-positive',strings:false,
    properties:true,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,1);
});

const patternLoaderCases=[
  ['module constructor destructuring',
    "const {constructor:Module}=module;const io=Module._load('node:fs');",
    "io.readFileSync(__filename,'utf8')"],
  ['process main module destructuring',
    "const {mainModule:main}=process;const io=main.constructor._load('node:fs');",
    "io.readFileSync(__filename,'utf8')"],
  ['process internal binding destructuring',
    "const {binding:bindingFs}=process;const io=bindingFs('fs');",
    'io.readFileUtf8(__filename,0)'],
  ['globalThis computed process destructuring',
    "const {['pro'+'cess']:p}=globalThis;const io=p.binding('fs');",
    'io.readFileUtf8(__filename,0)'],
  ['global alias process destructuring',
    "const root=globalThis;const {process:p}=root;const io=p.binding('fs');",
    'io.readFileUtf8(__filename,0)']
];

for(const [name,initial,reader] of patternLoaderCases) {
  test('destructured loader object preserves exact module source: '+name,async()=>{
    const code="'use strict';\n"+initial+'\n'+
      'const privateObject={secretField:31};\n'+
      'const bytes='+reader+';\n'+
      "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
    /** @type {Source[]} */
    const files=[{path:'main.cjs',sourceType:'commonjs',code}];
    const native=await execute(files,'main.cjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31 true\n');
    assert.equal(observesDistributedSource(parse(code,'commonjs')),true);
    const output=obfuscateFiles(files,{mode:'sno',seed:'pattern-loader/'+name,
      strings:true,properties:true,identifiers:true});
    assert.equal(output.files[0].code,code);
    assert.deepEqual(await execute(output.files,'main.cjs'),native);
  });
}

test('computed browser fetch destructuring conservatively holds an ESM graph',()=>{
  const files=[
    {path:'private.mjs',sourceType:/** @type {const} */('module'),
      code:'export const state={secretField:31};'},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:"import {state} from './private.mjs';"+
        "const {['fe'+'tch']:getSource}=globalThis;"+
        "getSource('./private.mjs');console.log(state.secretField);"}
  ];
  const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'browser-destructure-fetch',strings:false,identifiers:true});
  assert.equal(output.crossFile.properties,0);
  assert.deepEqual(output.files.map(file=>file.code),files.map(file=>file.code));
});

test('safe global process destructuring still allows private-property renaming',()=>{
  const code='const {process:proc}=globalThis;'+
    'const state={secretField:32};console.log(proc.env.NODE_ENV,state.secretField);';
  assert.equal(observesDistributedSource(parse(code,'commonjs')),false);
  const output=obfuscateFiles([{path:'safe.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'global-process-safe-pattern',strings:false,
    identifiers:false,properties:true
  });
  assert.equal(output.files[0].metrics.properties,1);
});

/**
 * Node 22's process.getBuiltinModule provides the real filesystem module
 * without require/import. Destructured and reflected copies of this method
 * must preserve source bytes even when the call uses an unrelated alias.
 */
const builtinLoaderRoutes=[
  ['destructured process',"const {getBuiltinModule:load}=process;"],
  ['destructured global process',"const {getBuiltinModule:load}=globalThis.process;"],
  ['computed process pattern',
    "const key='getBuiltinModule';const {[key]:load}=process;"],
  ['process alias pattern',
    "const p=globalThis.process;const {getBuiltinModule:load}=p;"],
  ['reflected process method',
    "const load=Reflect.get(process,'getBuiltinModule');"],
  ['reflected global process method',
    "const load=Reflect.get(globalThis.process,'getBuiltinModule');"],
  ['global process method descriptor',
    "const load=Object.getOwnPropertyDescriptor(globalThis.process,'getBuiltinModule').value;"]
];

for(const [name,loader] of builtinLoaderRoutes) {
  test('process.getBuiltinModule source reader preserves exact bytes: '+name,async()=>{
    const code="'use strict';\n"+loader+'\n'+
      "const io=load('node:fs');\n"+
      'const privateObject={secretField:31};\n'+
      "const bytes=io.readFileSync(__filename,'utf8');\n"+
      "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
    /** @type {Source[]} */
    const files=[{path:'main.cjs',sourceType:'commonjs',code}];
    const native=await execute(files,'main.cjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31 true\n');
    assert.equal(observesDistributedSource(parse(code,'commonjs')),true);
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      const emitted=obfuscateFiles(files,{
        mode,seed:'get-builtin-module/'+name,strings:true,
        properties:true,identifiers:true
      });
      assert.equal(emitted.files[0].code,code);
      assert.deepEqual(await execute(emitted.files,'main.cjs'),native);
    }
  });
}

// Directly disabling the file-source preflight gives a measurable native
// discrepancy. This control separates compatibility from any security claim.
test('unguarded local property rewrite changes observable Node module source',async()=>{
  const {renameLocalProperties}=require('../src/properties');
  const code="'use strict';\n"+
    "const {getBuiltinModule:load}=process;\n"+
    "const io=load('node:fs');\n"+
    'const privateObject={secretField:31};\n'+
    "const bytes=io.readFileSync(__filename,'utf8');\n"+
    "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
  /** @type {Source[]} */
  const nativeFiles=[{path:'main.cjs',sourceType:'commonjs',code}];
  const unchecked=renameLocalProperties(code,parse(code,'commonjs'),{
    seed:'builtin-source-unguarded'
  });
  assert.equal(unchecked.properties,1,'negative control must actually transform');
  const unguardedFiles=[{...nativeFiles[0],code:unchecked.code}];
  const native=await execute(nativeFiles,'main.cjs');
  const altered=await execute(unguardedFiles,'main.cjs');
  assert.equal(native.status,0,native.stderr);
  assert.equal(altered.status,0,altered.stderr);
  assert.equal(native.stdout,'31 true\n');
  assert.equal(altered.stdout,'31 false\n');
  const guarded=obfuscateFiles(nativeFiles,{mode:'sno',
    seed:'builtin-source-guarded',strings:true,properties:true,identifiers:true});
  assert.equal(guarded.files[0].code,code);
  assert.deepEqual(await execute(guarded.files,'main.cjs'),native);
});

const processModuleRoutes=[
  ['direct process require pattern',
    "const {getBuiltinModule:load}=require('node:process');"],
  ['aliased process require pattern',
    "const proc=require('node:process');const {getBuiltinModule:load}=proc;"],
  ['reflected process require',
    "const load=Reflect.get(require('node:process'),'getBuiltinModule');"],
  ['process require descriptor',
    "const load=Object.getOwnPropertyDescriptor(require('node:process'),'getBuiltinModule').value;"]
];

for(const [name,loader] of processModuleRoutes) {
  test('Node built-in process module source reading: '+name,async()=>{
    const code="'use strict';\n"+loader+'\n'+
      "const io=load('node:fs');\n"+
      'const privateObject={secretField:31};\n'+
      "const bytes=io.readFileSync(__filename,'utf8');\n"+
      "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
    /** @type {Source[]} */
    const files=[{path:'main.cjs',sourceType:'commonjs',code}];
    const native=await execute(files,'main.cjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31 true\n');
    assert.equal(observesDistributedSource(parse(code,'commonjs')),true);
    const emitted=obfuscateFiles(files,{
      mode:'sno',seed:'process-require-source/'+name,
      strings:true,properties:true,identifiers:true
    });
    assert.equal(emitted.files[0].code,code);
    assert.deepEqual(await execute(emitted.files,'main.cjs'),native);
  });
}

test('ESM named import from node:process preserves source-visible code',async()=>{
  const code="import {getBuiltinModule as load} from 'node:process';\n"+
    "const io=load('node:fs');\n"+
    'const privateObject={secretField:31};\n'+
    "const bytes=io.readFileSync(new URL(import.meta.url),'utf8');\n"+
    "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
  /** @type {Source[]} */
  const files=[{path:'main.mjs',sourceType:'module',code}];
  const native=await execute(files,'main.mjs');
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'31 true\n');
  assert.equal(observesDistributedSource(parse(code,'module')),true);
  const emitted=obfuscateFiles(files,{
    mode:'sno',seed:'esm-process-named-source',
    strings:true,properties:true,identifiers:true
  });
  assert.equal(emitted.files[0].code,code);
  assert.deepEqual(await execute(emitted.files,'main.mjs'),native);
});

test('benign process module environment alias keeps own-key transform yield',()=>{
  const code="const proc=require('node:process');"+
    'const privateObject={secretField:32};'+
    'console.log(proc.env.NODE_ENV,privateObject.secretField);';
  assert.equal(observesDistributedSource(parse(code,'commonjs')),false);
  const output=obfuscateFiles([{path:'safe.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'process-require-env-positive',strings:false,
    properties:true,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,1);
});

test('cross-file ESM process loader preserves the original owner module bytes',async()=>{
  /** @type {Source[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',
      code:'export const state={secretField:51};\n'},
    {path:'entry.mjs',sourceType:'module',
      code:"import {state} from './owner.mjs';\n"+
        "import {getBuiltinModule as load} from 'node:process';\n"+
        "const bytes=load('node:fs').readFileSync(new URL('./owner.mjs',import.meta.url),'utf8');\n"+
        "console.log(state.secretField,bytes.includes('secret'+'Field'));\n"}
  ];
  const native=await execute(files,'entry.mjs');
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'51 true\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'process-builtin-crossfile',
    strings:true,properties:true,identifiers:true
  });
  assert.equal(output.crossFile.properties,0);
  assert.deepEqual(output.files.map(file=>file.code),files.map(file=>file.code));
  assert.deepEqual(await execute(output.files,'entry.mjs'),native);
});

const processReexports=[
  ['named process loader reexport',
    "export {getBuiltinModule as load} from 'node:process';",
    "import {load} from './bridge.mjs';"],
  ['star process loader reexport',
    "export * from 'node:process';",
    "import {getBuiltinModule as load} from './bridge.mjs';"]
];
for(const [name,bridge,consumer] of processReexports) {
  test('source-capable process ESM reexport preserves another file: '+name,async()=>{
    /** @type {Source[]} */
    const files=[
      {path:'owner.mjs',sourceType:'module',
        code:'const privateObject={secretField:31};console.log(privateObject.secretField);\n'},
      {path:'bridge.mjs',sourceType:'module',code:bridge+'\n'},
      {path:'entry.mjs',sourceType:'module',
        code:"import './owner.mjs';\n"+consumer+'\n'+
          "const bytes=load('node:fs').readFileSync(new URL('./owner.mjs',import.meta.url),'utf8');\n"+
          "console.log(bytes.includes('secret'+'Field'));\n"}
    ];
    const native=await execute(files,'entry.mjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31\ntrue\n');
    assert.equal(observesDistributedSource(parse(bridge+'\n','module')),true);
    const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
      seed:'process-reexport/'+name,strings:true,identifiers:true,properties:true});
    assert.deepEqual(output.files.map(file=>file.code),files.map(file=>file.code));
    assert.deepEqual(await execute(output.files,'entry.mjs'),native);
  });
}

test('benign named process env reexport retains private-field rewrite yield',()=>{
  const bridge="export {env as environment} from 'node:process';";
  assert.equal(observesDistributedSource(parse(bridge,'module')),false);
  const files=[
    {path:'owner.mjs',sourceType:/** @type {const} */('module'),
      code:'const privateObject={secretField:31};console.log(privateObject.secretField);\n'},
    {path:'bridge.mjs',sourceType:/** @type {const} */('module'),
      code:bridge+'\n'}
  ];
  const emitted=obfuscateFiles(files,{mode:'coo',
    seed:'process-env-reexport-positive',strings:false,identifiers:false,
    properties:true});
  assert.equal(emitted.files[0].metrics.properties,1);
});

for(const source of ['process','node:process']) {
  test('dynamic import of '+source+' exposes native process filesystem capability',async()=>{
    const code="(async()=>{\n"+
      "const {getBuiltinModule:load}=await import("+JSON.stringify(source)+");\n"+
      "const fs=load('node:fs');\n"+
      'const privateObject={secretField:31};\n'+
      "const bytes=fs.readFileSync(__filename,'utf8');\n"+
      "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n"+
      "})().catch(error=>{console.error(error);process.exitCode=1;});\n";
    /** @type {Source[]} */
    const files=[{path:'dynamic.cjs',sourceType:'commonjs',code}];
    const native=await execute(files,'dynamic.cjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31 true\n');
    assert.equal(observesDistributedSource(parse(code,'commonjs')),true);
    const output=obfuscateFiles(files,{mode:'sno',strings:true,
      identifiers:true,properties:true,seed:'dynamic-node-process/'+source});
    assert.equal(output.files[0].code,code);
    assert.deepEqual(await execute(output.files,'dynamic.cjs'),native);
  });
}

test('benign dynamic import of node:os keeps transformable private record',()=>{
  const code="async function f(){const os=await import('node:os');return os.platform()}\n"+
    'const state={secretField:31};console.log(state.secretField);\n';
  assert.equal(observesDistributedSource(parse(code,'commonjs')),false);
  const transformed=obfuscateFiles([
    {path:'safe.cjs',sourceType:'commonjs',code}
  ],{mode:'sno',seed:'benign-dynamic-os',strings:false,identifiers:false,
    properties:true});
  assert.equal(transformed.files[0].metrics.properties,1);
});

const detachedReflectionPaths=[
  ['detached Reflect.get',
    "const get=Reflect.get;const load=get(process,'getBuiltinModule');"],
  ['computed and aliased Reflect.get',
    "const getter=Reflect['get'];const get=getter;const load=get(globalThis.process,'getBuiltinModule');"],
  ['detached descriptor getter',
    "const descriptor=Object.getOwnPropertyDescriptor;const load=descriptor(process,'getBuiltinModule').value;"],
  ['computed descriptor on process require',
    "const descriptor=Object['getOwnPropertyDescriptor'];const load=descriptor(require('node:process'),'getBuiltinModule').value;"]
];
for(const [name,loader] of detachedReflectionPaths) {
  test('detached source-capable native reflection preserves bytes: '+name,async()=>{
    const code="'use strict';\n"+loader+'\n'+
      "const io=load('node:fs');\n"+
      'const privateObject={secretField:31};\n'+
      "const bytes=io.readFileSync(__filename,'utf8');\n"+
      "console.log(privateObject.secretField,bytes.includes('secret'+'Field'));\n";
    /** @type {Source[]} */
    const files=[{path:'main.cjs',sourceType:'commonjs',code}];
    const native=await execute(files,'main.cjs');
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'31 true\n');
    assert.equal(observesDistributedSource(parse(code,'commonjs')),true);
    const output=obfuscateFiles(files,{mode:'sno',seed:'detached-reflection/'+name,
      strings:true,properties:true,identifiers:true});
    assert.equal(output.files[0].code,code);
    assert.deepEqual(await execute(output.files,'main.cjs'),native);
  });
}

test('benign detached native Reflect.get environment lookup preserves yield',()=>{
  const code="const get=Reflect.get;const env=get(process,'env');"+
    "const state={secretField:31};console.log(env.NODE_ENV,state.secretField);";
  assert.equal(observesDistributedSource(parse(code,'commonjs')),false);
  const output=obfuscateFiles([{path:'safe.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'detached-reflect-env-positive',strings:false,
    properties:true,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,1);
});
