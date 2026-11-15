
const _pb_043f4a6ce10c_payload=[11548,59316,54772,51173,4170,3962,27723,30672,18542,51031,5354,64513,52042,60397,61878,5600,57280,53457,8763,20194,41633,63872,29145,54311,43998,20997,35430,52871,20867,35004,47319,30494,28799,29748,60721,21952,4750,41125,6030,4880,4692,24766,3962,57257,63212,10690,65283,50805,18962,54077,19589,64313];
let _pb_043f4a6ce10c_cached;
import {factor} from './constants.mjs';
import {_pb_043f4a6ce10c_mask} from "./constants.mjs";

export function message(){return _pb_043f4a6ce10c_cached===void 0?(_pb_043f4a6ce10c_cached=_pb_043f4a6ce10c_decode()):_pb_043f4a6ce10c_cached;}
export function render(value){return message()+'|'+String(value*factor);}

function _pb_043f4a6ce10c_decode(){const units=[];for(let i=0;i<52;i++){const at=(i*31+18)%52;units[i]=(_pb_043f4a6ce10c_payload[at]^_pb_043f4a6ce10c_mask[at]^((i*24593+21333)&65535))&65535;}return String.fromCharCode(...units);}
