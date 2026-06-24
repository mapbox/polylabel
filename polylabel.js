
import Queue from 'tinyqueue';

export default function polylabel(polygon, precision = 1.0, debug = false) {
    // find the bounding box of the outer ring
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [x, y] of polygon[0]) {
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

    // flatten the polygon rings into a single contiguous coordinate buffer for
    // cache-friendly, pointer-chase-free access in the hot distance loop
    let numPoints = 0;
    for (const ring of polygon) numPoints += ring.length;
    const coords = new Float64Array(numPoints * 2);
    const ringIndices = []; // [start, end) pairs into coords for each ring
    let c = 0;
    for (const ring of polygon) {
        const start = c;
        for (let i = 0; i < ring.length; i++) {
            coords[c++] = ring[i][0];
            coords[c++] = ring[i][1];
        }
        ringIndices.push(start, c);
    }

    // a priority queue of cells in order of their "potential" (max distance to polygon)
    const cellQueue = new Queue([], (a, b) => b.max - a.max);

    // take centroid as the first best guess
    let bestCell = getCentroidCell(polygon, coords, ringIndices);

    // second guess: bounding box centroid
    const bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, coords, ringIndices, -Infinity, null);
    if (bboxCell.d > bestCell.d) bestCell = bboxCell;

    let numProbes = 2;

    function potentiallyQueue(x, y, h, seed) {
        // a cell is only useful if it can beat the best (d > bestCell.d) or is
        // worth subdividing (max = d + h·√2 > bestCell.d + precision). Both fail
        // once d ≤ threshold, so the distance scan can bail there early.
        const threshold = bestCell.d - Math.max(0, h * Math.SQRT2 - precision);
        const cell = new Cell(x, y, h, coords, ringIndices, threshold, seed);
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
            potentiallyQueue(x + h, y + h, h, null);
        }
    }

    while (cellQueue.length) {
        // pick the most promising cell from the queue
        const cell = cellQueue.pop();

        // do not drill down further if there's no chance of a better solution
        if (cell.max - bestCell.d <= precision) break;

        // split the cell into four cells, seeding each with the parent's nearest segment
        h = cell.h / 2;
        potentiallyQueue(cell.x - h, cell.y - h, h, cell);
        potentiallyQueue(cell.x + h, cell.y - h, h, cell);
        potentiallyQueue(cell.x - h, cell.y + h, h, cell);
        potentiallyQueue(cell.x + h, cell.y + h, h, cell);
    }

    if (debug) {
        console.log(`num probes: ${numProbes}\nbest distance: ${bestCell.d}`);
    }

    const result = [bestCell.x, bestCell.y];
    result.distance = bestCell.d;
    return result;
}

function Cell(x, y, h, coords, ringIndices, maxD, seed) {
    this.x = x; // cell center x
    this.y = y; // cell center y
    this.h = h; // half the cell size
    // nsx1..nsy2 hold the nearest segment found below, so child cells can seed
    // their scan with it (a child is almost always nearest to the same segment)
    this.nsx1 = 0; this.nsy1 = 0; this.nsx2 = 0; this.nsy2 = 0;
    this.d = pointToPolygonDist(this, coords, ringIndices, maxD, seed); // distance from cell center to polygon
    this.max = this.d + h * Math.SQRT2; // max distance to polygon within a cell
}

// signed distance from cell center to polygon outline (negative if outside),
// also recording the nearest segment on the cell. maxD is a distance threshold:
// if a partial result proves the center is no farther than maxD from the outline,
// the scan bails out early and returns maxD, since the caller has already
// determined such a cell can't beat the best. seed is the parent cell (or null);
// its nearest segment is checked first so boundary cells reach the early-out
// threshold without scanning the whole outline.
function pointToPolygonDist(cell, coords, ringIndices, maxD, seed) {
    const x = cell.x;
    const y = cell.y;
    let inside = false;
    let minDistSq = Infinity;
    const thresholdSq = maxD > 0 ? maxD * maxD : -1;

    if (seed !== null) {
        cell.nsx1 = seed.nsx1; cell.nsy1 = seed.nsy1; cell.nsx2 = seed.nsx2; cell.nsy2 = seed.nsy2;
        minDistSq = getSegDistSq(x, y, seed.nsx1, seed.nsy1, seed.nsx2, seed.nsy2);
        if (minDistSq <= thresholdSq) return maxD;
    }

    for (let r = 0; r < ringIndices.length; r += 2) {
        const start = ringIndices[r];
        const end = ringIndices[r + 1];

        // previous vertex (b), starting from the last point in the ring
        let bx = coords[end - 2];
        let by = coords[end - 1];

        for (let i = start; i < end; i += 2) {
            const ax = coords[i];
            const ay = coords[i + 1];

            if ((ay > y !== by > y) &&
                (x < (bx - ax) * (y - ay) / (by - ay) + ax)) inside = !inside;

            const distSq = getSegDistSq(x, y, ax, ay, bx, by);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                cell.nsx1 = ax; cell.nsy1 = ay; cell.nsx2 = bx; cell.nsy2 = by;

                // the point is already close enough to the outline that this cell
                // can't possibly contain a better label position — stop scanning
                if (minDistSq <= thresholdSq) return maxD;
            }

            bx = ax;
            by = ay;
        }
    }

    return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// get polygon centroid
function getCentroidCell(polygon, coords, ringIndices) {
    let area = 0;
    let x = 0;
    let y = 0;
    const points = polygon[0];

    for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        const a = points[i];
        const b = points[j];
        const f = a[0] * b[1] - b[0] * a[1];
        x += (a[0] + b[0]) * f;
        y += (a[1] + b[1]) * f;
        area += f * 3;
    }
    const centroid = new Cell(x / area, y / area, 0, coords, ringIndices, -Infinity, null);
    if (area === 0 || centroid.d < 0) return new Cell(points[0][0], points[0][1], 0, coords, ringIndices, -Infinity, null);
    return centroid;
}

// get squared distance from a point to a segment
function getSegDistSq(px, py, x, y, bx, by) {
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
