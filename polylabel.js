
import Queue from 'tinyqueue';

export default function polylabel(polygon, precision = 1.0, debug = false) {
    // flatten polygon for faster distance computation
    const flatPolygon = flattenPolygon(polygon);

    // find the bounding box of the outer ring
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < flatPolygon[0].length; i += 2) {
        const x = flatPolygon[0][i];
        const y = flatPolygon[0][i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const cellSize = Math.max(precision, Math.min(width, height));

    if (cellSize === precision) {
        const result = [minX, minY];
        result.distance = 0;
        return result;
    }

    // a priority queue of cells in order of their "potential" (max distance to polygon)
    const cellQueue = new Queue([], (a, b) => b.max - a.max);

    // take centroid as the first best guess
    let bestCell = getCentroidCell(flatPolygon);

    // second guess: bounding box centroid
    const bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, flatPolygon);
    if (bboxCell.d > bestCell.d) bestCell = bboxCell;

    let numProbes = 2;

    function potentiallyQueue(x, y, h) {
        const cell = new Cell(x, y, h, flatPolygon);
        numProbes++;
        if (cell.max > bestCell.d + precision) cellQueue.push(cell);

        // update the best cell if we found a better one
        if (cell.d > bestCell.d) {
            bestCell = cell;
            if (debug) console.log(`found best ${Math.round(1e4 * cell.d) / 1e4} after ${numProbes} probes`);
        }
    }

    // cover polygon with initial cells
    let h = cellSize / 2;
    for (let x = minX; x < maxX; x += cellSize) {
        for (let y = minY; y < maxY; y += cellSize) {
            potentiallyQueue(x + h, y + h, h);
        }
    }

    while (cellQueue.length) {
        // pick the most promising cell from the queue
        const {max, x, y, h: ch} = cellQueue.pop();

        // do not drill down further if there's no chance of a better solution
        if (max - bestCell.d <= precision) break;

        // split the cell into four cells
        h = ch / 2;
        potentiallyQueue(x - h, y - h, h);
        potentiallyQueue(x + h, y - h, h);
        potentiallyQueue(x - h, y + h, h);
        potentiallyQueue(x + h, y + h, h);
    }

    if (debug) {
        console.log(`num probes: ${numProbes}\nbest distance: ${bestCell.d}`);
    }

    const result = [bestCell.x, bestCell.y];
    result.distance = bestCell.d;
    return result;
}

// pre-flatten polygon rings into flat arrays [x0,y0,x1,y1,...] for faster iteration
function flattenPolygon(polygon) {
    const flatPolygon = new Array(polygon.length);
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
        const ring = polygon[ringIndex];
        const flatRing = new Float64Array(ring.length * 2);
        for (let i = 0; i < ring.length; i++) {
            flatRing[i * 2] = ring[i][0];
            flatRing[i * 2 + 1] = ring[i][1];
        }
        flatPolygon[ringIndex] = flatRing;
    }
    return flatPolygon;
}

function Cell(x, y, h, flatPolygon) {
    this.x = x; // cell center x
    this.y = y; // cell center y
    this.h = h; // half the cell size
    this.d = pointToPolygonDist(x, y, flatPolygon); // distance from cell center to polygon
    this.max = this.d + this.h * Math.SQRT2; // max distance to polygon within a cell
}

// signed distance from point to polygon outline (negative if point is outside)
function pointToPolygonDist(x, y, flatPolygon) {
    let inside = false;
    let minDistSq = Infinity;

    for (const ring of flatPolygon) {
        const len = ring.length;
        let bx = ring[len - 2];
        let by = ring[len - 1];
        for (let k = 0; k < len; k += 2) {
            const ax = ring[k];
            const ay = ring[k + 1];

            if ((ay > y !== by > y) &&
                (x < (bx - ax) * (y - ay) / (by - ay) + ax)) inside = !inside;

            minDistSq = Math.min(minDistSq, getSegDistSq(x, y, ax, ay, bx, by));
            bx = ax;
            by = ay;
        }
    }

    return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// get polygon centroid
function getCentroidCell(flatPolygon) {
    let area = 0;
    let x = 0;
    let y = 0;
    const points = flatPolygon[0];

    for (let i = 0, len = points.length, j = len - 2; i < len; j = i, i += 2) {
        const ax = points[i];
        const ay = points[i + 1];
        const bx = points[j];
        const by = points[j + 1];
        const f = ax * by - bx * ay;
        x += (ax + bx) * f;
        y += (ay + by) * f;
        area += f * 3;
    }
    const centroid = new Cell(x / area, y / area, 0, flatPolygon);
    if (area === 0 || centroid.d < 0) return new Cell(points[0], points[1], 0, flatPolygon);
    return centroid;
}

// get squared distance from a point to a segment
function getSegDistSq(px, py, ax, ay, bx, by) {
    let x = ax;
    let y = ay;
    let dx = bx - x;
    let dy = by - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = bx;
            y = by;

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = px - x;
    dy = py - y;

    return dx * dx + dy * dy;
}
