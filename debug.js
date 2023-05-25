import polylabel from './';
import polygon from './test/fixtures/water1.json';

console.log('num points: ' + [].concat.apply([], polygon).length);

console.time('find point');
var result = polylabel(polygon, 1, true);
console.timeEnd('find point');

console.log(result);
