'use strict';

module.exports = polylabel;

function polylabel(points, precision) {
    precision = precision || 1.0;

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

    var width = maxX - minX;
    var height = maxY - minY;
    var cellSize = Math.min(width, height);
    var cells = [];

    if (width > height) {
        for (var x = minX; x < width; x += height) {
            cells.push(new Cell(x, minY));
        }
    } else {
        for (var y = minY; y < height; y += width) {
            cells.push(new Cell(minX, y));
        }
    }

    var bestCell, bestSize;
    var error = cellSize * Math.sqrt(2) / 2;

    while (true) {
        var halfSize = cellSize / 2;

        // calculate cell distances, keeping track of global max distance
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            cell.d = pointToPolygonDist(cell.x + halfSize, cell.y + halfSize, points);

            if (!bestCell || cell.d > bestCell.d) {
                bestCell = cell;
                bestSize = cellSize;
            }
        }

        console.log('best %d, error %d, cells: %d', bestCell.d.toFixed(2), error.toFixed(2), cells.length);

        if (error <= precision) break;

        var childCells = [];
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            // if a cell potentially contains a better solution than the current best, subdivide
            if (cell.d + error > bestCell.d) {
                childCells.push(new Cell(cell.x, cell.y));
                childCells.push(new Cell(cell.x + halfSize, cell.y));
                childCells.push(new Cell(cell.x, cell.y + halfSize));
                childCells.push(new Cell(cell.x + halfSize, cell.y + halfSize));
            }
        }

        cells = childCells;
        cellSize = halfSize;
        error /= 2;
    }

    return [bestCell.x + bestSize / 2, bestCell.y + bestSize / 2];
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

function simplifyDPStep(points, first, last, sqTolerance, simplified) {
    var maxSqDist = sqTolerance,
        index;

    for (var i = first + 1; i < last; i++) {
        var sqDist = getSegDistSq(points[i][0], points[i][1], points[first], points[last]);

        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
        simplified.push(points[index]);
        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
    }
}

// simplification using Ramer-Douglas-Peucker algorithm
function simplify(points, sqTolerance) {
    var last = points.length - 1;

    var simplified = [points[0]];
    simplifyDPStep(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);

    return simplified;
}
