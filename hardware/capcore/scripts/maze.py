"""A small grid (A*) router for the few long connections the autorouter gives up on.

It routes one pad to the rest of its net over F.Cu, In2.Cu and B.Cu (In1.Cu is
the ground plane), keeping CLEAR mm from other nets and placing through vias
where it changes layer. Existing copper is never moved.
"""

import heapq
import math

import numpy as np
import pcbnew
import shapely
from shapely.geometry import Point

import gen_pcb
import preroute
from preroute import CLEAR, F, IN2, B, LAYERS

GRID = 0.1
ROUTE_LAYERS = (F, IN2, B)
EDGE = 0.3             # copper to board edge
HOLE_GAP = 0.3         # drill to drill


class Maze:
    def __init__(self, board):
        self.board = board
        self.cu = preroute.Copper(board)
        self.nx = int(round(gen_pcb.W / GRID)) + 1
        self.ny = int(round(gen_pcb.H / GRID)) + 1
        xs = np.arange(self.nx) * GRID
        ys = np.arange(self.ny) * GRID
        self.X, self.Y = np.meshgrid(xs, ys)

    def _mark(self, grid, geom):
        minx, miny, maxx, maxy = geom.bounds
        i0, i1 = max(0, int(minx / GRID)), min(self.nx, int(maxx / GRID) + 2)
        j0, j1 = max(0, int(miny / GRID)), min(self.ny, int(maxy / GRID) + 2)
        if i0 >= i1 or j0 >= j1:
            return
        grid[j0:j1, i0:i1] |= shapely.contains_xy(geom, self.X[j0:j1, i0:i1], self.Y[j0:j1, i0:i1])

    def _edge(self, grid, margin):
        w, h = gen_pcb.W, gen_pcb.H
        grid |= (self.X < margin) | (self.Y < margin) | (self.X > w - margin) | (self.Y > h - margin)

    def blocked(self, net, layer, width):
        g = np.zeros((self.ny, self.nx), bool)
        for geom, n, ls, kind in self.cu.items:
            if layer not in ls or (n == net and kind != "keepout"):
                continue
            self._mark(g, geom.buffer(width / 2 + (0 if kind == "keepout" else CLEAR)))
        self._edge(g, EDGE + width / 2)
        return g

    def via_blocked(self, net, d, drill):
        g = np.zeros((self.ny, self.nx), bool)
        for geom, n, ls, kind in self.cu.items:
            if n == net and kind not in ("keepout", "pad"):
                continue
            if kind == "keepout" and not (ls & set(LAYERS)):
                continue
            gap = 0.05 if n == net else (0 if kind == "keepout" else CLEAR)
            self._mark(g, geom.buffer(d / 2 + gap))
        for h, r in self.cu.holes:
            self._mark(g, h.buffer(r + drill / 2 + HOLE_GAP))
        self._edge(g, EDGE + d / 2)
        return g

    def target_cells(self, geoms_by_layer):
        out = {}
        for li, layer in enumerate(ROUTE_LAYERS):
            g = np.zeros((self.ny, self.nx), bool)
            for geom in geoms_by_layer.get(layer, []):
                self._mark(g, geom)
            out[li] = g
        return out

    def route(self, net, start_geom, goal_geoms, width, via_d=preroute.VIA_D,
              via_drill=preroute.VIA_DRILL, via_cost=25.0):
        """start_geom: {layer: [geom]} where the path may begin; goal_geoms likewise."""
        blocked = [self.blocked(net, l, width) for l in ROUTE_LAYERS]
        vblock = self.via_blocked(net, via_d, via_drill)
        starts = self.target_cells(start_geom)
        goals = self.target_cells(goal_geoms)
        gy, gx = [], []
        for li in goals:
            jj, ii = np.nonzero(goals[li])
            gy.extend(jj)
            gx.extend(ii)
        if not gy:
            raise ValueError("no goal cells for " + net)
        gx0, gx1, gy0, gy1 = min(gx), max(gx), min(gy), max(gy)

        def h(j, i):
            dx = max(gx0 - i, 0, i - gx1)
            dy = max(gy0 - j, 0, j - gy1)
            return max(dx, dy) + (math.sqrt(2) - 1) * min(dx, dy)

        dist = {}
        prev = {}
        pq = []
        for li in starts:
            for j, i in zip(*np.nonzero(starts[li])):
                s = (li, int(j), int(i))
                dist[s] = 0.0
                heapq.heappush(pq, (h(j, i), 0.0, s))
        steps = [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1),
                 (-1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)), (1, 1, math.sqrt(2))]
        end = None
        while pq:
            f, d, s = heapq.heappop(pq)
            if d > dist.get(s, 1e18):
                continue
            li, j, i = s
            if goals[li][j, i] and not starts[li][j, i]:
                end = s
                break
            for dj, di, c in steps:
                jj, ii = j + dj, i + di
                if not (0 <= jj < self.ny and 0 <= ii < self.nx) or blocked[li][jj, ii]:
                    continue
                t = (li, jj, ii)
                nd = d + c
                if nd < dist.get(t, 1e18):
                    dist[t] = nd
                    prev[t] = s
                    heapq.heappush(pq, (nd + h(jj, ii), nd, t))
            if not vblock[j, i]:
                for lj in range(len(ROUTE_LAYERS)):
                    if lj == li or blocked[lj][j, i]:
                        continue
                    t = (lj, j, i)
                    nd = d + via_cost
                    if nd < dist.get(t, 1e18):
                        dist[t] = nd
                        prev[t] = s
                        heapq.heappush(pq, (nd + h(j, i), nd, t))
        if end is None:
            raise RuntimeError(f"no path for {net}")
        path = [end]
        while path[-1] in prev:
            path.append(prev[path[-1]])
        path.reverse()
        return self._emit(net, path, width, via_d, via_drill)

    def _emit(self, net, path, width, via_d, via_drill):
        """Turn a cell path into straight track runs and vias."""
        runs, vias = [], []
        cur = [path[0]]
        for a, b in zip(path, path[1:]):
            if a[0] != b[0]:
                runs.append(cur)
                vias.append((a[2] * GRID, a[1] * GRID))
                cur = [b]
            else:
                cur.append(b)
        runs.append(cur)
        n_seg = 0
        for run in runs:
            if len(run) < 2:
                continue
            layer = ROUTE_LAYERS[run[0][0]]
            pts = [run[0]]
            for k in range(1, len(run) - 1):
                d1 = (run[k][1] - run[k - 1][1], run[k][2] - run[k - 1][2])
                d2 = (run[k + 1][1] - run[k][1], run[k + 1][2] - run[k][2])
                if d1 != d2:
                    pts.append(run[k])
            pts.append(run[-1])
            xy = [(p[2] * GRID, p[1] * GRID) for p in pts]
            preroute.track(self.board, net, xy, width, layer)
            n_seg += len(xy) - 1
        for v in vias:
            preroute.via(self.board, net, v, via_d, via_drill)
        return n_seg, len(vias)


def pad_geoms(board, ref, num):
    fp = board.FindFootprintByReference(ref)
    out = {}
    for p in fp.Pads():
        if p.GetNumber() != num:
            continue
        o = p.GetEffectivePolygon().Outline(0)
        g = shapely.Polygon([(pcbnew.ToMM(o.CPoint(i).x), pcbnew.ToMM(o.CPoint(i).y))
                             for i in range(o.PointCount())])
        layers = [F] if p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD else list(ROUTE_LAYERS)
        for l in layers:
            out.setdefault(l, []).append(g)
    return out


def net_geoms(board, net, exclude_pad=None):
    """All copper of a net (pads, tracks, vias) by layer, minus one pad."""
    cu = preroute.Copper(board)
    ex = None
    if exclude_pad:
        ex = shapely.unary_union([g for gs in pad_geoms(board, *exclude_pad).values() for g in gs])
    out = {}
    for geom, n, ls, kind in cu.items:
        if n != net:
            continue
        if ex is not None and kind == "pad" and geom.intersection(ex).area > 0.5 * geom.area:
            continue
        for l in ls:
            if l in ROUTE_LAYERS:
                out.setdefault(l, []).append(geom)
    return out


def connect(board, net, ref, num, width):
    """Route pad ref.num to the nearest other copper of its net."""
    m = Maze(board)
    start = pad_geoms(board, ref, num)
    goal = net_geoms(board, net, exclude_pad=(ref, num))
    return m.route(net, start, goal, width)
