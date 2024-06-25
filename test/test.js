import polylabel from '../polylabel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'fs';

const water1 = JSON.parse(readFileSync(new URL('fixtures/water1.json', import.meta.url)));
const water2 = JSON.parse(readFileSync(new URL('fixtures/water2.json', import.meta.url)));

test('finds pole of inaccessibility for water1 and precision 1', () => {
    const p = polylabel(water1, 1);
    assert.deepEqual(p, Object.assign([3865.85009765625, 2124.87841796875], {
        distance: 288.8493574779127
    }));
});

test('finds pole of inaccessibility for water1 and precision 50', () => {
    const p = polylabel(water1, 50);
    assert.deepEqual(p, Object.assign([3854.296875, 2123.828125], {
        distance: 278.5795872381558
    }));
});

test('finds pole of inaccessibility for water2 and default precision 1', () => {
    const p = polylabel(water2);
    assert.deepEqual(p, Object.assign([3263.5, 3263.5], {
        distance: 960.5
    }));
});

test('works on degenerate polygons', () => {
    let p = polylabel([[[0, 0], [1, 0], [2, 0], [0, 0]]]);
    assert.deepEqual(p, Object.assign([0, 0], {
        distance: 0
    }));

    p = polylabel([[[0, 0], [1, 0], [1, 1], [1, 0], [0, 0]]]);
    assert.deepEqual(p, Object.assign([0, 0], {
        distance: 0
    }));
});
