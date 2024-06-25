
import polylabel from './polylabel.js';
import {readFileSync} from 'fs';

const polygon = JSON.parse(readFileSync(new URL('./test/fixtures/water1.json', import.meta.url)));

console.log(`num points: ${[].concat(...polygon).length}`);

console.time('find point');
const result = polylabel(polygon, 1, true);
console.timeEnd('find point');

console.log(result);
