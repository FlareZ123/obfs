'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');

/**
 * Deliberately changes two source-observer expressions to isolate the
 * compiler's proof refusal. This is a diagnostic ablation, not a
 * semantics-preserving or deployable source rewrite.
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @param {'reflect'|'entry'|'both'|'none'} variant
 * @returns {{path:string,sourceType:'module',code:string}[]}
 */
function ablate(files,variant){
  return files.map(file=>{
    let code=file.code;
    if(file.path==='reflect.mjs'&&['reflect','both'].includes(variant)){
      const original='Object.getOwnPropertyDescriptor(schema,key)';
      assert.ok(code.includes(original));
      code=code.replace(original,'Object.getOwnPropertyDescriptor(schema,"externalFormat")');
    }
    if(file.path==='entry.mjs'&&['entry','both'].includes(variant)){
      const original="JSON.stringify(cases.map(([seed,count])=>evaluate(seed,count)))+'\\n'";
      assert.ok(code.includes(original));
      code=code.replace(original,"JSON.stringify(cases.map(([seed,count])=>evaluate(seed,count)))");
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

/** @returns {Promise<unknown[]>} */
async function main(){
  const originals=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const rows=[];
  for(const variant of ['none','reflect','entry','both','own-only']){
    const withoutObservers=ablate(originals,
      /** @type {'none'|'reflect'|'entry'|'both'} */(variant==='own-only'?'both':variant));
    const sources=variant==='own-only'?withOwnKeyCalls(withoutObservers):withoutObservers;
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
  assert.deepEqual(rows.map(row=>row.observerPaths),[
    ['reflect.mjs','entry.mjs'],['entry.mjs'],['reflect.mjs'],[],[]
  ]);
  assert.deepEqual(rows.map(row=>row.propertyRenames),[0,0,0,0,2],
    'Missing-key inheritance must decline; own-key-only calls restore coverage');
  process.stdout.write('APPLICATION_SOURCE_OBSERVER_ABLATION '+JSON.stringify(rows)+'\n');
  return rows;
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main,ablate,withOwnKeyCalls};
