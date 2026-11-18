'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Run one CommonJS source under Node's external uncaught-exception report flag.
 * @param {string} code
 * @param {string} label
 * @returns {Promise<{label:string,status:number|null,message:string,frame:string}>}
 */
async function runReportedVariant(code,label) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-process-report-'));
  const entry=path.join(directory,'entry.cjs');
  const report=path.join(directory,'report.json');
  try {
    await atomicWrite(entry,code);
    const child=spawnSync(process.execPath,[
      '--report-uncaught-exception',
      '--report-filename=report.json',
      `--report-directory=${directory}`,
      entry
    ],{
      encoding:'utf8'
    });
    const data=JSON.parse(await fs.readFile(report,'utf8'));
    const stack=/** @type {{message:string,stack:string[]}} */ (data.javascriptStack);
    const frame=stack.stack.find(value=>/entry\.cjs:1:\d+/.test(value));
    if(frame===undefined)throw new Error('Diagnostic report omitted the entry source frame');
    return {label,status:child.status,message:stack.message,frame};
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * Demonstrate that an external Node diagnostic-report flag can observe source
 * coordinate changes even when the input program never references process.report.
 * @returns {Promise<{
 *   node:string,
 *   properties:number,
 *   bindings:number,
 *   native:{label:string,status:number|null,message:string,frame:string},
 *   emitted:{label:string,status:number|null,message:string,frame:string},
 *   framesEqual:boolean
 * }>}
 */
async function runExperiment() {
  const source="'use strict';const distinctivelyLongBindingNameThatForcesCoordinateShift=73;"+
    "throw new Error(String(distinctivelyLongBindingNameThatForcesCoordinateShift));";
  const emitted=obfuscateFiles([{
    path:'entry.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'process-report-cli-source-observer',
    strings:false,
    identifiers:true,
    properties:false
  }).files[0];

  const native=await runReportedVariant(source,'native');
  const transformed=await runReportedVariant(emitted.code,'emitted');
  return {
    node:process.version,
    properties:emitted.metrics.properties,
    bindings:emitted.metrics.bindings,
    native,
    emitted:transformed,
    framesEqual:native.frame===transformed.frame
  };
}

if(require.main===module) {
  runExperiment().then(result=>{
    console.log('PROCESS_REPORT_CLI_SOURCE_OBSERVER '+JSON.stringify(result));
  });
}

module.exports={runExperiment};
