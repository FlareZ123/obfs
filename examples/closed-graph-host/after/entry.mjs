
;(()=>{const h=globalThis.location?.hostname?.toLowerCase();if(!["allowed.example"].includes(h))throw Error('Unauthorized execution host')})();
import {read} from './logic.mjs';
globalThis.events.push('entry');
globalThis.answer=read();
