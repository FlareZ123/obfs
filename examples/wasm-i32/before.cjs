'use strict';
function scramble(x){return (((x ^ 137) & (x >>> 3)) | (x << 7));}
module.exports = scramble;
