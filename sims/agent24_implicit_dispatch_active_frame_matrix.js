// Runtime witness matrix for implicit JavaScript protocol/internal-method dispatch.
// Intentionally CommonJS/sloppy at top level: the WithStatement control requires it.
// The external callbacks and Proxy traps are created with Function() to remain sloppy.
const assert = require('node:assert/strict');

function makeObservation(label) {
  const observation = { label, source: null, name: null };
  const external = Function('observation',
    'return function external(){' +
      'const fn=arguments.callee.caller.caller;' +
      'observation.source=Function.prototype.toString.call(fn);' +
      'observation.name=fn && fn.name;' +
    '}'
  )(observation);
  return { observation, external };
}
function check(label, observation, expectedName) {
  assert.equal(observation.name, expectedName, `${label}: captured function name`);
  assert.ok(observation.source.includes(`function ${expectedName}`), `${label}: exact source captured`);
  console.log(`${label}: captured ${observation.name}`);
}

{
  const {observation, external} = makeObservation('for-of');
  const iterable = {
    [Symbol.iterator]: function iterator(){ return this; },
    next: function next(){ external(); return {done:true}; }
  };
  function hiddenForOf(value){ for (const item of value) {} }
  hiddenForOf(iterable);
  check('for-of/IteratorNext', observation, 'hiddenForOf');
}
{
  const {observation, external} = makeObservation('in');
  const has = Function('external', 'return function has(target,key){external();return false;}')(external);
  function hiddenIn(value){ return 'x' in value; }
  hiddenIn(new Proxy({}, {has}));
  check('in/ProxyHas', observation, 'hiddenIn');
}
{
  const {observation, external} = makeObservation('for-in-ownKeys');
  const ownKeys = Function('external', 'return function ownKeys(target){external();return [];}')(external);
  function hiddenForInOwnKeys(value){ for (const key in value) {} }
  hiddenForInOwnKeys(new Proxy({}, {ownKeys}));
  check('for-in/ProxyOwnKeys', observation, 'hiddenForInOwnKeys');
}
{
  const {observation, external} = makeObservation('for-in-getPrototypeOf');
  const getPrototypeOf = Function('external', 'return function getPrototypeOf(target){external();return null;}')(external);
  function hiddenForInPrototype(value){ for (const key in value) {} }
  hiddenForInPrototype(new Proxy({}, {getPrototypeOf}));
  check('for-in/ProxyGetPrototypeOf', observation, 'hiddenForInPrototype');
}
{
  const {observation, external} = makeObservation('instanceof');
  const hasInstance = Function('external', 'return function hasInstance(value){external();return false;}')(external);
  const C = {[Symbol.hasInstance]: hasInstance};
  function hiddenInstance(value){ return value instanceof C; }
  hiddenInstance({});
  check('instanceof/CustomHasInstance', observation, 'hiddenInstance');
}
{
  const {observation, external} = makeObservation('delete');
  const deleteProperty = Function('external', 'return function deleteProperty(target,key){external();return true;}')(external);
  function hiddenDelete(value){ delete value.x; }
  hiddenDelete(new Proxy({}, {deleteProperty}));
  check('delete/ProxyDelete', observation, 'hiddenDelete');
}
{
  const {observation, external} = makeObservation('object-destructure');
  const get = Function('external', 'return function get(target,key,receiver){if(key===\'x\')external();return 1;}')(external);
  function hiddenObjectDestructure(value){ const {x}=value; return x; }
  hiddenObjectDestructure(new Proxy({}, {get}));
  check('object-destructure/ProxyGet', observation, 'hiddenObjectDestructure');
}
{
  const {observation, external} = makeObservation('array-destructure');
  const iterable = {
    [Symbol.iterator]: function iterator(){ return this; },
    next: function next(){ external(); return {done:true}; }
  };
  function hiddenArrayDestructure(value){ const [x]=value; return x; }
  hiddenArrayDestructure(iterable);
  check('array-destructure/IteratorNext', observation, 'hiddenArrayDestructure');
}
{
  const {observation, external} = makeObservation('with');
  const has = Function('external', 'return function has(target,key){if(key===\'x\'){external();return true;}return false;}')(external);
  function hiddenWith(){ with (new Proxy({}, {has})) { x; } }
  hiddenWith();
  check('with/ProxyHas', observation, 'hiddenWith');
}
{
  const {observation, external} = makeObservation('proxy-set');
  const set = Function('external', 'return function set(target,key,value,receiver){external();return true;}')(external);
  function hiddenSet(value){ value.x=1; }
  hiddenSet(new Proxy({}, {set}));
  check('assignment/ProxySet', observation, 'hiddenSet');
}
{
  const {observation, external} = makeObservation('accessor-setter');
  const setter = Function('external', 'return function setX(value){external();}')(external);
  const target = {};
  Object.defineProperty(target, 'x', {set: setter});
  function hiddenSetter(value){ value.x=1; }
  hiddenSetter(target);
  check('assignment/AccessorSetter', observation, 'hiddenSetter');
}
console.log('All implicit-dispatch active-frame witnesses passed.');
