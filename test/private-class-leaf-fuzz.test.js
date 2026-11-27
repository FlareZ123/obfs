'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');
const {neutralizeHashedNames}=require('../sims/offline-normalize');

/** @type {Array<'coo'|'sno'|'sco'>} */
const MODES=['coo','sno','sco'];

/** @param {string} source @returns {string|undefined} */
function run(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{filename:'class-matrix.cjs',timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * Construct a finite closed-world class-leaf graph with independently
 * varied class binding, receiver count, call count, lexical nesting and
 * statically computed owner-key reads. All data values are inert primitives.
 *
 * @param {number} id
 * @returns {string}
 */
function positive(id){
  const type=id%2===0?'declaration':'expression';
  const receivers=1+((id>>1)%3);
  const nested=(id&8)!==0;
  const computed=(id&16)!==0;
  const field='secretValue'+id;
  const bias='biasField'+id;
  const name='Reader'+id;
  const method='read'+id;
  const methodName=(id&32)!==0?`["${method}"]`:`${method}`;
  const read=computed?`owner["${field}"]`:`owner.${field}`;
  const define=type==='declaration'?
    `class ${name}{${methodName}(){return ${read};}}`:
    `const ${name}=class{${methodName}(){return ${read};}};`;
  const instanceLines=Array.from({length:receivers},(_,index)=>
    `const receiver${index}=new ${name}();`);
  const sum=instanceLines.map((_,index)=>`receiver${index}.${method}()`)
    .concat(`owner.${bias}`).join('+');
  const body=[
    `const owner={${field}:${7+(id%97)},${bias}:${3+(id%11)}};`,
    define,...instanceLines
  ];
  if(nested){
    return ["'use strict';",`function execute${id}(){`,...body,
      `return ${sum};`,'}',`module.exports=execute${id}();`].join('\n');
  }
  return ["'use strict';",...body,`module.exports=${sum};`].join('\n');
}

/**
 * Perturb a positive class pattern at one deliberate source-privacy gate.
 * The emitted candidate must preserve original field spellings.
 * @param {number} id
 * @returns {{label:string,source:string}}
 */
function negative(id){
  const n=id%16;
  const field='secretValue'+id;
  const bias='biasField'+id;
  const name='Reader'+id;
  const method='read'+id;
  const owner=`const owner={${field}:23,${bias}:7};`;
  let cls=`class ${name}{${method}(){return owner.${field};}}`;
  let instance=`const receiver=new ${name}();`;
  let output=`module.exports=receiver.${method}()+owner.${bias};`;
  let extra='';
  const labels=[
    'instance alias','instance export','computed invocation','method toString',
    'named class expression','mutable class expression','extends Object',
    'extra method statement','nonzero parameter','constructor args',
    'second instance leaks','prototype reflection','inline constructor',
    'detached method invocation','direct eval class source','sloppy with scope'
  ];
  if(n===0) {
    extra='const alias=receiver;';
    output=`module.exports=alias.${method}()+owner.${bias};`;
  }
  if(n===1)output=`module.exports=[receiver,receiver.${method}(),owner.${bias}];`;
  if(n===2)output=`module.exports=receiver["${method}"]()+owner.${bias};`;
  if(n===3)output=`module.exports=receiver.${method}.toString().includes("${field}");`;
  if(n===4)cls=`const ${name}=class Internal{${method}(){return owner.${field};}};`;
  if(n===5)cls=`let ${name}=class{${method}(){return owner.${field};}};`;
  if(n===6)cls=`class ${name} extends Object{${method}(){return owner.${field};}}`;
  if(n===7)cls=`class ${name}{${method}(){const local=owner.${field};return local;}}`;
  if(n===8)cls=`class ${name}{${method}(unused){return owner.${field};}}`;
  if(n===9)instance=`const receiver=new ${name}(3);`;
  if(n===10){
    extra=`const other=new ${name}();`;
    output=`module.exports=[other,receiver.${method}()+owner.${bias}];`;
  }
  if(n===11)output=`module.exports=[${name}.prototype.${method}.toString(),receiver.${method}()+owner.${bias}];`;
  if(n===12)output=`module.exports=new ${name}().${method}()+owner.${bias};`;
  if(n===13)output=`module.exports=(0,receiver.${method})()+owner.${bias};`;
  if(n===14)output=`module.exports=[receiver.${method}()+owner.${bias},eval("${name}.prototype.${method}.toString()").includes("${field}")];`;
  if(n===15) {
    extra=`with({}){module.exports=receiver.${method}()+owner.${bias};}`;
    output='';
  }
  return {label:labels[n],source:[n===15?'':"'use strict';",owner,cls,instance,extra,output].join('\n')};
}

test('seeded 64-case positive matrix keeps 192 mode outputs and private-key rewrites',()=>{
  let rewrites=0,attackerRecovered=0;
  for(let id=0;id<64;id++){
    const source=positive(id);
    const expected=run(source);
    assert.ok(expected!==undefined);
    for(const mode of MODES){
      const output=obfuscateFiles([{
        path:'class-matrix.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'class-leaf-positive-matrix/'+id+'/'+mode,
        properties:true,identifiers:false,strings:false}).files[0];
      assert.equal(output.metrics.properties,2,id+'/'+mode+': positive owner keys');
      assert.equal(run(/** @type {string} */(output.code)),expected,id+'/'+mode+': runtime parity');
      const normalized=neutralizeHashedNames([{
        path:'class-matrix.cjs',sourceType:'commonjs',code:/** @type {string} */(output.code)
      }]);
      assert.equal(normalized.properties,2,id+'/'+mode+': public key neutralization');
      assert.equal(run(normalized.files[0].code),expected,id+'/'+mode+': public clone parity');
      rewrites+=2;
      attackerRecovered+=normalized.properties;
    }
  }
  process.stdout.write('CLASS_LEAF_FUZZ_POSITIVE '+JSON.stringify({
    scenarios:64,modeCases:192,rewrites,attackerRecovered
  })+'\n');
});

test('seeded 32-case refusal matrix keeps 96 mode outputs without unsafe rewrites',()=>{
  let refusals=0;
  for(let id=0;id<32;id++){
    const {label,source}=negative(id);
    const expected=run(source);
    assert.ok(expected!==undefined,id+'/'+label+': reference must have an export');
    for(const mode of MODES){
      const output=obfuscateFiles([{
        path:'class-matrix.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'class-leaf-negative-matrix/'+id+'/'+mode,
        properties:true,identifiers:false,strings:false}).files[0];
      assert.equal(output.metrics.properties,0,id+'/'+mode+'/'+label+': refusal');
      assert.equal(run(/** @type {string} */(output.code)),expected,
        id+'/'+mode+'/'+label+': exact parity');
      refusals++;
    }
  }
  process.stdout.write('CLASS_LEAF_FUZZ_REFUSAL '+JSON.stringify({
    scenarios:32,modeCases:96,refusals
  })+'\n');
});
