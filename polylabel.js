'use strict';

var Queue = require('tinyqueue');

module.exports = polylabel;
module.exports.default = polylabel;

function getFitnessFunc(centroid, polygonSize) {
    var maxSize = Math.max(polygonSize[0], polygonSize[1]);

    return (function (cellCenter, distancePolygon) {
        if (distancePolygon <= 0) {
            return distancePolygon;
        }

        var d = [
            cellCenter[0] - centroid[0],
            cellCenter[1] - centroid[1]
        ];

        var distanceCentroid = Math.sqrt((d[0] * d[0]) + (d[1] * d[1]));

        return distancePolygon * (1 - distanceCentroid / maxSize);
    });
}

function polylabel(polygon, precision, debug) {
    precision = precision || 1.0;

    // find the bounding box of the outer ring
    var minX, minY, maxX, maxY;
    for (var i = 0; i < polygon[0].length; i++) {
        var p = polygon[0][i];
        if (!i || p[0] < minX) minX = p[0];
        if (!i || p[1] < minY) minY = p[1];
        if (!i || p[0] > maxX) maxX = p[0];
        if (!i || p[1] > maxY) maxY = p[1];
    }

    var width = maxX - minX;
    var height = maxY - minY;
    var cellSize = Math.min(width, height);
    var h = cellSize / 2;

    if (cellSize === 0) return [minX, minY];

    // a priority queue of cells in order of their "potential" (max distance to polygon)
    var cellQueue = new Queue(null, compareMax);

    var centroid = getCentroid(polygon);
    var fitnessFunc = getFitnessFunc(centroid, [width, height]);

    // cover polygon with initial cells
    for (var x = minX; x < maxX; x += cellSize) {
        for (var y = minY; y < maxY; y += cellSize) {
            cellQueue.push(new Cell(x + h, y + h, h, polygon, fitnessFunc));
        }
    }

    // take centroid as the first best guess
    var bestCell = new Cell(centroid[0], centroid[1], 0, polygon, fitnessFunc);

    var numProbes = cellQueue.length;

    while (cellQueue.length) {
        // pick the most promising cell from the queue
        var cell = cellQueue.pop();

        // update the best cell if we found a better one
        if (cell.fitness > bestCell.fitness) {
            bestCell = cell;
            if (debug) console.log('found best %d after %d probes', Math.round(1e4 * cell.d) / 1e4, numProbes);
        }

        // do not drill down further if there's no chance of a better solution
        if (cell.maxFitness - bestCell.fitness <= precision) continue;

        // split the cell into four cells
        h = cell.h / 2;
        cellQueue.push(new Cell(cell.x - h, cell.y - h, h, polygon, fitnessFunc));
        cellQueue.push(new Cell(cell.x + h, cell.y - h, h, polygon, fitnessFunc));
        cellQueue.push(new Cell(cell.x - h, cell.y + h, h, polygon, fitnessFunc));
        cellQueue.push(new Cell(cell.x + h, cell.y + h, h, polygon, fitnessFunc));
        numProbes += 4;
    }

    if (debug) {
        console.log('num probes: ' + numProbes);
        console.log('best distance: ' + bestCell.d);
    }

    return [bestCell.x, bestCell.y];
}

function compareMax(a, b) {
    return b.maxFitness - a.maxFitness;
}

function Cell(x, y, h, polygon, fitnessFunc) {
    this.x = x; // cell center x
    this.y = y; // cell center y
    this.h = h; // half the cell size
    this.d = pointToPolygonDist(x, y, polygon); // distance from cell center to polygon
    this.fitness = fitnessFunc([x, y], this.d);
    this.maxFitness = fitnessFunc([x, y], this.d + this.h * Math.SQRT2); // max distance to polygon within a cell
}

// signed distance from point to polygon outline (negative if point is outside)
function pointToPolygonDist(x, y, polygon) {
    var inside = false;
    var minDistSq = Infinity;

    for (var k = 0; k < polygon.length; k++) {
        var ring = polygon[k];

        for (var i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
            var a = ring[i];
            var b = ring[j];

            if ((a[1] > y !== b[1] > y) &&
                (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;

            minDistSq = Math.min(minDistSq, getSegDistSq(x, y, a, b));
        }
    }

    return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// get polygon centroid
function getCentroid(polygon) {
    var area = 0;
    var x = 0;
    var y = 0;
    var points = polygon[0];

    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        var a = points[i];
        var b = points[j];
        var f = a[0] * b[1] - b[0] * a[1];
        x += (a[0] + b[0]) * f;
        y += (a[1] + b[1]) * f;
        area += f * 3;
    }
    return (area === 0) ? points[0] : [x / area, y / area];
}

// get squared distance from a point to a segment
function getSegDistSq(px, py, a, b) {

    var x = a[0];
    var y = a[1];
    var dx = b[0] - x;
    var dy = b[1] - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = b[0];
            y = b[1];

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = px - x;
    dy = py - y;

    return dx * dx + dy * dy;
}
