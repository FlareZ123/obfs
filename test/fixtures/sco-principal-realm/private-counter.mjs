let sequence=0;
export function advance(expected){
  if(!Number.isSafeInteger(expected)||expected!==sequence+1){
    throw new TypeError('Stale private sequence');
  }
  return ++sequence;
}
