import {createEngine} from './engine.mjs';
import {hostValue} from './host.mjs';

const schema={externalFormat:'audit-v1',auditCount:3};
function inspectRecord(key) {
  const keys=Reflect.ownKeys(schema).sort();
  const value=Object.prototype.hasOwnProperty.call(schema,key)?schema[key]:'<missing>';
  const enumerable=Object.getOwnPropertyDescriptor(schema,key)?.enumerable===true;
  return {keys,value,enumerable};
}

export function evaluate(input) {
  const engine=createEngine(input);
  const first=engine.next();
  const second=engine.next();
  return {
    first,
    second,
    snapshot:engine.snapshot(),
    host:hostValue(input),
    external:inspectRecord('externalFormat'),
    missing:inspectRecord('noSuchField')
  };
}