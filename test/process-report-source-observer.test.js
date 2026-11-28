'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');

/**
 * Execute one CommonJS body at a fixed filename and return its exported value.
 * @param {string} code
 * @returns {unknown}
 */
function execute(code) {
  const context={process,JSON,require,module:{exports:null}};
  vm.runInNewContext(code,context,{
    filename:'process-report-observer.cjs',
    // Windows full-suite contention can make process.report.getReport()
    // exceed 2 seconds; keep a bounded 5-second watchdog while comparing
    // exact native/transformed stack coordinates for semantic parity.
    timeout:5000
  });
  return context.module.exports;
}

/**
 * Process diagnostic reports contain the live JavaScript call stack. Any
 * source rewrite ahead of getReport() on the same line can change its column.
 * @param {string} reportExpression
 * @param {string} seed
 */
function mustPreserveProcessReport(reportExpression,seed) {
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=JSON.stringify("+reportExpression+".javascriptStack);";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed,
    strings:false,
    identifiers:false
  }).files[0];
  const native=execute(source);
  const transformed=execute(output.code);
  assert.equal(typeof native,'string');
  assert.equal(typeof transformed,'string');
  const sourceFrame=/process-report-observer\.cjs:1:\d+/g;
  assert.match(native,/process-report-observer\.cjs:1:\d+/);
  assert.deepEqual(transformed.match(sourceFrame),native.match(sourceFrame),output.code);
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
}

test('process.report.getReport preserves source coordinates',()=>{
  mustPreserveProcessReport(
    'process.report.getReport()',
    'agent1-process-report-direct'
  );
});

test('aliased process.report namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const report=process.report;return report.getReport();})()',
    'agent1-process-report-namespace-alias'
  );
});

test('escaped process namespaces preserve source coordinates',()=>{
  const expressions=[
    '(()=>{function take(proc){return proc.report.getReport();}return take(process);})()',
    '(()=>{const box={proc:process};return box.proc.report.getReport();})()',
    '(()=>{const box=[process];return box[0].report.getReport();})()',
    '(()=>{function take(){return process;}return take().report.getReport();})()'
  ];
  for(const [index,expression] of expressions.entries())
    mustPreserveProcessReport(expression,'agent1-process-escape-'+index);
});

test('escaped process.report namespaces preserve source coordinates',()=>{
  const expressions=[
    '(()=>{function take(report){return report.getReport();}return take(process.report);})()',
    '(()=>{const box={report:process.report};return box.report.getReport();})()',
    '(()=>{const box=[process.report];return box[0].getReport();})()',
    '(()=>{function take(){return process.report;}return take().getReport();})()'
  ];
  for(const [index,expression] of expressions.entries())
    mustPreserveProcessReport(expression,'agent1-process-report-escape-'+index);
});

test('dynamic process report namespace acquisition preserves source',()=>{
  mustPreserveProcessReport(
    "(()=>{const key='report';return process[key].getReport();})()",
    'agent1-process-report-dynamic-namespace'
  );
});

test('dynamic process.report member access preserves source',()=>{
  mustPreserveProcessReport(
    "(()=>{const key='getReport';return process.report[key]();})()",
    'agent1-process-report-dynamic-member'
  );
});

test('copied process.report methods preserve source coordinates',()=>{
  const expressions=[
    '(()=>{const {...copy}=process.report;return copy.getReport();})()',
    '(()=>{const copy={...process.report};return copy.getReport();})()',
    '(()=>{const copy=Object.assign({},process.report);return copy.getReport();})()',
    '(()=>{const box={fn:process.report.getReport};return box.fn();})()',
    '(()=>{const [fn]=[process.report.getReport];return fn();})()',
    "(()=>{const fn=Reflect.get(process.report,'getReport');return fn();})()"
  ];
  for(const [index,expression] of expressions.entries())
    mustPreserveProcessReport(expression,'agent1-process-report-copy-'+index);
});

test('destructured process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const {getReport}=process.report;return getReport();})()',
    'agent1-process-report-method-alias'
  );
});

test('defaulted destructured process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const {getReport=()=>null}=process.report;return getReport();})()',
    'agent1-process-report-method-default'
  );
});

test('bound process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const getReport=process.report.getReport.bind(process.report);return getReport();})()',
    'agent1-process-report-bound'
  );
});

test('Reflect.apply process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    'Reflect.apply(process.report.getReport,null,[])',
    'agent1-process-report-reflect-apply'
  );
});

test('Reflect.get process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "Reflect.get(process.report,'getReport')()",
    'agent1-process-report-reflect-get-method'
  );
});

test('Reflect.get process report namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "Reflect.get(process,'report').getReport()",
    'agent1-process-report-reflect-get-namespace'
  );
});

test('CommonJS process module namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const proc=require('node:process');return proc.report.getReport();})()",
    'agent1-process-report-cjs-namespace'
  );
});

test('CommonJS destructured report export preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {report}=require('node:process');return report.getReport();})()",
    'agent1-process-report-cjs-report'
  );
});

test('nested CommonJS process report destructuring preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {report:{getReport}}=require('node:process');return getReport();})()",
    'agent1-process-report-cjs-nested'
  );
});

test('defaulted nested CommonJS process report destructuring preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {report:{getReport=()=>null}}=require('node:process');return getReport();})()",
    'agent1-process-report-cjs-nested-default'
  );
});

test('defaulted process report namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const {report=()=>null}=process;return report.getReport();})()',
    'agent1-process-report-namespace-default'
  );
});

test('ESM named report import refuses source rewrites',()=>{
  const source="import {report as diagnosticReport} from 'node:process';"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "export const observed=diagnosticReport.getReport().javascriptStack;"+
    "export const result=value;";
  assert.equal(observesFunctionSource(parse(source,'module')),true,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.mjs',
    sourceType:'module',
    code:source
  }],{
    mode:'coo',
    seed:'agent1-process-report-esm-report',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
});

/**
 * Run a source file that enables automatic uncaught-exception reporting and
 * return only the frame for that fixed source file.
 * @param {string} code
 * @returns {Promise<string>}
 */
async function automaticReportFrame(code) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-process-report-'));
  const script=path.join(root,'automatic-report-observer.cjs');
  const reportFile=path.join(root,'report.json');
  try {
    await atomicWrite(script,code);
    const child=spawnSync(process.execPath,[script],{
      cwd:root,
      encoding:'utf8',
      timeout:10000
    });
    assert.equal(child.status,1,child.stderr);
    const report=JSON.parse(await fs.readFile(reportFile,'utf8'));
    const frames=/** @type {string[]} */(report.javascriptStack.stack);
    const frame=frames.find(value=>value.includes('automatic-report-observer.cjs:'));
    assert.ok(frame,JSON.stringify(frames));
    return frame;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('diagnostic report legacy setter lookup preserves source coordinates',async()=>{
  const lookups=[
    "const setter=process.report.__lookupSetter__('reportOnUncaughtException');",
    "const setter=Object.prototype.__lookupSetter__.call("+
      "process.report,'reportOnUncaughtException');"
  ];
  for(const [index,lookup] of lookups.entries()) {
    const source="'use strict';process.report.directory=__dirname;"+
      "process.report.filename='report.json';"+lookup+
      "setter.call(process.report,true);"+
      "const owner={distinctivelyLongPrivateField:73};"+
      "const value=owner.distinctivelyLongPrivateField;"+
      "throw new Error(String(value));";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
    const output=obfuscateFiles([{
      path:'automatic-report-observer.cjs',
      sourceType:'commonjs',
      code:source
    }],{
      mode:'sno',
      seed:'agent1-process-report-lookup-setter-'+index,
      strings:false,
      identifiers:false
    }).files[0];
    assert.equal(output.code,source);
    assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
    const nativeFrame=await automaticReportFrame(source);
    const unsafeFrame=await automaticReportFrame(
      source.replaceAll('distinctivelyLongPrivateField','x')
    );
    assert.match(nativeFrame,/automatic-report-observer\.cjs:1:\d+/);
    assert.match(unsafeFrame,/automatic-report-observer\.cjs:1:\d+/);
    assert.notEqual(unsafeFrame,nativeFrame);
  }
});

test('diagnostic report trigger descriptor setters preserve source coordinates',async()=>{
  const source="'use strict';process.report.directory=__dirname;"+
    "process.report.filename='report.json';"+
    "const descriptor=Object.getOwnPropertyDescriptor("+
      "process.report,'reportOnUncaughtException');"+
    "descriptor.set.call(process.report,true);"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "throw new Error(String(value));";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'automatic-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-descriptor-setter',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
  const nativeFrame=await automaticReportFrame(source);
  const unsafeFrame=await automaticReportFrame(
    source.replaceAll('distinctivelyLongPrivateField','x')
  );
  assert.match(nativeFrame,/automatic-report-observer\.cjs:1:\d+/);
  assert.match(unsafeFrame,/automatic-report-observer\.cjs:1:\d+/);
  assert.notEqual(unsafeFrame,nativeFrame);
});

test('automatic uncaught-exception reports preserve source coordinates',async()=>{
  const source="'use strict';process.report.directory=__dirname;"+
    "process.report.filename='report.json';"+
    "process.report.reportOnUncaughtException=true;"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "throw new Error(String(value));";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'automatic-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-automatic',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
  const nativeFrame=await automaticReportFrame(source);
  const unsafeFrame=await automaticReportFrame(
    source.replaceAll('distinctivelyLongPrivateField','x')
  );
  assert.match(nativeFrame,/automatic-report-observer\.cjs:1:\d+/);
  assert.match(unsafeFrame,/automatic-report-observer\.cjs:1:\d+/);
  assert.notEqual(unsafeFrame,nativeFrame);
});

test('automatic report configuration aliases conservatively preserve source',()=>{
  const mutations=[
    'process.report.reportOnUncaughtException ||= true;',
    "Reflect.set(process.report,'reportOnUncaughtException',true);",
    'Object.assign(process.report,{reportOnFatalError:true});',
    "Object.assign(process.report,{['reportOnSignal']:true});",
    "(()=>{const mutate=Reflect.set;return mutate(process.report,'reportOnUncaughtException',true);})()",
    "(()=>{const mutate=Object.assign;return mutate(process.report,{reportOnFatalError:true});})()",
    "Reflect.apply(Reflect.set,Reflect,[process.report,'reportOnSignal',true])",
    "Object.assign.call(Object,process.report,{reportOnUncaughtException:true})",
    "(()=>{const {set}=Reflect;return set(process.report,'reportOnSignal',true);})()",
    "(()=>{const {assign}=Object;return assign(process.report,{reportOnFatalError:true});})()",
    "(()=>{const {assign=()=>null}=Object;return assign(process.report,{reportOnSignal:true});})()"
  ];
  for(const [index,mutation] of mutations.entries()) {
    const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
      "const value=owner.distinctivelyLongPrivateField;"+mutation+
      ";module.exports=value;";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
    const output=obfuscateFiles([{
      path:'automatic-report-config.cjs',
      sourceType:'commonjs',
      code:source
    }],{
      mode:'sno',
      seed:'agent1-process-report-config-'+index,
      strings:false,
      identifiers:false
    }).files[0];
    assert.equal(output.code,source);
    assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
  }
});

test('harmless process.report metadata writes retain property-renaming yield',()=>{
  const variants=[
    "process.report.filename='';",
    "const report=process.report;report.filename='';",
    "const {report}=process;report.filename='';",
    "process.report['filename']='';"
  ];
  for(const [index,metadata] of variants.entries()) {
    const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
      "const value=owner.distinctivelyLongPrivateField;"+metadata+
      "module.exports=value;";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
    const output=obfuscateFiles([{
      path:'process-report-metadata.cjs',
      sourceType:'commonjs',
      code:source
    }],{
      mode:'sno',
      seed:'agent1-process-report-metadata-positive-'+index,
      strings:false,
      identifiers:false
    }).files[0];
    assert.ok(output.metrics.properties>0,output.code);
  }
});

test('process.report.writeReport is admitted as a source observer without executing it',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "process.report.writeReport();module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-write',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
});

test('unsafe private-property rewrite changes process.report stack coordinates',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=JSON.stringify(process.report.getReport().javascriptStack);";
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=execute(source);
  const renamed=execute(unsafe);
  assert.notEqual(renamed,native);
  assert.match(String(renamed),/process-report-observer\.cjs:1:\d+/);
});

test('ordinary process metadata remains eligible for property renaming',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "const proc=process;module.exports=value+(proc['pid']>0?0:1);";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-positive',
    strings:false,
    identifiers:false
  }).files[0];
  assert.ok(output.metrics.properties>0,output.code);
  assert.equal(execute(output.code),execute(source));
});


test('destructured globalThis process preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {process:proc}=globalThis;return proc.report.getReport();})()",
    'agent8-process-global-destructure'
  );
});

test('Reflect.get globalThis process preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const proc=Reflect.get(globalThis,'process');return proc.report.getReport();})()",
    'agent8-process-global-reflect'
  );
});

test('shadowed process parameter does not suppress safe property renaming',()=>{
  const source="'use strict';function run(process){"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "return value+(process.report.filename.length?1:0);}"+
    "module.exports=run({report:{filename:''}});";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
  const output=obfuscateFiles([{
    path:'shadowed-process.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent8-shadowed-process-yield',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(execute(output.code),73);
  assert.ok(output.metrics.properties>0,output.code);
});


test('detached Reflect.get globalThis process preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {get}=Reflect;const proc=get(globalThis,'process');return proc.report.getReport();})()",
    'agent8-process-global-detached-reflect'
  );
});

test('shadowed process value escape does not suppress safe property renaming',()=>{
  const source="'use strict';function inspect(value){return value.report.filename.length;}"+
    "function run(process){const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;return value+inspect(process);}"+
    "module.exports=run({report:{filename:''}});";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
  const output=obfuscateFiles([{
    path:'shadowed-process-escape.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent8-shadowed-process-escape-yield',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(execute(output.code),73);
  assert.ok(output.metrics.properties>0,output.code);
});


test('const-computed globalThis process preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const key='process';const proc=globalThis[key];return proc.report.getReport();})()",
    'agent8-process-global-computed-key'
  );
});

test('const-computed Reflect.get globalThis process preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const key='process';const proc=Reflect.get(globalThis,key);return proc.report.getReport();})()",
    'agent8-process-global-reflect-computed-key'
  );
});


test('const-computed process report namespace preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const key='report';return process[key].getReport();})()",
    'agent8-process-report-computed-namespace'
  );
});

test('const-computed process report method preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const key='getReport';return process.report[key]();})()",
    'agent8-process-report-computed-method'
  );
});

test('const-computed automatic report trigger preserves source',()=>{
  const source="'use strict';const key='reportOnUncaughtException';"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "process.report[key]=true;module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'computed-report-trigger.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed:'agent8-computed-report-trigger',
    strings:false,identifiers:false
  }).files[0];
  assert.equal(output.code,source);
});

test('const-computed harmless report metadata retains property yield',()=>{
  const source="'use strict';const key='filename';process.report[key]='';"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
  const output=obfuscateFiles([{
    path:'computed-report-metadata.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed:'agent8-computed-report-metadata',
    strings:false,identifiers:false
  }).files[0];
  assert.equal(execute(output.code),73);
  assert.ok(output.metrics.properties>0,output.code);
});


test('opaque computed process report namespace preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "((key)=>process[key].getReport())('report')",
    'agent8-process-report-opaque-namespace'
  );
});

test('opaque computed process report method preserves diagnostic report coordinates',()=>{
  mustPreserveProcessReport(
    "((key)=>process.report[key]())('getReport')",
    'agent8-process-report-opaque-method'
  );
});

test('opaque computed automatic report write fails closed',()=>{
  const source="'use strict';function choose(){return 'reportOnUncaughtException';}"+
    "const key=choose();const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "process.report[key]=true;module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'opaque-report-trigger.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed:'agent8-opaque-report-trigger',
    strings:false,identifiers:false
  }).files[0];
  assert.equal(output.code,source);
});


test('explicit automatic-report disabling retains property yield',()=>{
  const mutations=[
    "process.report.reportOnUncaughtException=false;",
    "Reflect.set(process.report,'reportOnSignal',false);",
    "Object.assign(process.report,{reportOnFatalError:false});"
  ];
  for(const [index,mutation] of mutations.entries()){
    const source="'use strict';"+mutation+
      "const owner={distinctivelyLongPrivateField:73};"+
      "const value=owner.distinctivelyLongPrivateField;module.exports=value;";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
    const output=obfuscateFiles([{
      path:'report-disable-'+index+'.cjs',sourceType:'commonjs',code:source
    }],{
      mode:'sno',seed:'agent8-report-disable-'+index,
      strings:false,identifiers:false
    }).files[0];
    assert.equal(execute(output.code),73);
    assert.ok(output.metrics.properties>0,output.code);
  }
});


test('Reflect.get invocation wrappers preserve global process report coordinates',()=>{
  const expressions=[
    "(()=>{const proc=Reflect.get.call(Reflect,globalThis,'process');return proc.report.getReport();})()",
    "(()=>{const proc=Reflect.get.apply(Reflect,[globalThis,'process']);return proc.report.getReport();})()",
    "(()=>{const proc=Reflect.apply(Reflect.get,Reflect,[globalThis,'process']);return proc.report.getReport();})()",
    "(()=>{const get=Reflect.get.bind(Reflect);const proc=get(globalThis,'process');return proc.report.getReport();})()"
  ];
  for(const [index,expression] of expressions.entries())
    mustPreserveProcessReport(expression,'agent8-process-global-reflect-wrapper-'+index);
});

test('indirect Reflect.get env wrappers remain generic reflection refusals',()=>{
  const expressions=[
    "Reflect.get.call(Reflect,process,'env').PATH",
    "Reflect.get.apply(Reflect,[process,'env']).PATH",
    "Reflect.apply(Reflect.get,Reflect,[process,'env']).PATH",
    "(()=>{const get=Reflect.get.bind(Reflect);return get(process,'env').PATH;})()"
  ];
  for(const expression of expressions) {
    const source="'use strict';void ("+expression+");";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  }
});
