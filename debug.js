'use strict';

var polylabel = require('./');
var points = require('./test/fixtures/water1.json');

console.time('find point');
var result = polylabel(points, 1, true);
console.timeEnd('find point');

console.log(result);
