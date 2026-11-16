'use strict';

function route(value, flag, hook) {let _sf_33de785af04649f2=1032370222;for(;;){switch(_sf_33de785af04649f2){case 4055281185:{hook('allowed');;_sf_33de785af04649f2=3387441235;break;}case 4105973859:{_sf_33de785af04649f2=((score > 20)?944586914:1640917625);break;}case 3475191557:{return (score ^ 19) | 0;;}case 944586914:{hook('fallback');;_sf_33de785af04649f2=1997557847;break;}case 3276354692:{_sf_33de785af04649f2=((flag)?4055281185:4105973859);break;}case 1032370222:{var score = (value | 0) * 7;;_sf_33de785af04649f2=3276354692;break;}case 2983186923:{score -= 9;;_sf_33de785af04649f2=3475191557;break;}case 1997557847:{score ^= 15;;_sf_33de785af04649f2=3475191557;break;}case 1640917625:{hook('minimum');;_sf_33de785af04649f2=2983186923;break;}case 3387441235:{score += 31;;_sf_33de785af04649f2=3475191557;break;}case 1322170801:return;default:throw Error("Invalid control-flow state");}}}

module.exports = {route};
