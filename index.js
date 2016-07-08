'use strict';

module.exports = polylabel;

function polylabel(points, precision, debug) {
    precision = precision || 1.0;

    // find the bounding box
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }

    // cover polygon with initial cells
    var width = maxX - minX;
    var height = maxY - minY;
    var h = Math.min(width, height) / 2;
    var cells = [];

    if (width > height) {
        for (var x = minX; x < width; x += height) {
            cells.push(new Cell(x + h, minY + h));
        }
    } else {
        for (var y = minY; y < height; y += width) {
            cells.push(new Cell(minX + h, y + h));
        }
    }

    var bestCell, bestSize;
    var error = h * Math.sqrt(2);

    while (true) {
        // calculate cell distances, keeping track of global max distance
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            cell.d = pointToPolygonDist(cell.x, cell.y, points);

            if (!bestCell || cell.d > bestCell.d) {
                bestCell = cell;
            }
        }

        if (debug) console.log('cells processed: %d, best so far %s, error %s',
            cells.length, bestCell.d.toFixed(2), error.toFixed(2));

        if (error <= precision) break;

        h /= 2;

        var childCells = [];
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            // if a cell potentially contains a better solution than the current best, subdivide
            if (cell.d + error > bestCell.d) {
                childCells.push(new Cell(cell.x - h, cell.y - h));
                childCells.push(new Cell(cell.x + h, cell.y - h));
                childCells.push(new Cell(cell.x - h, cell.y + h));
                childCells.push(new Cell(cell.x + h, cell.y + h));
            }
        }

        cells = childCells;
        error /= 2;
    }

    return [bestCell.x, bestCell.y];
}

function Cell(x, y) {
    this.x = x;
    this.y = y;
    this.d = null;
}

function pointToPolygonDist(x, y, points) {
    var inside = false;
    var minDistSq = Infinity;

    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        var a = points[i];
        var b = points[j];

        if ((a[1] > y !== b[1] > y) &&
            (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;

        minDistSq = Math.min(minDistSq, getSegDistSq(x, y, a, b));
    }

    return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

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
