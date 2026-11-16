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

/** @typedef {{path:string,sourceType:'commonjs',code:string}} Source */
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
    "console.log(privateObject.secretField,bytes.includes('secretField'));\n";
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
      "console.log(secretObject.secretField,bytes.includes('secretField'));\n"}
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
      "console.log(privateObject.secretField,bytes.includes('secretField'));\n";
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
