'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Observe the strict CommonJS target wrapper frame from a sloppy host callback.
 * @param {string} source
 * @returns {Promise<{value:number,line:number,column:number,frame:string}>}
 */
async function observeFrame(source) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-private-class-unsupported-'));
  try {
    const preload=path.join(directory,'preload.cjs');
    const runner=path.join(directory,'runner.cjs');
    const target=path.join(directory,'target.cjs');
    await writeFile(preload,
      "const nativeIsArray=Array.isArray;\n"+
      "Array.isArray=function observedIsArray(value){\n"+
      "  if(globalThis.__obfsPrivateClassArmed){globalThis.__obfsPrivateClassStack=new Error().stack;}\n"+
      "  return nativeIsArray(value);\n"+
      "};\n",'utf8');
    await writeFile(runner,
      "globalThis.__obfsPrivateClassArmed=false;\n"+
      "globalThis.__obfsPrivateClassStack=null;\n"+
      "const value=require(process.argv[2]);\n"+
      "process.stdout.write(JSON.stringify({value,stack:globalThis.__obfsPrivateClassStack}));\n",
      'utf8');
    await writeFile(target,source,'utf8');
    const child=spawnSync(process.execPath,['-r',preload,runner,target],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,child.stderr);
    const parsed=/** @type {{value:number,stack:string|null}} */ (JSON.parse(child.stdout));
    assert.ok(parsed.stack,'the host callback must capture an Error stack');
    const frame=parsed.stack.split('\n').find(line=>line.includes('target.cjs'));
    assert.ok(frame,'the stack must include the target CommonJS wrapper frame: '+parsed.stack);
    const match=frame.match(/target\.cjs:(\d+):(\d+)\)?$/);
    assert.ok(match,'the target frame must expose line and column: '+frame);
    return {value:parsed.value,line:Number(match[1]),column:Number(match[2]),frame};
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

const fixtures=[
  {
    name:'shorthand owner key',
    expected:7,
    source:[
      "'use strict';",
      'const longPrivatePropertyName=7;',
      'const owner={longPrivatePropertyName};',
      'class Reader{read(){return owner.longPrivatePropertyName;}}',
      'const reader=new Reader();',
      'globalThis.__obfsPrivateClassArmed=true;Array.isArray([1,2]);globalThis.__obfsPrivateClassArmed=false;',
      'module.exports=reader.read();'
    ].join('')
  },
  {
    name:'destructuring-pattern owner read',
    expected:14,
    source:[
      "'use strict';",
      'const owner={longPrivatePropertyName:7};',
      'const {longPrivatePropertyName:copy}=owner;',
      'class Reader{read(){return owner.longPrivatePropertyName;}}',
      'const reader=new Reader();',
      'globalThis.__obfsPrivateClassArmed=true;Array.isArray([1,2]);globalThis.__obfsPrivateClassArmed=false;',
      'module.exports=reader.read()+copy;'
    ].join('')
  }
  {
    name:'in-check owner read',
    expected:7,
    source:[
      "'use strict';",
      'const owner={longPrivatePropertyName:7};',
      "const hasKey='longPrivatePropertyName' in owner;",
      'class Reader{read(){return owner.longPrivatePropertyName;}}',
      'const reader=new Reader();',
      'globalThis.__obfsPrivateClassArmed=true;Array.isArray([1,2]);globalThis.__obfsPrivateClassArmed=false;',
      'module.exports=reader.read()+(hasKey?0:1);'
    ].join('')
  },
];

for(const fixture of fixtures){
  for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
    test(mode+' '+fixture.name+' conservatively refuses unsupported span edits',async()=>{
      const output=obfuscateFiles([{
        path:'private-class-unsupported.cjs',sourceType:'commonjs',code:fixture.source
      }],{
        mode,closedWorld:true,seed:'private-class-unsupported/'+mode+'/'+fixture.name,
        properties:true,identifiers:false,strings:false
      });
      assert.equal(output.files[0].metrics.properties,0,
        'unsupported syntax must not receive a property rewrite');
      const native=await observeFrame(fixture.source);
      const emitted=await observeFrame(String(output.files[0].code));
      assert.equal(native.value,fixture.expected);
      assert.equal(emitted.value,fixture.expected);
      assert.equal(emitted.line,native.line);
      assert.equal(emitted.column,native.column,
        'a refused property rewrite must preserve host-observed FramePosition; '+
        'native='+native.frame+', emitted='+emitted.frame);
    });
  }
}
