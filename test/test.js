import polylabel from '../polylabel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import water1 from './fixtures/water1.json' with {type: 'json'};
import water2 from './fixtures/water2.json' with {type: 'json'};

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

test('certifies rotated thin rectangles and chamfered polygons before searching', () => {
    const shapes = [
        [[0, 0], [100, 0], [100, 1], [0, 1]],
        [[0.25, 0], [99.75, 0], [100, 0.25], [100, 0.75],
            [99.75, 1], [0.25, 1], [0, 0.75], [0, 0.25]]
    ];
    for (const shape of shapes) {
        for (const [c, s] of [[1, 0], [0.6, 0.8], [Math.cos(0.37), Math.sin(0.37)]]) {
            for (const reverse of [false, true]) {
                const ring = shape.map(([x, y]) => [c * x - s * y, s * x + c * y]);
                if (reverse) ring.reverse();
                ring.push(ring[0], ring[0]); // closure and a zero-length edge
                for (const point of ring) Object.freeze(point);
                const polygon = Object.freeze([Object.freeze(ring)]);
                const messages = [];
                const log = console.log;
                let p;
                try {
                    console.log = message => messages.push(message);
                    p = polylabel(polygon, 0.001, true);
                } finally {
                    console.log = log;
                }
                // The enclosing unit-width strip and central unit-diameter
                // circle independently give an optimum clearance of 0.5.
                assert.ok(Math.abs(p.distance - 0.5) < 1e-10);
                assert.ok(Math.abs(-s * p[0] + c * p[1] - 0.5) < 1e-10);
                assert.ok(messages.some(message => message.startsWith('num probes: 2\n')));
            }
        }
    }
});

test('certificates handle translations and scaled absolute precision', () => {
    for (const [scale, tx, ty] of [[1, 1e12, -1e12], [1e-9, 0, 0], [1e9, 0, 0]]) {
        const polygon = [[0, 0], [100, 0], [100, 1], [0, 1]]
            .map(([x, y]) => [tx + scale * x, ty + scale * y]);
        const p = polylabel([polygon], 0.001 * scale);
        assert.ok(Math.abs(p.distance / scale - 0.5) < 1e-10);
        assert.ok(Math.abs((p[1] - ty) / scale - 0.5) < 1e-10);
    }
});

test('a hole excluding the initial center retains the general search', () => {
    const p = polylabel([
        [[0, 0], [100, 0], [100, 1], [0, 1]],
        [[49, 0.25], [51, 0.25], [51, 0.75], [49, 0.75]]
    ], 0.01);
    assert.ok(p.distance >= 0.49 && p.distance <= 0.5);
    assert.ok(p[0] < 49 || p[0] > 51);
    assert.ok(p[1] >= 0.49 && p[1] <= 0.51);
});

test('a narrow concave elbow can improve on the initial strip-sized guess', () => {
    const p = polylabel([[[0, 0], [20, 0], [20, 1], [1, 1], [1, 10], [0, 10]]], 0.001);
    const optimum = 2 - Math.SQRT2;
    assert.ok(p.distance <= optimum + 1e-12);
    assert.ok(p.distance >= optimum - 0.001);
    assert.ok(p[0] > 0 && p[0] < 1 && p[1] > 0 && p[1] < 1);
});
