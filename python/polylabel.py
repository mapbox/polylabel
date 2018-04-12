#!/usr/bin/env python
# -*- coding: utf-8 -*-
import math
import shapely.geometry
from heapq import heappush, heappop


class Polylabel(object):
    def __init__(self, percision=1.0):
        self.MAX_PROBES = 10000
        self.percision = percision

    def polylabel(self, polygon):
        """ implement api
        :param polygon:  list of ring
        :return: x, y
        """

        ring = polygon[0]  # outer ring
        listx = [p[0] for p in ring]
        listy = [p[1] for p in ring]
        minx, maxx, miny, maxy = min(listx), max(listx), min(listy), max(listy)
        width, height = (maxx - minx), (maxy - miny)
        cell_size = min([width, height])
        h = cell_size / 2.0

        def wrap(x, y, h):
            dist = self._point_to_polygon_dist_min([x, y], polygon)
            w = dist + math.sqrt(2) * h
            return (-w, w, dist, x, y, h)  # -w for reverse sort

        queue = []
        x, y = minx, miny
        while x < maxx:
            while y < maxy:
                center_x, center_y = x+h, y+h
                cell = wrap(center_x, center_y, h)
                heappush(queue, cell)
                y += cell_size
            x += cell_size

        num_probes = 0
        best_cell = None
        while queue:
            num_probes += 1
            if num_probes > self.MAX_PROBES:
                break

            idx, w, dist, center_x, center_y, h = heappop(queue)
            if best_cell is None or dist > best_cell[2]:
                best_cell = (idx, w, dist, center_x, center_y, h)
            if w - best_cell[2] <= self.percision:
                continue

            h = h/2.0
            heappush(queue, wrap(center_x-h, center_y-h, h))
            heappush(queue, wrap(center_x+h, center_y-h, h))
            heappush(queue, wrap(center_x-h, center_y+h, h))
            heappush(queue, wrap(center_x+h, center_y+h, h))
        return best_cell[3], best_cell[4]

    def _point_to_polygon_dist_min(self, point, polygon):
        """ signed distance from point to polygon outline (negative if point
            is outside)
        :param point: the center point
        :param polygon: polygon
        :return: minimum distance
        """
        min_dist = None
        is_inside = False

        shp_p = shapely.geometry.Point(point)
        for ring in polygon:
            shp_polygon = shapely.geometry.Polygon(ring)
            dist = shp_polygon.boundary.distance(shp_p)
            if min_dist is None or min_dist > dist:
                min_dist = dist

            if shp_polygon.contains(shp_p):
                is_inside = not is_inside

        return min_dist if is_inside else -min_dist
