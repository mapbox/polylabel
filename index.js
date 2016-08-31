'use strict';

var Queue = require('tinyqueue');
var rbush = require('rbush');

module.exports = polylabel;

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

    var tree = indexPolygon(polygon);

    var width = maxX - minX;
    var height = maxY - minY;
    var cellSize = Math.min(width, height);
    var h = cellSize / 2;

    // a priority queue of cells in order of their "potential" (max distance to polygon)
    var cellQueue = new Queue(null, compareMax);

    // cover polygon with initial cells
    for (var x = minX; x < maxX; x += cellSize) {
        for (var y = minY; y < maxY; y += cellSize) {
            cellQueue.push(new Cell(x + h, y + h, h, tree));
        }
    }

    // take centroid as the first best guess
    var bestCell = getCentroidCell(polygon[0], tree);

    // special case for rectangular polygons
    var bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, tree);
    if (bboxCell.d > bestCell.d) bestCell = bboxCell;

    var numProbes = cellQueue.length;

    while (cellQueue.length) {
        // pick the most promising cell from the queue
        var cell = cellQueue.pop();

        // update the best cell if we found a better one
        if (cell.d > bestCell.d) {
            bestCell = cell;
            if (debug) console.log('found best %d after %d probes', Math.round(1e4 * cell.d) / 1e4, numProbes);
        }

        // do not drill down further if there's no chance of a better solution
        if (cell.max - bestCell.d <= precision) continue;

        // split the cell into four cells
        h = cell.h / 2;
        cellQueue.push(new Cell(cell.x - h, cell.y - h, h, tree));
        cellQueue.push(new Cell(cell.x + h, cell.y - h, h, tree));
        cellQueue.push(new Cell(cell.x - h, cell.y + h, h, tree));
        cellQueue.push(new Cell(cell.x + h, cell.y + h, h, tree));
        numProbes += 4;
    }

    if (debug) {
        console.log('num probes: ' + numProbes);
        console.log('best distance: ' + bestCell.d);
    }

    return [bestCell.x, bestCell.y];
}

function indexPolygon(polygon) {
    var edges = [];
    for (var k = 0; k < polygon.length; k++) {
        var ring = polygon[k];

        for (var i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
            var a = ring[i];
            var b = ring[j];

            edges.push({
                minX: Math.min(a[0], b[0]),
                minY: Math.min(a[1], b[1]),
                maxX: Math.max(a[0], b[0]),
                maxY: Math.max(a[1], b[1]),
                a: a,
                b: b
            });
        }
    }
    return rbush().load(edges);
}

function compareMax(a, b) {
    return b.max - a.max;
}

function Cell(x, y, h, tree) {
    this.x = x; // cell center x
    this.y = y; // cell center y
    this.h = h; // half the cell size
    this.d = pointToPolygonDist(x, y, tree); // distance from cell center to polygon
    this.max = this.d + this.h * Math.SQRT2; // max distance to polygon within a cell
}

// signed distance from point to polygon outline (negative if point is outside)
function pointToPolygonDist(x, y, tree) {
    var inside = false;

    var edges = tree.search({
        minX: x,
        minY: y,
        maxX: Infinity,
        maxY: y
    });

    for (var i = 0; i < edges.length; i++) {
        var a = edges[i].a;
        var b = edges[i].b;
        if ((a[1] > y !== b[1] > y) &&
            (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
    }

    var minDistSq = distToClosestEdgeSq(x, y, tree);

    return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function distToClosestEdgeSq(x, y, tree) {
    var queue = new Queue(null, compareDist);
    var node = tree.data;

    // search through the segment R-tree with a depth-first search using a priority queue
    // in the order of distance to the point
    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var child = node.children[i];

            var dist = node.leaf ?
                getSegDistSq(x, y, child.a, child.b) :
                getBoxDistSq(x, y, child);

            queue.push({
                node: child,
                dist: dist
            });
        }

        while (queue.length && !queue.peek().node.children) {
            return queue.pop().dist;
        }

        node = queue.pop();
        if (node) node = node.node;
    }

    throw new Error('Shit happened.');
}

function getBoxDistSq(x, y, box) {
    var dx = axisDist(x, box.minX, box.maxX);
    var dy = axisDist(y, box.minY, box.maxY);
    return dx * dx + dy * dy;
}

function axisDist(k, min, max) {
    return k < min ? min - k :
           k <= max ? 0 :
           k - max;
}

function compareDist(a, b) {
    return a.dist - b.dist;
}

// get polygon centroid
function getCentroidCell(points, tree) {
    var area = 0;
    var x = 0;
    var y = 0;

    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        var a = points[i];
        var b = points[j];
        var f = a[0] * b[1] - b[0] * a[1];
        x += (a[0] + b[0]) * f;
        y += (a[1] + b[1]) * f;
        area += f * 3;
    }
    return new Cell(x / area, y / area, 0, tree);
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
