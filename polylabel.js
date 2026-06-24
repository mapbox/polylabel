
import Queue from 'tinyqueue';

// number of consecutive edges grouped under a single bounding box for block-skip
const K = 32;

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
    const ringEnds = []; // end offset into coords for each ring (start = previous end, or 0)
    let c = 0;
    for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
            coords[c++] = ring[i][0];
            coords[c++] = ring[i][1];
        }
        ringEnds.push(c);
    }

    const blocks = buildBlocks(coords, ringEnds);

    // a priority queue of cells in order of their "potential" (max distance to polygon)
    const cellQueue = new Queue([], (a, b) => b.max - a.max);

    // take centroid as the first best guess
    let bestCell = getCentroidCell(coords, ringEnds, blocks);

    // second guess: bounding box centroid
    const bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, coords, ringEnds, blocks, -Infinity, null);
    if (bboxCell.d > bestCell.d) bestCell = bboxCell;

    let numProbes = 2;

    function potentiallyQueue(x, y, h, seed) {
        // a cell is only useful if it can beat the best (d > bestCell.d) or is
        // worth subdividing (max = d + h·√2 > bestCell.d + precision). Both fail
        // once d ≤ threshold, so the distance scan can bail there early.
        const threshold = bestCell.d - Math.max(0, h * Math.SQRT2 - precision);
        const cell = new Cell(x, y, h, coords, ringEnds, blocks, threshold, seed);
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

function Cell(x, y, h, coords, ringEnds, blocks, maxD, seed) {
    this.x = x; // cell center x
    this.y = y; // cell center y
    this.h = h; // half the cell size
    // nsx1..nsy2 hold the nearest segment found below, so child cells can seed
    // their scan with it (a child is almost always nearest to the same segment)
    this.nsx1 = 0; this.nsy1 = 0; this.nsx2 = 0; this.nsy2 = 0;
    this.d = pointToPolygonDist(this, coords, ringEnds, blocks, maxD, seed); // distance from cell center to polygon
    this.max = this.d + h * Math.SQRT2; // max distance to polygon within a cell
}

// signed distance from cell center to polygon outline (negative if outside),
// also recording the nearest segment on the cell. maxD is a distance threshold:
// if a partial result proves the center is no farther than maxD from the outline,
// the scan bails out early and returns maxD, since the caller has already
// determined such a cell can't beat the best. seed is the parent cell (or null);
// its nearest segment is checked first so boundary cells reach the early-out
// threshold without scanning the whole outline.
function pointToPolygonDist(cell, coords, ringEnds, blocks, maxD, seed) {
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

    const stride = K * 2;
    const numRings = ringEnds.length;
    let g = 0; // running block index into bboxes
    let ringStart = 0;

    for (let r = 0; r < numRings; r++) {
        const ringEnd = ringEnds[r];

        // previous vertex (b), starting from the last point in the ring; carried
        // across blocks so each block's first edge connects to the prior vertex
        let bx = coords[ringEnd - 2];
        let by = coords[ringEnd - 1];

        for (let s = ringStart; s < ringEnd; s += stride, g += 4) {
            let end = s + stride;
            if (end > ringEnd) end = ringEnd;
            const bminX = blocks[g], bminY = blocks[g + 1], bmaxX = blocks[g + 2], bmaxY = blocks[g + 3];

            // lower bound on the distance from (x, y) to any edge in this block
            const dx = x < bminX ? bminX - x : x > bmaxX ? x - bmaxX : 0;
            const dy = y < bminY ? bminY - y : y > bmaxY ? y - bmaxY : 0;
            const skipDist = dx * dx + dy * dy >= minDistSq;

            // this block's edges can only flip ray-cast parity if its bbox straddles
            // y and extends right of x; else no edge crosses the rightward ray
            const skipCross = y < bminY || y >= bmaxY || x > bmaxX;

            if (skipDist && skipCross) {
                bx = coords[end - 2];
                by = coords[end - 1];
                continue;
            }

            for (let i = s; i < end; i += 2) {
                const ax = coords[i];
                const ay = coords[i + 1];

                if (!skipCross && (ay > y !== by > y) &&
                    (x < (bx - ax) * (y - ay) / (by - ay) + ax)) inside = !inside;

                if (!skipDist) {
                    const distSq = getSegDistSq(x, y, ax, ay, bx, by);
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        cell.nsx1 = ax; cell.nsy1 = ay; cell.nsx2 = bx; cell.nsy2 = by;

                        // the point is already close enough to the outline that this cell
                        // can't possibly contain a better label position — stop scanning
                        if (minDistSq <= thresholdSq) return maxD;
                    }
                }

                bx = ax;
                by = ay;
            }
        }
        ringStart = ringEnd;
    }

    return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

// precompute one bounding box per block of K consecutive edges (over both
// endpoints of every edge in it) so the distance scan can skip whole blocks in
// O(1). The block layout mirrors the flattened coords/ringEnds and is re-derived
// in the scan, so only the bboxes need storing: a flat [minX,minY,maxX,maxY] run
// per block, sized upfront from the ring lengths.
function buildBlocks(coords, ringEnds) {
    const stride = K * 2;
    let numBlocks = 0;
    let ringStart = 0;
    for (let r = 0; r < ringEnds.length; r++) {
        numBlocks += Math.ceil((ringEnds[r] - ringStart) / stride);
        ringStart = ringEnds[r];
    }

    const blocks = new Float64Array(numBlocks * 4);
    let g = 0;
    ringStart = 0;
    for (let r = 0; r < ringEnds.length; r++) {
        const ringEnd = ringEnds[r];
        for (let s = ringStart; s < ringEnd; s += stride, g += 4) {
            const end = s + stride < ringEnd ? s + stride : ringEnd;
            const prev = s === ringStart ? ringEnd - 2 : s - 2;

            let minX = coords[prev], minY = coords[prev + 1];
            let maxX = minX, maxY = minY;
            for (let i = s; i < end; i += 2) {
                const px = coords[i], py = coords[i + 1];
                if (px < minX) minX = px; else if (px > maxX) maxX = px;
                if (py < minY) minY = py; else if (py > maxY) maxY = py;
            }
            blocks[g] = minX; blocks[g + 1] = minY; blocks[g + 2] = maxX; blocks[g + 3] = maxY;
        }
        ringStart = ringEnd;
    }

    return blocks;
}

// get polygon centroid (over the outer ring, coords[0..ringEnds[0]))
function getCentroidCell(coords, ringEnds, blocks) {
    let area = 0;
    let x = 0;
    let y = 0;
    const end = ringEnds[0];

    for (let i = 0, j = end - 2; i < end; j = i, i += 2) {
        const ax = coords[i];
        const ay = coords[i + 1];
        const bx = coords[j];
        const by = coords[j + 1];
        const f = ax * by - bx * ay;
        x += (ax + bx) * f;
        y += (ay + by) * f;
        area += f * 3;
    }
    const centroid = new Cell(x / area, y / area, 0, coords, ringEnds, blocks, -Infinity, null);
    if (area === 0 || centroid.d < 0) return new Cell(coords[0], coords[1], 0, coords, ringEnds, blocks, -Infinity, null);
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
