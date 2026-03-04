import BoloLocalWorld from './world/local';
import BoloNetworkWorld from './world/client';

//# Exports

let DefaultWorld;
if ((location.search === '?local') || (location.hostname.split('.')[1] === 'github')) {
  DefaultWorld = BoloLocalWorld;
} else {
  DefaultWorld = BoloNetworkWorld;
}

export default DefaultWorld;
