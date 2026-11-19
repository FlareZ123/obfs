'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFile,exec:execCommand}=require('node:child_process');
const {promisify}=require('node:util');
const {performance}=require('node:perf_hooks');
const vm=require('node:vm');
const v8=require('node:v8');
const {wrap}=require('node:module');
const bytenode=require('bytenode');

const execFileAsync=promisify(execFile);
const execCommandAsync=promisify(execCommand);
const SOURCE_CANARY='AGENT8_V8_BYTECODE_SOURCE_CANARY_20261119';

const candidateSource=`'use strict';
/* ${SOURCE_CANARY} */
function secretLedgerTransform(originalLedgerValues, originalRounds) {
  let hiddenLedgerAccumulator=0x13579bdf|0;
  for(let originalRoundIndex=0;originalRoundIndex<originalRounds;originalRoundIndex++) {
    for(let originalValueIndex=0;originalValueIndex<originalLedgerValues.length;originalValueIndex++) {
      const originalLedgerValue=originalLedgerValues[originalValueIndex]|0;
      if((originalLedgerValue&1)===0) {
        hiddenLedgerAccumulator=(Math.imul(hiddenLedgerAccumulator^originalLedgerValue,1664525)+1013904223)|0;
      } else {
        hiddenLedgerAccumulator=(Math.imul(hiddenLedgerAccumulator+originalLedgerValue,1103515245)^12345)|0;
      }
      hiddenLedgerAccumulator=(hiddenLedgerAccumulator^(hiddenLedgerAccumulator>>>13))|0;
    }
  }
  return hiddenLedgerAccumulator|0;
}
const [originalInputValues,originalInputRounds]=JSON.parse(process.argv[2]);
process.stdout.write(String(secretLedgerTransform(originalInputValues,originalInputRounds)));
`;

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{stdout:string,stderr:string}>}
 */
async function run(command,args){
  return execFileAsync(command,args,{
    encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{stdout:string,stderr:string}>}
 */
async function runCli(command,args){
  if(process.platform!=='win32')return run(command,args);
  const quote=value=>'"'+value.replaceAll('"','""')+'"';
  const line=[command,...args].map(quote).join(' ');
  return execCommandAsync(line,{
    encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000,
    shell:process.env.ComSpec??'cmd.exe'
  });
}

/**
 * Compile an eager CommonJS probe exactly in the form jscd documents for ro-map calibration.
 * @param {string} source
 * @param {string} output
 * @returns {void}
 */
function compileProbe(source,output){
  v8.setFlagsFromString('--no-lazy');
  v8.setFlagsFromString('--no-flush-bytecode');
  const script=new vm.Script(wrap(source),{produceCachedData:true});
  const cached=script.cachedData?.length?script.cachedData:script.createCachedData();
  fs.writeFileSync(output,Buffer.from(cached));
}

/**
 * @param {number} seed
 * @param {number} length
 * @returns {number[]}
 */
function values(seed,length){
  let state=seed|0;
  const result=[];
  for(let index=0;index<length;index++){
    state=(Math.imul(state,1664525)+1013904223)|0;
    result.push(state);
  }
  return result;
}

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {string} executable
 * @param {string[]} args
 * @returns {Promise<{stdout:string,elapsedMs:number}>}
 */
async function timed(executable,args){
  const started=performance.now();
  const result=await run(executable,args);
  return {stdout:result.stdout.trim(),elapsedMs:performance.now()-started};
}

/** @returns {Promise<void>} */
async function main(){
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-sno-bytecode-'));
  const sourcePath=path.join(workspace,'candidate.js');
  const bytecodePath=path.join(workspace,'candidate.jsc');
  const recoveredPath=path.join(workspace,'candidate.recovered.js');
  const probePath=path.join(workspace,'ro-probe.js');
  const probeBytecodePath=path.join(workspace,'ro-probe.jsc');
  const roMapPath=path.join(workspace,'candidate.ro-map.json');
  fs.writeFileSync(sourcePath,candidateSource,'utf8');

  const compileStarted=performance.now();
  await bytenode.compileFile({
    filename:sourcePath,
    output:bytecodePath,
    compileAsModule:false
  });
  const compileMs=performance.now()-compileStarted;

  const bytecode=fs.readFileSync(bytecodePath);
  const sourceCanaryInBytecode=bytecode.includes(Buffer.from(SOURCE_CANARY,'utf8'));
  const originalIdentifierInBytecode=bytecode.includes(
    Buffer.from('secretLedgerTransform','utf8')
  );

  const jscdBin=process.env.JSCD_BIN||path.join(
    process.cwd(),'node_modules','.bin',process.platform==='win32'?'jscd.cmd':'jscd'
  );
  assert.ok(fs.existsSync(jscdBin),'Missing jscd binary at '+jscdBin);

  const info=JSON.parse((await runCli(jscdBin,['info','--json',bytecodePath])).stdout);
  assert.equal(info.supported,true,'jscd does not report this V8 cache as supported');

  const asciiStrings=[...bytecode.toString('latin1').matchAll(/[A-Za-z_$][A-Za-z0-9_$]{1,31}/gu)]
    .map(match=>match[0]);
  const genericNames=[
    'Array','BigInt','Boolean','Buffer','Date','Error','Function','Infinity','JSON',
    'Map','Math','NaN','Number','Object','Promise','Reflect','RegExp','Set','String',
    'Symbol','Uint8Array','WeakMap','WeakSet','console','globalThis','process',
    'argv','length','parse','parseInt','parseFloat','imul','stdout','stderr','write',
    'constructor','prototype','toString','valueOf','entries','keys','values','next',
    'then','resolve','reject','call','apply','bind','forEach','map','reduce','slice',
    'push','pop','shift','unshift','join','split','replace','match','test','exec'
  ];
  const names=[...new Set([...genericNames,...asciiStrings])]
    .filter(name=>/^[A-Za-z_$][A-Za-z0-9_$]{0,31}$/u.test(name));
  const probeSource=names.map(name=>
    'function p_'+name+'(o){return o.'+name+';}'
  ).join('\n')+'\nfunction __runAll(o){'+
    names.map(name=>'p_'+name+'(o);').join('')+'}\n__runAll({});\n';
  fs.writeFileSync(probePath,probeSource,'utf8');
  compileProbe(probeSource,probeBytecodePath);
  const roMap=(await runCli(jscdBin,['ro-map','--json',probeBytecodePath])).stdout;
  fs.writeFileSync(roMapPath,roMap,'utf8');

  const attackStarted=performance.now();
  await runCli(jscdBin,[
    'decompile','--runtime','--verify','--ro-map',roMapPath,
    bytecodePath,'-o',recoveredPath
  ]);
  const attackMs=performance.now()-attackStarted;
  const recovered=fs.readFileSync(recoveredPath,'utf8');
  assert.ok(recovered.length>0,'jscd produced empty recovered source');

  const bytecodeDriver=[
    '-e',
    "require('bytenode').runBytecodeFile(process.argv[1])",
    bytecodePath
  ];

  let parityCases=0;
  for(let caseIndex=0;caseIndex<16;caseIndex++){
    const length=(caseIndex*7)%23;
    const payload=JSON.stringify([
      values((0x2468ace+caseIndex*977)|0,length),
      1+(caseIndex%5)
    ]);
    const original=(await run(process.execPath,[sourcePath,payload])).stdout.trim();
    const compiled=(await run(process.execPath,[...bytecodeDriver,payload])).stdout.trim();
    const decompiled=(await run(process.execPath,[recoveredPath,payload])).stdout.trim();
    assert.equal(compiled,original,'Bytenode behavior mismatch at case '+caseIndex);
    assert.equal(decompiled,original,'Static decompiler behavior mismatch at case '+caseIndex);
    parityCases++;
  }

  const heavyPayload=JSON.stringify([values(0x10293847,256),50000]);
  /** @type {number[]} */
  const originalMs=[];
  /** @type {number[]} */
  const bytecodeMs=[];
  /** @type {number[]} */
  const recoveredMs=[];
  let expected='';
  for(let trial=0;trial<7;trial++){
    const order=trial%2===0?['original','bytecode','recovered']:['recovered','bytecode','original'];
    for(const arm of order){
      const measured=arm==='original'?
        await timed(process.execPath,[sourcePath,heavyPayload]):
        arm==='bytecode'?
          await timed(process.execPath,[...bytecodeDriver,heavyPayload]):
          await timed(process.execPath,[recoveredPath,heavyPayload]);
      if(!expected)expected=measured.stdout;
      assert.equal(measured.stdout,expected,'Heavy workload output mismatch for '+arm);
      if(arm==='original')originalMs.push(measured.elapsedMs);
      else if(arm==='bytecode')bytecodeMs.push(measured.elapsedMs);
      else recoveredMs.push(measured.elapsedMs);
    }
  }

  const originalMedian=median(originalMs);
  const bytecodeMedian=median(bytecodeMs);
  const recoveredMedian=median(recoveredMs);
  const summary={
    node:process.version,
    v8:process.versions.v8,
    bytenode:require('bytenode/package.json').version,
    jscd:String(info.version??info.jscd_version??'unknown'),
    detectedV8:info.v8,
    detectedNode:info.node,
    roProbeNames:names.length,
    sourceBytes:Buffer.byteLength(candidateSource),
    bytecodeBytes:bytecode.length,
    recoveredBytes:Buffer.byteLength(recovered),
    sourceCanaryInBytecode,
    originalIdentifierInBytecode,
    parityCases,
    compileMs,
    staticAttackMs:attackMs,
    processWallMs:{
      original:originalMedian,
      bytecode:bytecodeMedian,
      recovered:recoveredMedian
    },
    bytecodeOriginalRatio:bytecodeMedian/originalMedian,
    recoveredOriginalRatio:recoveredMedian/originalMedian
  };
  process.stdout.write('SNO_V8_BYTECODE_CANDIDATE '+JSON.stringify(summary)+'\n');
  process.stdout.write('SNO_V8_BYTECODE_RECOVERED_HEAD '+JSON.stringify(
    recovered.slice(0,1200)
  )+'\n');
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={main,candidateSource,SOURCE_CANARY};
