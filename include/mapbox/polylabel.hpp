#pragma once

// polylabel — find the pole of inaccessibility (most distant internal point)
// of a polygon, useful for optimal label placement.
//
// This is the C++ port of polylabel v2.1.0 (https://github.com/mapbox/polylabel),
// preserving the public API and mapbox/geometry.hpp dependencies of the prior
// v2.0.1 C++ implementation while bringing in all v2.1.0 algorithmic
// improvements:
//
//   * Clamped initial cell size: cellSize = max(precision, min(width, height)),
//     with an immediate early-out when min(width, height) <= precision (covers
//     degenerate / sub-precision polygons).
//   * Flattened, cache-friendly coordinate buffer + per-ring end offsets,
//     eliminating pointer-chasing in the hot distance loop.
//   * Block-based bounding-box skipping: K consecutive edges share one bbox so
//     whole blocks are skipped in O(1) when they can neither improve the
//     distance nor flip the ray-cast parity.
//   * Early-out distance threshold: a child cell whose distance is provably
//     unable to beat the current best (or to be worth subdividing) bails out
//     of the outline scan as soon as that fact is established.
//   * Seed-based segment warm-start: each cell records its nearest segment and
//     hands it to its children, which almost always share the same nearest
//     segment and thus reach the early-out threshold without a full scan.
//   * Aggressive queue pruning: a cell is enqueued only if it can still beat
//     the best by more than `precision`; the main loop can `break` (not just
//     `continue`) on the first cell that cannot, because the priority queue is
//     ordered by decreasing potential.
//   * Centroid fallback: if the outer ring has zero area or the centroid lands
//     outside the polygon, fall back to the first vertex.
//
// The result is bit-identical to v2.0.1 for all existing test fixtures while
// being substantially faster on large polygons.

#include <mapbox/geometry/polygon.hpp>
#include <mapbox/geometry/envelope.hpp>
#include <mapbox/geometry/point.hpp>
#include <mapbox/geometry/point_arithmetic.hpp>

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <limits>
#include <queue>
#include <vector>

namespace mapbox {

namespace detail {

// number of consecutive edges grouped under a single bounding box for block-skip
constexpr std::size_t K = 32;

// get squared distance from a point (px, py) to a segment (x, y)-(bx, by)
template <class T>
T getSegDistSq(T px, T py, T x, T y, T bx, T by) {
    auto dx = bx - x;
    auto dy = by - y;

    if (dx != 0 || dy != 0) {
        auto t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

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

// flattened polygon: a contiguous coordinate buffer + ring end offsets +
// precomputed per-block bounding boxes for O(1) block-skip in the hot distance
// loop. Built once per polylabel() call and shared (by const reference) across
// all cells.
template <class T>
struct FlatPolygon {
    std::vector<T> coords;             // x0,y0,x1,y1,... (rings concatenated)
    std::vector<std::size_t> ringEnds; // end offset (exclusive) into coords, per ring
    std::vector<T> blocks;             // minX,minY,maxX,maxY per block of K edges
};

template <class T>
FlatPolygon<T> flatten(const geometry::polygon<T>& polygon) {
    FlatPolygon<T> fp;

    std::size_t numPoints = 0;
    for (const auto& ring : polygon) numPoints += ring.size();
    fp.coords.reserve(numPoints * 2);
    fp.ringEnds.reserve(polygon.size());

    for (const auto& ring : polygon) {
        for (const auto& p : ring) {
            fp.coords.push_back(p.x);
            fp.coords.push_back(p.y);
        }
        fp.ringEnds.push_back(fp.coords.size());
    }

    // precompute one bounding box per block of K consecutive edges (over both
    // endpoints of every edge in it) so the distance scan can skip whole blocks
    // in O(1). The block layout mirrors the flattened coords/ringEnds and is
    // re-derived in the scan, so only the bboxes need storing: a flat
    // [minX,minY,maxX,maxY] run per block.
    const std::size_t stride = K * 2;
    std::size_t numBlocks = 0;
    std::size_t ringStart = 0;
    for (std::size_t r = 0; r < fp.ringEnds.size(); r++) {
        numBlocks += (fp.ringEnds[r] - ringStart + stride - 1) / stride; // ceil
        ringStart = fp.ringEnds[r];
    }

    fp.blocks.resize(numBlocks * 4);
    std::size_t g = 0;
    ringStart = 0;
    for (std::size_t r = 0; r < fp.ringEnds.size(); r++) {
        const std::size_t ringEnd = fp.ringEnds[r];
        for (std::size_t s = ringStart; s < ringEnd; s += stride, g += 4) {
            const std::size_t end = (s + stride < ringEnd) ? s + stride : ringEnd;
            // include the vertex preceding the block so the block's first edge
            // (which connects to it) is accounted for in the bbox
            const std::size_t prev = (s == ringStart) ? ringEnd - 2 : s - 2;

            T minX = fp.coords[prev], minY = fp.coords[prev + 1];
            T maxX = minX, maxY = minY;
            for (std::size_t i = s; i < end; i += 2) {
                const T px = fp.coords[i], py = fp.coords[i + 1];
                if (px < minX) minX = px; else if (px > maxX) maxX = px;
                if (py < minY) minY = py; else if (py > maxY) maxY = py;
            }
            fp.blocks[g] = minX;
            fp.blocks[g + 1] = minY;
            fp.blocks[g + 2] = maxX;
            fp.blocks[g + 3] = maxY;
        }
        ringStart = ringEnd;
    }

    return fp;
}

template <class T>
struct Cell;

// signed distance from cell center to polygon outline (negative if outside),
// also recording the nearest segment on the cell. maxD is a distance threshold:
// if a partial result proves the center is no farther than maxD from the
// outline, the scan bails out early and returns maxD, since the caller has
// already determined such a cell can't beat the best. seed is the parent cell
// (or nullptr); its nearest segment is checked first so boundary cells reach
// the early-out threshold without scanning the whole outline.
template <class T>
T pointToPolygonDist(Cell<T>& cell, const FlatPolygon<T>& fp, T maxD, const Cell<T>* seed);

template <class T>
struct Cell {
    Cell(T x_, T y_, T h_, const FlatPolygon<T>& fp, T maxD, const Cell<T>* seed)
        : x(x_),
          y(y_),
          h(h_),
          nsx1(0), nsy1(0), nsx2(0), nsy2(0),
          d(pointToPolygonDist(*this, fp, maxD, seed)),
          max(d + h * std::sqrt(static_cast<T>(2)))
        {}

    T x;  // cell center x
    T y;  // cell center y
    T h;  // half the cell size
    // nsx1..nsy2 hold the nearest segment found below, so child cells can seed
    // their scan with it (a child is almost always nearest to the same segment)
    T nsx1, nsy1, nsx2, nsy2;
    T d;   // distance from cell center to polygon
    T max; // max distance to polygon within a cell
};

template <class T>
T pointToPolygonDist(Cell<T>& cell, const FlatPolygon<T>& fp, T maxD, const Cell<T>* seed) {
    const T x = cell.x;
    const T y = cell.y;
    bool inside = false;
    T minDistSq = std::numeric_limits<T>::infinity();
    const T thresholdSq = maxD > 0 ? maxD * maxD : T(-1);

    if (seed != nullptr) {
        cell.nsx1 = seed->nsx1;
        cell.nsy1 = seed->nsy1;
        cell.nsx2 = seed->nsx2;
        cell.nsy2 = seed->nsy2;
        minDistSq = getSegDistSq(x, y, seed->nsx1, seed->nsy1, seed->nsx2, seed->nsy2);
        if (minDistSq <= thresholdSq) return maxD;
    }

    const std::size_t stride = K * 2;
    const std::size_t numRings = fp.ringEnds.size();
    std::size_t g = 0; // running block index into bboxes
    std::size_t ringStart = 0;

    for (std::size_t r = 0; r < numRings; r++) {
        const std::size_t ringEnd = fp.ringEnds[r];

        // previous vertex (b), starting from the last point in the ring; carried
        // across blocks so each block's first edge connects to the prior vertex
        T bx = fp.coords[ringEnd - 2];
        T by = fp.coords[ringEnd - 1];

        for (std::size_t s = ringStart; s < ringEnd; s += stride, g += 4) {
            std::size_t end = s + stride;
            if (end > ringEnd) end = ringEnd;
            const T bminX = fp.blocks[g], bminY = fp.blocks[g + 1],
                    bmaxX = fp.blocks[g + 2], bmaxY = fp.blocks[g + 3];

            // lower bound on the distance from (x, y) to any edge in this block
            const T dx = x < bminX ? bminX - x : x > bmaxX ? x - bmaxX : T(0);
            const T dy = y < bminY ? bminY - y : y > bmaxY ? y - bmaxY : T(0);
            const bool skipDist = dx * dx + dy * dy >= minDistSq;

            // this block's edges can only flip ray-cast parity if its bbox
            // straddles y and extends right of x; else no edge crosses the
            // rightward ray
            const bool skipCross = y < bminY || y >= bmaxY || x > bmaxX;

            if (skipDist && skipCross) {
                bx = fp.coords[end - 2];
                by = fp.coords[end - 1];
                continue;
            }

            for (std::size_t i = s; i < end; i += 2) {
                const T ax = fp.coords[i];
                const T ay = fp.coords[i + 1];

                if (!skipCross && (ay > y) != (by > y) &&
                    (x < (bx - ax) * (y - ay) / (by - ay) + ax)) inside = !inside;

                if (!skipDist) {
                    const T distSq = getSegDistSq(x, y, ax, ay, bx, by);
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        cell.nsx1 = ax; cell.nsy1 = ay;
                        cell.nsx2 = bx; cell.nsy2 = by;

                        // the point is already close enough to the outline that
                        // this cell can't possibly contain a better label
                        // position — stop scanning
                        if (minDistSq <= thresholdSq) return maxD;
                    }
                }

                bx = ax;
                by = ay;
            }
        }
        ringStart = ringEnd;
    }

    return minDistSq == 0 ? T(0) : (inside ? T(1) : T(-1)) * std::sqrt(minDistSq);
}

// get polygon centroid (over the outer ring, coords[0..ringEnds[0]))
template <class T>
Cell<T> getCentroidCell(const FlatPolygon<T>& fp) {
    T area = 0;
    T x = 0;
    T y = 0;
    const std::size_t end = fp.ringEnds[0];

    for (std::size_t i = 0, j = end - 2; i < end; j = i, i += 2) {
        const T ax = fp.coords[i];
        const T ay = fp.coords[i + 1];
        const T bx = fp.coords[j];
        const T by = fp.coords[j + 1];
        const T f = ax * by - bx * ay;
        x += (ax + bx) * f;
        y += (ay + by) * f;
        area += f * T(3);
    }

    const T negInf = -std::numeric_limits<T>::infinity();
    if (area == 0) {
        return Cell<T>(fp.coords[0], fp.coords[1], T(0), fp, negInf, nullptr);
    }
    Cell<T> centroid(x / area, y / area, T(0), fp, negInf, nullptr);
    if (centroid.d < 0) {
        return Cell<T>(fp.coords[0], fp.coords[1], T(0), fp, negInf, nullptr);
    }
    return centroid;
}

} // namespace detail

// Find the pole of inaccessibility of `polygon` (the most distant internal
// point from the polygon outline) within `precision`.
//
// If `distance` is non-null, it receives the signed distance from the returned
// point to the polygon outline (positive inside, negative outside, 0 on the
// boundary), matching the `.distance` property exposed by the v2.1.0 JS API.
template <class T>
geometry::point<T> polylabel(const geometry::polygon<T>& polygon, T precision = 1, bool debug = false, T* distance = nullptr) {
    using namespace detail;

    // find the bounding box of the outer ring
    const geometry::box<T> envelope = geometry::envelope(polygon.at(0));
    const T minX = envelope.min.x;
    const T minY = envelope.min.y;
    const T maxX = envelope.max.x;
    const T maxY = envelope.max.y;

    const T width = maxX - minX;
    const T height = maxY - minY;
    const T cellSize = std::max(precision, std::min(width, height));

    if (cellSize == precision) {
        // degenerate / sub-precision polygon: no interior to search
        if (distance) *distance = T(0);
        return envelope.min;
    }

    // flatten the polygon rings into a single contiguous coordinate buffer for
    // cache-friendly, pointer-chase-free access in the hot distance loop
    FlatPolygon<T> fp = flatten(polygon);

    // a priority queue of cells in order of their "potential" (max distance to polygon)
    auto compareMax = [](const Cell<T>& a, const Cell<T>& b) {
        return a.max < b.max;
    };
    using Queue = std::priority_queue<Cell<T>, std::vector<Cell<T>>, decltype(compareMax)>;
    Queue cellQueue(compareMax);

    const T negInf = -std::numeric_limits<T>::infinity();

    // take centroid as the first best guess
    Cell<T> bestCell = getCentroidCell(fp);

    // second guess: bounding box centroid
    Cell<T> bboxCell(minX + width / T(2), minY + height / T(2), T(0), fp, negInf, nullptr);
    if (bboxCell.d > bestCell.d) bestCell = bboxCell;

    std::size_t numProbes = 2;

    auto potentiallyQueue = [&](T cx, T cy, T h, const Cell<T>* seed) {
        // a cell is only useful if it can beat the best (d > bestCell.d) or is
        // worth subdividing (max = d + h·√2 > bestCell.d + precision). Both
        // fail once d ≤ threshold, so the distance scan can bail there early.
        const T threshold = bestCell.d - std::max(T(0), h * std::sqrt(static_cast<T>(2)) - precision);
        Cell<T> cell(cx, cy, h, fp, threshold, seed);
        numProbes++;
        if (cell.max > bestCell.d + precision) cellQueue.push(cell);

        // update the best cell if we found a better one
        if (cell.d > bestCell.d) {
            bestCell = cell;
            if (debug) std::cout << "found best " << std::round(1e4 * cell.d) / 1e4 << " after " << numProbes << " probes" << std::endl;
        }
    };

    // cover polygon with initial cells
    T h = cellSize / T(2);
    for (T x = minX; x < maxX; x += cellSize) {
        for (T y = minY; y < maxY; y += cellSize) {
            potentiallyQueue(x + h, y + h, h, nullptr);
        }
    }

    while (!cellQueue.empty()) {
        // pick the most promising cell from the queue
        Cell<T> cell = cellQueue.top();
        cellQueue.pop();

        // do not drill down further if there's no chance of a better solution.
        // because the queue is ordered by decreasing `max`, every subsequent
        // cell is no better either, so we can stop entirely.
        if (cell.max - bestCell.d <= precision) break;

        // split the cell into four cells, seeding each with the parent's nearest segment
        h = cell.h / T(2);
        potentiallyQueue(cell.x - h, cell.y - h, h, &cell);
        potentiallyQueue(cell.x + h, cell.y - h, h, &cell);
        potentiallyQueue(cell.x - h, cell.y + h, h, &cell);
        potentiallyQueue(cell.x + h, cell.y + h, h, &cell);
    }

    if (debug) {
        std::cout << "num probes: " << numProbes << std::endl;
        std::cout << "best distance: " << bestCell.d << std::endl;
    }

    if (distance) *distance = bestCell.d;
    return geometry::point<T>{bestCell.x, bestCell.y};
}

} // namespace mapbox
