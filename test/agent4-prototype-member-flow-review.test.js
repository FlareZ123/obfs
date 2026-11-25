'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @param {{trustedPrototypeSemantics?:boolean}} [options] @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source,options) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs',options);
}

/** @param {string} source @param {{trustedPrototypeSemantics?:boolean}} [options] @returns {ReturnType<typeof analyze>['summaries'][number]} */
function hiddenSummary(source,options) {
  const summary=analyze(source,options).summaries.find(item=>item.bindingNames.includes('hidden'));
  assert.ok(summary,'hidden must have an analysis summary');
  return summary;
}

/** @param {string} source @returns {unknown} */
function invokeExternal(source) {
  let observed;
  /** @type {{module:{exports:unknown},external:(value:unknown)=>void}} */
  const context={
    module:{exports:null},
    external(value){observed=value;}
  };
  vm.runInNewContext(source,context);
  const entry=context.module.exports;
  assert.equal(typeof entry,'function');
  /** @type {()=>void} */
  const invoke=/** @type {()=>void} */ (entry);
  invoke();
  return observed;
}


/** @param {string} source @param {string} preloader @returns {unknown} */
function invokeExternalWithPreloader(source,preloader) {
  let observed;
  /** @type {{module:{exports:unknown},external:(value:unknown)=>void}} */
  const context={
    module:{exports:null},
    external(value){observed=value;}
  };
  vm.runInNewContext(preloader,context);
  vm.runInNewContext(source,context);
  const entry=context.module.exports;
  assert.equal(typeof entry,'function');
  /** @type {()=>void} */
  const invoke=/** @type {()=>void} */ (entry);
  invoke();
  return observed;
}

/** @param {string} source @returns {unknown} */
function invokeExternalConstructor(source) {
  /** @type {unknown[]} */
  const observed=[];
  /** @type {{module:{exports:unknown},external:(value:unknown)=>void}} */
  const context={
    module:{exports:null},
    external(value){observed.push(value);}
  };
  vm.runInNewContext(source,context);
  const entry=context.module.exports;
  assert.equal(typeof entry,'function');
  /** @type {()=>void} */
  const invoke=/** @type {()=>void} */ (entry);
  invoke();
  const constructor=observed[0];
  assert.equal(typeof constructor,'function');
  /** @type {new()=>{callback:unknown}} */
  const Constructable=/** @type {new()=>{callback:unknown}} */ (constructor);
  return new Constructable().callback;
}

/** @param {string} source @param {string} message */
function assertHeldAndObserved(source,message) {
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function',message);
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'hidden',message);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,message);
  assert.equal(summary.safe,false,message);
}

test('function-constructor prototype property assignment exposes its callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'Local.prototype.callback is inherited by the constructed instance');
});

test('class prototype property assignment exposes its callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the assigned class prototype callback is inherited by the instance');
});

test('function-constructor prototype replacement exposes its callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Local.prototype={callback:hidden};'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the replacement prototype object supplies callback');
});

test('a function-constructor prototype method returns its receiver callback',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'Local.prototype.reveal=function(){return this.callback;};'+
    'const owner=new Local();'+
    'external(owner.reveal());'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the prototype method returns the callback on the instance receiver');
});

test('a class prototype method returns its receiver callback',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{}'+
    'Local.prototype.callback=hidden;'+
    'Local.prototype.reveal=function(){return this.callback;};'+
    'const owner=new Local();'+
    'external(owner.reveal());'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the class prototype method returns the callback on the instance receiver');
});

test('a derived class inherits a callable assigned to the base prototype',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Base{}'+
    'Base.prototype.callback=hidden;'+
    'class Derived extends Base{}'+
    'const owner=new Derived();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the derived instance inherits the callable base prototype field');
});

test('a function constructor returning an object exposes the replacement object field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){return {callback:hidden};}'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the explicit object return replaces the constructed instance');
});

test('a class constructor returning an object overrides its declared callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{callback=()=>0;constructor(){return {callback:hidden};}}'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the constructor object return overrides the initialized class field');
});

test('a prototype getter exposes its returned callable through a property read',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Object.defineProperty(Local.prototype,"callback",{get(){return hidden;}});'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the prototype getter returns hidden when callback is read');
});


test('a function-constructor own assignment shadows its prototype callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){this.callback=harmless;}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  assert.equal(hiddenSummary(source).hostHeldCallable,true,'default mode must fail closed without the trusted-prototype contract');
  const summary=hiddenSummary(source,{trustedPrototypeSemantics:true});
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a class instance field shadows its prototype callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'class Local{callback=harmless;}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  assert.equal(hiddenSummary(source).hostHeldCallable,true,'default mode must fail closed without the trusted-prototype contract');
  const summary=hiddenSummary(source,{trustedPrototypeSemantics:true});
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a later own assignment shadows its prototype callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=harmless;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  assert.equal(hiddenSummary(source).hostHeldCallable,true,'default mode must fail closed without the trusted-prototype contract');
  const summary=hiddenSummary(source,{trustedPrototypeSemantics:true});
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a source-local Object.prototype setter invalidates the trusted prototype-shadow proof',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'const values=new WeakMap();'+
    'Object.defineProperty(Object.prototype,"callback",{configurable:true,'+
      'get(){return values.get(Object.getPrototypeOf(this))??values.get(this);},'+
      'set(value){values.set(this,value);}});'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=function harmless(){return 0;};'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
  assert.equal(hiddenSummary(source,{trustedPrototypeSemantics:true}).hostHeldCallable,true);
});

test('trusted prototype semantics is unsound when an external preloader violates the contract',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=harmless;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const preloader=
    'const values=new WeakMap();'+
    'Object.defineProperty(Object.prototype,"callback",{configurable:true,'+
      'get(){return values.get(Object.getPrototypeOf(this))??values.get(this);},'+
      'set(value){values.set(this,value);}});';
  const observed=invokeExternalWithPreloader(source,preloader);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
  assert.equal(hiddenSummary(source,{trustedPrototypeSemantics:true}).hostHeldCallable,false,
    'the opt-in is valid only when its no-hostile-preloader contract is actually true');
});

test('an aliased constructor exposed to the host invalidates prototype-shadow proof',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'const Alias=Local;'+
    'Alias.prototype.callback=hidden;'+
    'external(Local);'+
    'const owner=new Alias();'+
    'owner.callback=harmless;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternalConstructor(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
  assert.equal(hiddenSummary(source,{trustedPrototypeSemantics:true}).hostHeldCallable,true,
    'an aliased constructor is not eligible for the local prototype-shadow proof');
});

/** @param {string} source */
function assertHeldButRuntimeSendsHarmless(source) {
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
  assert.equal(hiddenSummary(source,{trustedPrototypeSemantics:true}).hostHeldCallable,true);
}

test('conditional constructor writes do not prove an own-property shadow',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(flag){if(flag)this.callback=harmless;}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local(true);'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldButRuntimeSendsHarmless(source);
});

test('dynamic instance property writes do not prove an own-property shadow',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'const key="callback";'+
    'owner[key]=harmless;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldButRuntimeSendsHarmless(source);
});

test('an instance alias invalidates the own-property shadow proof',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=harmless;'+
    'const alias=owner;'+
    'external(alias.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldButRuntimeSendsHarmless(source);
});

test('multiple instances invalidate the own-property shadow proof',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=harmless;'+
    'external(owner.callback);'+
    'const other=new Local();'+
    'external(other.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source);
});

test('deleting an own shadow invalidates the prototype proof',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=harmless;'+
    'delete owner.callback;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source);
});
