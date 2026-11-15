import {factor} from './constants.mjs';
export function message(){return 'License widget: déjà vu, 😀, isolated \uD800, and zero \u0000.';}
export function render(value){return message()+'|'+String(value*factor);}
