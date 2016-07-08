'use strict';

module.exports = polylabel;

function polylabel(polygon, precision, debug) {
    precision = precision || 1.0;

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    // find the bounding box of the outer ring
    for (var i = 0; i < polygon[0].length; i++) {
        var p = polygon[0][i];
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }

    var width = maxX - minX;
    var height = maxY - minY;
    var cellSize = Math.min(width, height);
    var h = cellSize / 2;
    var cells = [];

    // cover polygon with initial cells
    for (var x = minX; x < maxX; x += cellSize) {
        for (var y = minY; y < maxY; y += cellSize) {
            cells.push(new Cell(x + h, y + h));
        }
    }

    // take centroid as the first best guess
    var bestCell = getCentroidCell(polygon[0]);
    bestCell.d = pointToPolygonDist(bestCell.x, bestCell.y, polygon);

    var error = h * Math.sqrt(2);

    while (true) {
        // calculate cell distances, keeping track of global max distance
        for (i = 0; i < cells.length; i++) {
            var cell = cells[i];
            cell.d = pointToPolygonDist(cell.x, cell.y, polygon);

            if (cell.d > bestCell.d) {
                bestCell = cell;
            }
        }

        if (debug) console.log('cells processed: %d, best so far %s, error %s',
            cells.length, bestCell.d.toFixed(2), error.toFixed(2));

        if (error <= precision) break;

        h /= 2;

        var childCells = [];
        for (i = 0; i < cells.length; i++) {
            cell = cells[i];
            if (cell.d + error <= bestCell.d) continue;

            // if a cell potentially contains a better solution than the current best, subdivide
            childCells.push(new Cell(cell.x - h, cell.y - h));
            childCells.push(new Cell(cell.x + h, cell.y - h));
            childCells.push(new Cell(cell.x - h, cell.y + h));
            childCells.push(new Cell(cell.x + h, cell.y + h));
        }

        cells = childCells;
        error /= 2;
    }

    if (debug) console.log('best distance: ' + bestCell.d);

    return [bestCell.x, bestCell.y];
}

function Cell(x, y) {
    this.x = x;
    this.y = y;
    this.d = null;
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
function getCentroidCell(points) {
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
    return new Cell(x / area, y / area);
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
