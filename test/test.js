'use strict';

var polylabel = require('../');
var test = require('tape').test;

var water1 = require('./fixtures/water1.json');
var water2 = require('./fixtures/water2.json');

test('finds pole of inaccessibility for water1 and precision 1', function (t) {
    var p = polylabel(water1, 1);
    t.same([p[0], p[1]], [3865.85009765625, 2124.87841796875]);
    t.equal(p.distance, 288.8493574779127);
    t.end();
});

test('finds pole of inaccessibility for water1 and precision 50', function (t) {
    var p = polylabel(water1, 50);
    t.same([p[0], p[1]], [3854.296875, 2123.828125]);
    t.equal(p.distance, 278.5795872381558);
    t.end();
});

test('finds pole of inaccessibility for water2 and default precision 1', function (t) {
    var p = polylabel(water2);
    t.same([p[0], p[1]], [3263.5, 3263.5]);
    t.equal(p.distance, 960.5);
    t.end();
});
