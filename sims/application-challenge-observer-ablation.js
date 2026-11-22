'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');

/**
 * Deliberately removes property-name reflection and opaque CLI
 * coercion to isolate the compiler's proof refusal. This is a diagnostic
 * ablation, not a semantics-preserving or deployable source rewrite.
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @param {'reflect'|'entry'|'both'|'none'} variant
 * @returns {{path:string,sourceType:'module',code:string}[]}
 */
function ablate(files,variant){
  return files.map(file=>{
    let code=file.code;
    if(file.path==='app.mjs'&&['reflect','both'].includes(variant)){
      const original="function inspectRecord(key) {\n  const keys=Reflect.ownKeys(schema).sort();\n  const value=Object.prototype.hasOwnProperty.call(schema,key)?schema[key]:'<missing>';\n  const enumerable=Object.getOwnPropertyDescriptor(schema,key)?.enumerable===true;\n  return {keys,value,enumerable};\n}";
      const fixed="function inspectRecord(key) {\n  const keys=['auditCount','externalFormat'];\n  const value=Object.prototype.hasOwnProperty.call(schema,key)?schema[key]:'<missing>';\n  const enumerable=key==='externalFormat'||key==='auditCount';\n  return {keys,value,enumerable};\n}";
      assert.ok(code.includes(original),'Expected dynamic record reflection in app.mjs');
      code=code.replace(original,fixed);
    }
    if(file.path==='entry.mjs'&&['entry','both'].includes(variant)){
      const original="const cases=JSON.parse(process.argv[2]||'[[1,1000]]');";
      assert.ok(code.includes(original),'Expected opaque CLI JSON.parse in entry.mjs');
      code=code.replace(original,
        "const inputValue=process.argv[2];"+
        "const cases=JSON.parse(typeof inputValue==='string'?inputValue:'[[1,1000]]');");
    }
    return {...file,code};
  });
}

/**
 * Diagnostic variation: remove calls to a missing record key so that every
 * possible computed receiver lookup is proven to select an own literal field.
 * This intentionally changes app behavior; compare against its own native
 * execution rather than the original frozen application.
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @returns {{path:string,sourceType:'module',code:string}[]}
 */
function withOwnKeyCalls(files) {
  return files.map(file=>{
    if(file.path!=='app.mjs')return file;
    const original="inspectRecord('noSuchField')";
    assert.ok(file.code.includes(original),'Expected original missing record lookup');
    return {...file,code:file.code.replace(original,"inspectRecord('auditCount')")};
  });
}

/**
 * Separate diagnostic application: its source already declares a null
 * prototype for a closed record. Missing keys cannot select an inherited
 * host Function. This is an intentional source change, not a transformation
 * the compiler performs on the frozen original application.
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @returns {{path:string,sourceType:'module',code:string}[]}
 */
function withNullPrototypeRecord(files){
  return files.map(file=>{
    if(file.path!=='app.mjs')return file;
    const original="const schema={externalFormat:'audit-v1',auditCount:3};";
    assert.ok(file.code.includes(original),'Expected original private record');
    return {...file,code:file.code.replace(original,
      "const schema={__proto__:null,externalFormat:'audit-v1',auditCount:3};")};
  });
}

/**
 * A separate, explicitly type-safe host-input application contract.
 * Capture the mutable CLI slot exactly once; narrow only the captured const
 * with typeof before JSON.parse can invoke implicit Function#toString.
 * The historical frozen original is deliberately NOT rewritten by default.
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @returns {{path:string,sourceType:'module',code:string}[]}
 */
function withCapturedStringArgv(files) {
  return files.map(file=>{
    if(file.path!=='entry.mjs')return file;
    const original="const cases=JSON.parse(process.argv[2]||'[[1,1000]]');";
    const captured="const inputValue=process.argv[2];"+
      "const cases=JSON.parse(typeof inputValue==='string'?inputValue:'[[1,1000]]');";
    assert.ok(file.code.includes(original),'Expected original host CLI JSON.parse');
    return {...file,code:file.code.replace(original,captured)};
  });
}

/** @returns {Promise<unknown[]>} */
async function main(){
  const originals=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const rows=[];
  for(const variant of ['none','reflect','entry','both','own-only','null-proto']){
    const withoutObservers=ablate(originals,
      /** @type {'none'|'reflect'|'entry'|'both'} */(
        variant==='own-only'||variant==='null-proto'?'both':variant));
    const source=variant==='own-only'?withOwnKeyCalls(withoutObservers):
      variant==='null-proto'?withNullPrototypeRecord(withoutObservers):withoutObservers;
    const sources=source;
    const observerPaths=sources.filter(file=>observesFunctionSource(
      parse(file.code,'module'))).map(file=>file.path);
    const compiled=obfuscateFiles(sources,{
      mode:'coo',seed:SEED,closedWorld:true,
      strings:false,identifiers:false,properties:true
    });
    rows.push({variant,
      observerPaths,
      propertyRenames:compiled.crossFile.properties,
      changes:compiled.files.filter((file,i)=>file.code!==sources[i].code).map(file=>file.path)
    });
  }
  // Opaque process.argv[2] makes JSON.parse a source observer even after
  // removing unrelated reflection/stringification expressions. Only the two
  // explicitly type-guarded positive contracts can prove the input primitive.
  assert.deepEqual(rows.map(row=>row.observerPaths),[
    ['entry.mjs'],['entry.mjs'],[],[],[],[]
  ]);
  assert.deepEqual(rows.map(row=>row.propertyRenames),[0,2,0,2,2,2],
    'Plain missing keys decline; changed own-key-only and null-prototype programs retain coverage');
  process.stdout.write('APPLICATION_SOURCE_OBSERVER_ABLATION '+JSON.stringify(rows)+'\n');
  return rows;
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main,ablate,withOwnKeyCalls,withNullPrototypeRecord,withCapturedStringArgv};
