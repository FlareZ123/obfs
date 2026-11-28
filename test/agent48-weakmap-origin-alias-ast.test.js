'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Bounded local ownership summary witness. A source-reading mutation through
 * a native WeakMap prototype must conservatively veto foreign function-source
 * identifier rewrites. These AST checks isolate the compiler's entry guard;
 * the three-mode Node ESM parity suite performs the corresponding live proof.
 * @type {ReadonlyArray<{name:string,source:string,exposed:boolean}>}
 */
const cases=[
  {
    name:'direct WeakMap prototype is recognized',
    source:'const carrier={instance:new WeakMap()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'ordinary prototype retains positive scanner precision',
    source:'const carrier={instance:{}};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'join retains may alias after conditional rebinding',
    source:'const root={instance:{}};const left=root;let right=root;'+
      'if(false)right={instance:{}};left.instance=new WeakMap();'+
      'const nativePrototype=Object.getPrototypeOf(right.instance);',
    exposed:true
  },
  {
    name:'join does not erase a distinct branch WeakMap through a strong update',
    source:'const root={instance:{}};const left=root;let right=root;'+
      'if(true)right={instance:new WeakMap()};left.instance={};'+
      'const nativePrototype=Object.getPrototypeOf(right.instance);',
    exposed:true
  },
  {
    name:'nested may alias reachable through a child record',
    source:'const root={child:{instance:{}}};'+
      'const left=root.child;let right=root.child;'+
      'if(false)right={instance:{}};left.instance=new WeakMap();'+
      'const nativePrototype=Object.getPrototypeOf(right.instance);',
    exposed:true
  },
  {
    name:'Reflect.construct native WeakMap is an implicit carrier',
    source:'const carrier={instance:Reflect.construct(WeakMap,[])};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'computed Reflect construct static name is a native carrier',
    source:'const carrier={instance:Reflect["construct"](WeakMap,[])};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'bound local Reflect namespace constructs a native WeakMap',
    source:'const R=Reflect;const carrier={instance:R.construct(WeakMap,[])};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'globalThis Reflect and WeakMap construct nested native carrier',
    source:'const carrier={instance:globalThis.Reflect.construct(globalThis.WeakMap,[])};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'bound WeakMap constructor has a native instance',
    source:'const carrier={instance:new (WeakMap.bind(null))()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'zero-argument bound WeakMap constructs the same native brand',
    source:'const carrier={instance:new (WeakMap.bind())()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'aliased bound native WeakMap constructor is tracked',
    source:'const W=WeakMap.bind(null);const carrier={instance:new W()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'Reflect.get of native WeakMap constructs a native instance',
    source:'const carrier={instance:new (Reflect.get(globalThis,"WeakMap"))()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'native WeakMap from global own data descriptor',
    source:'const carrier={instance:new (Object.getOwnPropertyDescriptor(globalThis,"WeakMap").value)()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'native bind.call produces a WeakMap constructor',
    source:'const carrier={instance:new (Function.prototype.bind.call(WeakMap,null))()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'transparent Proxy of WeakMap retains native constructor',
    source:'const carrier={instance:new (new Proxy(WeakMap,{}))()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'Reflect.construct of local ordinary class remains eligible',
    source:'class Ordinary{}const carrier={instance:Reflect.construct(Ordinary,[])};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'ordinary class bind.call constructor remains eligible',
    source:'class Ordinary{}const carrier={instance:new (Function.prototype.bind.call(Ordinary,null))()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'transparent Proxy of ordinary class remains eligible',
    source:'class Ordinary{}const carrier={instance:new (new Proxy(Ordinary,{}))()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'ordinary constructor bound alias remains eligible',
    source:'class Ordinary{}const O=Ordinary.bind(null);const carrier={instance:new O()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'WeakMap constructor through temporary object literal member',
    source:'const C=({ctor:WeakMap}).ctor;const carrier={instance:new C()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'WeakMap constructor through temporary array literal index',
    source:'const C=[WeakMap][0];const carrier={instance:new C()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'WeakMap constructor through Object.values literal array',
    source:'const C=Object.values({ctor:WeakMap})[0];const carrier={instance:new C()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'WeakMap constructor from named record binding',
    source:'const holder={ctor:WeakMap};const C=holder.ctor;'+
      'const carrier={instance:new C()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'WeakMap constructor written after record initialization',
    source:'const holder={ctor:Object};holder.ctor=WeakMap;'+
      'const carrier={instance:new holder.ctor()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'ordinary constructor through literal object member remains eligible',
    source:'class Ordinary{}const C=({ctor:Ordinary}).ctor;'+
      'const carrier={instance:new C()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'ordinary constructor through literal array index remains eligible',
    source:'class Ordinary{}const C=[Ordinary][0];'+
      'const carrier={instance:new C()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'WeakMap written through local record alias is tracked',
    source:'const holder={ctor:Object};const alias=holder;alias.ctor=WeakMap;'+
      'const carrier={instance:new holder.ctor()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'WeakMap written through local helper parameter is tracked',
    source:'function install(target){target.ctor=WeakMap;}'+
      'const holder={ctor:Object};install(holder);'+
      'const carrier={instance:new holder.ctor()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'WeakMap written through immediate function parameter is tracked',
    source:'const holder={ctor:Object};'+
      '(function(target){target.ctor=WeakMap;})(holder);'+
      'const carrier={instance:new holder.ctor()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:true
  },
  {
    name:'ordinary helper parameter remains a positive rename candidate',
    source:'class Ordinary{}function install(target){target.ctor=Ordinary;}'+
      'const holder={ctor:Object};install(holder);'+
      'const carrier={instance:new holder.ctor()};'+
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
    exposed:false
  },
  {
    name:'nested distinct branch retains WeakMap after other child rewrite',
    source:'const root={child:{instance:{}}};'+
      'const left=root.child;let right=root.child;'+
      'if(true)right={instance:new WeakMap()};left.instance={};'+
      'const nativePrototype=Object.getPrototypeOf(right.instance);',
    exposed:true
  }
];
for(const fixture of cases){
  test('WeakMap origin provenance AST: '+fixture.name,()=>{
    const ast=parse(fixture.source,'module');
    assert.equal(hasWeakMapPrototypeExposure(ast),fixture.exposed,fixture.name);
  });
}
