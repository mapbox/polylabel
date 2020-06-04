'use strict';

var polylabel = require('../');
var test = require('tape').test;

var water1 = require('./fixtures/water1.json');
var water2 = require('./fixtures/water2.json');

test('finds pole of inaccessibility for water1 and precision 1', function (t) {
    var p = polylabel(water1, 1);
    t.same(p, Object.assign([3865.85009765625, 2124.87841796875], {
        distance: 288.8493574779127
    }));
    t.end();
});

test('finds pole of inaccessibility for water1 and precision 50', function (t) {
    var p = polylabel(water1, 50);
    t.same(p, Object.assign([3854.296875, 2123.828125], {
        distance: 278.5795872381558
    }));
    t.end();
});

test('finds pole of inaccessibility for water2 and default precision 1', function (t) {
    var p = polylabel(water2);
    t.same(p, Object.assign([3263.5, 3263.5], {
        distance: 960.5
    }));
    t.end();
});

test('works on degenerate polygons', function (t) {
    var p = polylabel([[[0, 0], [1, 0], [2, 0], [0, 0]]]);
    t.same(p, Object.assign([0, 0], {
        distance: 0
    }));

    p = polylabel([[[0, 0], [1, 0], [1, 1], [1, 0], [0, 0]]]);
    t.same(p, Object.assign([0, 0], {
        distance: 0
    }));

    t.end();
});
