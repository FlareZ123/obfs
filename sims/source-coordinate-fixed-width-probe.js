'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {Console}=require('node:console');
const {Writable}=require('node:stream');
const vm=require('node:vm');

const originalKey='veryLongPrivateField';
const rewrittenKey='p_'+createHash('sha256')
  .update('agent50/equal-width-key').digest('hex').slice(0,originalKey.length-2);
assert.equal(rewrittenKey.length,originalKey.length);

/**
 * Capture only frames belonging to the fixed-name VM program. Excluding
 * differently located test harness frames prevents a false source mismatch.
 * @param {string} source
 * @returns {{serialized:string,sourceFrames:string}}
 */
function execute(source) {
  let printed='';
  const sink=new Writable({
    write(chunk,encoding,done) {
      printed+=chunk.toString();
      done();
    }
  });
  const context={module:{exports:null},require,
    console:new Console({stdout:sink,stderr:sink})};
  vm.runInNewContext(source,context,{filename:'fixed-width-rewrite.cjs',timeout:1000});
  return {serialized:JSON.stringify(context.module.exports),
    sourceFrames:printed.split('\n').filter(line=>
      line.includes('fixed-width-rewrite.cjs:')).join('\n')};
}

const cases=[
  {name:'console.trace',
    ending:"console.trace();module.exports=value;"},
  {name:'Error printed through native Console',
    ending:"console.error(new Error('probe'));module.exports=value;"},
  {name:'Node util.getCallSites',
    ending:"module.exports=[value,require('node:util').getCallSites(1)[0].columnNumber];"}
];

for(const item of cases) {
  const source="'use strict';const owner={"+originalKey+":73};"+
    "const value=owner."+originalKey+";"+item.ending;
  const equalWidth=source.replaceAll(originalKey,rewrittenKey);
  const shortened=source.replaceAll(originalKey,'x');
  assert.equal(equalWidth.length,source.length);
  const original=execute(source);
  const padded=execute(equalWidth);
  const short=execute(shortened);
  assert.deepEqual(padded,original,item.name+' equal-width rewrite');
  assert.notDeepEqual(short,original,item.name+' shortened rewrite');
  process.stdout.write(JSON.stringify({
    scenario:item.name,keyLength:originalKey.length,
    original,rewritten:padded,shortened:short
  })+'\n');
}
