'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createHash} = require('node:crypto');
const {obfuscateFiles} = require('../src');
const {parse,observesFunctionSource,observesDistributedSource} = require('../src/ast');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname,'..');

/**
 * Run a Node subprocess and require a clean exit.
 * @param {string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [extraEnv]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function runNode(args,cwd,extraEnv={}) {
  const child=spawnSync(process.execPath,args,{
    cwd,
    encoding:'utf8',
    timeout:30000,
    env:{...process.env,...extraEnv}
  });
  assert.equal(child.error,undefined,String(child.error??''));
  assert.equal(child.status,0,'Node subprocess failed:\n'+child.stderr+'\n'+child.stdout);
  return child;
}

/**
 * @param {string} filename
 * @returns {Promise<{callbackSource:string,hostInvoked:boolean}>}
 */
async function readObservation(filename) {
  return /** @type {{callbackSource:string,hostInvoked:boolean}} */ (
    JSON.parse(await fs.readFile(filename,'utf8'))
  );
}

test('SNO CLI preserves one-entry launch while a host observes a helper callback across the multi-file graph',{
  timeout:60000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-host-held-multifile-'));
  try {
    const inputRoot=path.join(root,'input');
    const outputRoot=path.join(root,'output');
    const preload=path.join(root,'host-observer.cjs');
    const nativeObservationPath=path.join(root,'native-observation.json');
    const emittedObservationPath=path.join(root,'emitted-observation.json');
    await fs.mkdir(inputRoot,{recursive:true});

    await fs.writeFile(path.join(inputRoot,'helper.cjs'),[
      "'use strict';",
      'let invocationCount=0;',
      'function hidden(inputValue){',
      '  invocationCount+=1;',
      '  const privateLocal=inputValue+1;',
      '  return privateLocal;',
      '}',
      'function safe(unrelatedValue){',
      '  const safeLocal=unrelatedValue+10;',
      '  return safeLocal;',
      '}',
      'function getCallback(){return hidden;}',
      'function getInvocationCount(){return invocationCount;}',
      'module.exports={getCallback,getInvocationCount,safe};'
    ].join('\n')+'\n');

    await fs.writeFile(path.join(inputRoot,'entry.cjs'),[
      "'use strict';",
      "const helper=require('./helper.cjs');",
      'const callback=helper.getCallback();',
      'queueMicrotask(callback);',
      'const result=callback(2);',
      'const safeResult=helper.safe(3);',
      'const invocationCount=helper.getInvocationCount();',
      "process.stdout.write(JSON.stringify({result,safeResult,invocationCount})+'\\n');"
    ].join('\n')+'\n');

    await fs.writeFile(preload,[
      "'use strict';",
      "const fs=require('node:fs');",
      'const destination=process.env.OBFS_HOST_OBSERVATION_FILE;',
      "if(!destination)throw new Error('Missing host observation path');",
      'globalThis.queueMicrotask=function pageOwnedQueueMicrotask(callback){',
      "  if(typeof callback!=='function')throw new TypeError('Expected callback');",
      '  fs.writeFileSync(destination,JSON.stringify({',
      '    callbackSource:Function.prototype.toString.call(callback),',
      '    hostInvoked:false',
      '  }));',
      '};'
    ].join('\n')+'\n');

    const cli=runNode([
      path.join(repositoryRoot,'bin','sno.js'),
      '--root',inputRoot,
      '--out',outputRoot,
      '--entry','entry.cjs',
      '--seed','agent1-sno-host-held-multifile'
    ],repositoryRoot);
    assert.ok(cli.stdout.length>=0);

    const emittedHelper=await fs.readFile(path.join(outputRoot,'helper.cjs'),'utf8');
    const inputEntry=await fs.readFile(path.join(inputRoot,'entry.cjs'),'utf8');
    const inputHelper=await fs.readFile(path.join(inputRoot,'helper.cjs'),'utf8');
    const directDefault=obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',code:inputEntry},
      {path:'helper.cjs',sourceType:'commonjs',code:inputHelper}
    ],{mode:'sno',seed:'agent1-sno-host-held-multifile'});
    const directHelper=String(directDefault.files.find(file=>file.path==='helper.cjs')?.code??'');
    const directNoStrings=obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',code:inputEntry},
      {path:'helper.cjs',sourceType:'commonjs',code:inputHelper}
    ],{mode:'sno',seed:'agent1-sno-host-held-multifile',strings:false,identifiers:true,properties:false});
    const directNoStringsHelper=String(directNoStrings.files.find(file=>file.path==='helper.cjs')?.code??'');
    console.log('SNO_SOURCE_OBSERVER_DIAGNOSTIC '+JSON.stringify({
      entryFunctionSourceObserver:observesFunctionSource(parse(inputEntry,'commonjs')),
      helperFunctionSourceObserver:observesFunctionSource(parse(inputHelper,'commonjs')),
      entryDistributedSourceObserver:observesDistributedSource(parse(inputEntry,'commonjs')),
      helperDistributedSourceObserver:observesDistributedSource(parse(inputHelper,'commonjs')),
      cliHelper:emittedHelper,
      directDefaultHelper:directHelper,
      directNoStringsHelper:directNoStringsHelper
    }));
    const launcher=await fs.readFile(path.join(outputRoot,'sno-entry.cjs'),'utf8');
    const helperDigest=createHash('sha256').update(emittedHelper).digest('hex');
    assert.ok(launcher.includes('helper.cjs'),'single-entry launcher must include the helper in its manifest');
    assert.ok(launcher.includes(helperDigest),'launcher manifest must commit to the emitted helper bytes');

    const native=runNode([
      '--require',preload,'entry.cjs'
    ],inputRoot,{OBFS_HOST_OBSERVATION_FILE:nativeObservationPath});
    const emitted=runNode([
      '--require',preload,'sno-entry.cjs'
    ],outputRoot,{OBFS_HOST_OBSERVATION_FILE:emittedObservationPath});

    const nativeResult=JSON.parse(native.stdout);
    const emittedResult=JSON.parse(emitted.stdout);
    assert.deepEqual(nativeResult,{result:3,safeResult:13,invocationCount:1});
    assert.deepEqual(emittedResult,nativeResult,'SNO multi-file output must preserve the application result');
    
    const nativeObservation=await readObservation(nativeObservationPath);
    const emittedObservation=await readObservation(emittedObservationPath);
    assert.equal(nativeObservation.hostInvoked,false);
    assert.equal(emittedObservation.hostInvoked,false);
    assert.ok(nativeObservation.callbackSource.includes('inputValue'));
    assert.ok(nativeObservation.callbackSource.includes('privateLocal'));
    console.log('SNO_MULTI_FILE_DIAGNOSTIC '+JSON.stringify({emittedHelper,nativeSource:nativeObservation.callbackSource,emittedSource:emittedObservation.callbackSource}));
    assert.notEqual(
      nativeObservation.callbackSource,
      emittedObservation.callbackSource,
      'host-held helper callback source must expose the current SNO identifier rewrite'
    );
    assert.ok(!emittedObservation.callbackSource.includes('inputValue'));
    assert.ok(!emittedObservation.callbackSource.includes('privateLocal'));

    assert.ok(!emittedHelper.includes('unrelatedValue'),
      'unobserved helper function must retain positive identifier-transform yield');
    assert.ok(!emittedHelper.includes('safeLocal'),
      'unobserved helper local must retain positive identifier-transform yield');

    console.log(JSON.stringify({
      mode:'sno-cli',
      topology:'entry.cjs -> helper.cjs factory return -> host-overridden queueMicrotask',
      hostDispatch:'page-owned preload override; callback source read; callback not invoked by host',
      nativeSource:nativeObservation.callbackSource,
      emittedSource:emittedObservation.callbackSource,
      applicationResult:emittedResult,
      emittedHelperSha256:helperDigest,
      sourceParity:false,
      unrelatedIdentifierYield:true
    }));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
