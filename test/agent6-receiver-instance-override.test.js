'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runInNewContext}=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source @returns {unknown[]} */
function execute(source) {
  /** @type {unknown[]} */
  const captured=[];
  runInNewContext(source,{external(value){captured.push(value);}});
  return captured;
}

/** @param {string} source @returns {ReturnType<ReturnType<typeof analyze>['summaries']['slice']>[number]} */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(item=>item.bindingNames.includes('hidden'));
  assert.ok(summary,'hidden must have an analysis summary');
  return summary;
}

test('constructor callable write overrides a prototype method and must be held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return 0;}constructor(){this.callback=hidden;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(/** @type {any} */(actual)?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('constructor primitive write shadows a prototype method without holding its closure',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return hidden;}constructor(){this.callback=1;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  const summary=hiddenSummary(source);assert.equal(summary.hostHeldCallable,false,JSON.stringify(summary.reasons));
});

test('conditional constructor callable write remains held when its branch executes',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return 0;}constructor(flag){if(flag)this.callback=hidden;}}'+
    'const instance=new Local(true);external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(/** @type {any} */(actual)?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an own class field shadows a same-named prototype method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return hidden;}callback=1;}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  const summary=hiddenSummary(source);assert.equal(summary.hostHeldCallable,false,JSON.stringify(summary.reasons));
});

test('a post-construction callable write overrides a prototype method and must be held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return 0;}}'+
    'const instance=new Local();instance.callback=hidden;external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(/** @type {any} */(actual)?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a child constructor primitive write shadows an inherited callable method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{callback(){return hidden;}}'+
    'class Local extends Base{constructor(){super();this.callback=1;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  const summary=hiddenSummary(source);assert.equal(summary.hostHeldCallable,false,JSON.stringify(summary.reasons));
});

test('a child constructor callable write shadows an inherited method and must be held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{callback(){return 0;}}'+
    'class Local extends Base{constructor(){super();this.callback=hidden;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(/** @type {any} */(actual)?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an unshadowed prototype method remains a host-reachable closure control',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return hidden;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(typeof actual,'function');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a dynamic constructor write cannot hide a callable receiver value',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return 0;}constructor(key){this[key]=hidden;}}'+
    'const instance=new Local("callback");external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(/** @type {any} */(actual)?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('a conditional primitive constructor write keeps prototype callables conservatively held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback(){return hidden;}constructor(flag){if(flag)this.callback=1;}}'+
    'const instance=new Local(true);external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a base constructor own write shadows its prototype method for derived instances',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{callback(){return hidden;}constructor(){this.callback=1;}}'+
    'class Local extends Base{}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  const summary=hiddenSummary(source);assert.equal(summary.hostHeldCallable,false,JSON.stringify(summary.reasons));
});


test('an unused local return does not publish its callable value',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function local(){return hidden;}'+
    'local();';
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
});

test('a local return value passed directly to the host is held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function local(){return hidden;}'+
    'external(local());';
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a host-held function propagates a returned arrow closure and its captures',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function outer(){return ()=>hidden;}'+
    'external(outer);';
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a host-held wrapper propagates call-return values transitively',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function local(){return hidden;}'+
    'function outer(){return local();}'+
    'external(outer);';
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('an exported bound function exposes callable values returned through its receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function outer(){return this.callback;}'+
    'const bound=outer.bind({callback:hidden});'+
    'module.exports=bound;';
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an exported unbound function does not inherit an unrelated local receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function outer(){return this.callback;}'+
    'module.exports=outer;';
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
});


test('a constructor callable write is not a host escape while its instance stays local',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{constructor(){this.callback=hidden;}}'+
    'const instance=new Local();instance.callback();';
  execute(source);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
});

test('a later primitive constructor write cancels an earlier callable own value',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{constructor(){this.callback=hidden;this.callback=1;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
});

test('an escaping instance publishes its final constructor callable property',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{constructor(){this.callback=hidden;}}'+
    'const instance=new Local();external(instance);';
  execute(source);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('a base constructor primitive own write shadows a derived prototype method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{constructor(){this.callback=1;}}'+
    'class Local extends Base{callback(){return hidden;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
});

test('a base constructor callable own write shadows a derived prototype method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{constructor(){this.callback=hidden;}}'+
    'class Local extends Base{callback(){return 0;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal((/** @type {Function} */ (actual)).name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a derived primitive constructor write overwrites a base callable own write',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{constructor(){this.callback=hidden;}}'+
    'class Local extends Base{constructor(){super();this.callback=1;}}'+
    'const instance=new Local();external(instance.callback);';
  const [actual]=execute(source);
  assert.equal(actual,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
});
