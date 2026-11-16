const schema={externalFormat:'audit-v1',auditCount:3};
/** @param {string} key */
export function inspectRecord(key){
  return {
    keys:Reflect.ownKeys(schema).sort(),
    value:schema[key],
    enumerable:Object.getOwnPropertyDescriptor(schema,key)?.enumerable===true
  };
}
