'use strict';

/**
 * Seedless, source-only reconstruction of the emitted piggyback layout. The
 * attacker obtains both public ESM files and parses numeric arrays and loop
 * constants without invoking or importing either module.
 * @param {string} consumerSource
 * @param {string} donorSource
 * @returns {string}
 */
function recoverString(consumerSource,donorSource){
  /** @param {RegExp} regexp @param {string} source @returns {RegExpMatchArray} */
  const match=(regexp,source)=>{
    const found=regexp.exec(source);
    if(!found)throw new Error('Unsupported generated layout');
    return found;
  };
  const payload=JSON.parse(match(/const _pb_[\da-f]+_payload=(\[[\d,]+\]);/u,consumerSource)[1]);
  const mask=JSON.parse(match(/export const _pb_[\da-f]+_mask=(\[[\d,]+\]);/u,donorSource)[1]);
  const layout=match(/const at=\(i\*(\d+)\+(\d+)\)%(\d+);/u,consumerSource);
  const mix=match(/i\*(\d+)\+(\d+)\)&65535/u,consumerSource);
  const [stride,shift,n,odd,salt]=[+layout[1],+layout[2],+layout[3],+mix[1],+mix[2]];
  if(payload.length!==n||mask.length!==n)throw new Error('Invalid share lengths');
  /** @type {number[]} */
  const units=[];
  for(let i=0;i<n;i++){
    const at=(i*stride+shift)%n;
    units.push((payload[at]^mask[at]^((i*odd+salt)&65535))&65535);
  }
  return String.fromCharCode(...units);
}

module.exports={recoverString};
