import {state} from './private.mjs';
import {hostValue} from './host.mjs';

function readOffset(owner){return owner.secretOffset;}
function readSalt(owner){return owner.secretSalt;}
function identity(value){return value;}

const offset=readOffset(identity(state));
const salt=readSalt(state);

export function createEngine(seed) {
  let cursor=0;
  const next=()=> {
    cursor++;
    return ((seed+offset+cursor)*salt)%97;
  };
  const snapshot=()=>({cursor,offset,salt});
  return {next,snapshot};
}