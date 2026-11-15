'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {layerXorFunctions}=require('../workplace/layered-mba');
const {recoverLayeredMba}=require('../sims/mba-layered-recover');

/** @param {string} source @returns {(x:number,y:number)=>number} */
function compile(source){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:3000});
  return /** @type {(x:number,y:number)=>number} */ (context.module.exports);
}
/** @param {number} x @returns {number} */
function scramble(x){return Math.imul(x^(x>>>13),97153)|0;}

test('an independent two-stage attacker reconstructs layered MBA over 100 seeds',()=>{
  const programs=[
    'function f(x,y){return (x^y)|0;}module.exports=f;',
    'function f(x,y){return ((x^y)+17)|0;}module.exports=f;',
    'function f(x,y){return (((x^7)-(y^13))|0);}module.exports=f;',
    'function f(x,y){return (((x^y)&31)>>>3);}module.exports=f;'
  ];
  let recovered=0;
  for(const [index,source] of programs.entries()){
    const native=compile(source);
    for(let seed=0;seed<25;seed++){
      const compiled=layerXorFunctions(source,{sourceType:'commonjs',
        seed:'hidden-seed/'+index+'/'+seed,names:['f']});
      assert.equal(compiled.rewrites,1);
      const attack=recoverLayeredMba(compiled.code);
      assert.equal(attack.composed,1,'Unrecovered layered identity '+index+' seed '+seed);
      const attacker=compile(attack.code);
      for(let trial=0;trial<750;trial++){
        const x=scramble(seed*299+trial*17),y=scramble(index*53+trial*113);
        assert.equal(attacker(x,y),native(x,y));
      }
      recovered++;
    }
  }
  assert.equal(recovered,100);
});

test('generated layered sample is restored to short readable operators',()=>{
  const before=readFileSync(path.join(__dirname,'../samples/mba-layered-before.cjs'),'utf8');
  const after=readFileSync(path.join(__dirname,'../samples/mba-layered-after.cjs'),'utf8');
  const recovered=recoverLayeredMba(after);
  assert.equal(recovered.composed,1);
  assert.ok(recovered.code.includes('x^y'));
  assert.ok(recovered.code.length<after.length);
  const native=compile(before),attacker=compile(recovered.code);
  for(let i=0;i<2000;i++)assert.equal(attacker(scramble(i),scramble(i+31)),native(scramble(i),scramble(i+31)));
});

test('generalized repeated-mask cancellation declines effects and getters',()=>{
  for(const source of [
    'function f(x,y){return ((x^m())^(y^m()));}',
    'function f(x,y){return ((x^obj.mask)^(y^obj.mask));}',
    'function f(x,y){return ((x^m++)^(y^m++));}'
  ]){
    const attack=recoverLayeredMba(source);
    assert.equal(attack.composed,0);
    assert.equal(attack.code,source);
  }
});
