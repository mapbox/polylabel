import polylabel from './polylabel.js';
import water1 from './test/fixtures/water1.json' with {type: 'json'};
import water2 from './test/fixtures/water2.json' with {type: 'json'};

const cases = [
    ['water1 precision  1', water1, 1],
    ['water1 precision 50', water1, 50],
    ['water2 precision  1', water2, 1],
];

const RUNS = 100;

for (const [name, polygon, precision] of cases) {
    const times = [];
    for (let r = 0; r < RUNS; r++) {
        const t = performance.now();
        polylabel(polygon, precision);
        times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const min = times[0];
    const median = times[times.length >> 1];
    console.log(`${name}: min ${min.toFixed(2)}ms, median ${median.toFixed(2)}ms`);
}
