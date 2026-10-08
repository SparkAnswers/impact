import { DEFAULT_EDGE, type FlowEdge, type FlowNode } from '../types';
import {
  bezierPath,
  buildPath,
  edgeGeometry,
  fitViewport,
  hitNode,
  nearestSide,
  orthogonalPath,
  portOffsets,
  portPoint,
  resolveSide,
  snap,
  stepPath,
  straightPath,
  uniqueId,
} from '../lib/geometry';

const rect = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });

describe('resolveSide', () => {
  it('returns an explicit side unchanged', () => {
    expect(resolveSide(rect(0, 0), rect(500, 0), 'top')).toBe('top');
  });
  it('picks right/left for horizontal neighbours', () => {
    expect(resolveSide(rect(0, 0), rect(500, 0), 'auto')).toBe('right');
    expect(resolveSide(rect(500, 0), rect(0, 0), undefined)).toBe('left');
  });
  it('picks top/bottom when the target is clearly above/below', () => {
    expect(resolveSide(rect(0, 0), rect(0, 500), 'auto')).toBe('bottom');
    expect(resolveSide(rect(0, 500), rect(0, 0), 'auto')).toBe('top');
  });
  it('prefers horizontal ports for diagonal targets', () => {
    expect(resolveSide(rect(0, 0), rect(300, 250), 'auto')).toBe('right');
  });
});

describe('portPoint / nearestSide', () => {
  it('places ports on the boundary', () => {
    const r = rect(10, 20, 100, 50);
    expect(portPoint(r, 'left')).toEqual({ x: 10, y: 45 });
    expect(portPoint(r, 'right', 0.25)).toEqual({ x: 110, y: 32.5 });
    expect(portPoint(r, 'top')).toEqual({ x: 60, y: 20 });
    expect(portPoint(r, 'bottom')).toEqual({ x: 60, y: 70 });
  });
  it('finds the nearest side to a point', () => {
    const r = rect(0, 0, 100, 50);
    expect(nearestSide(r, { x: 2, y: 25 })).toBe('left');
    expect(nearestSide(r, { x: 50, y: 48 })).toBe('bottom');
  });
});

describe('path builders', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 60 };
  it('straight', () => {
    expect(straightPath(a, b)).toBe('M0 0 L100 60');
    expect(buildPath('straight', a, b, 'right', 'left', 0.5).d).toBe('M0 0 L100 60');
  });
  it('bezier uses default controls along the side normals', () => {
    const r = buildPath('bezier', a, b, 'right', 'left', 0.5);
    expect(r.c1!.y).toBe(0);
    expect(r.c1!.x).toBeGreaterThan(0);
    expect(r.c2!.y).toBe(60);
    expect(r.c2!.x).toBeLessThan(100);
    expect(r.d.startsWith('M0 0 C')).toBe(true);
    expect(bezierPath(a, b, { x: 50, y: 0 }, { x: 50, y: 60 })).toBe('M0 0 C50 0 50 60 100 60');
  });
  it('bezier honours dragged control points relative to the endpoints', () => {
    const r = buildPath('bezier', a, b, 'right', 'left', 0.5, [
      { dx: 10, dy: -20 },
      { dx: -30, dy: 5 },
    ]);
    expect(r.c1).toEqual({ x: 10, y: -20 });
    expect(r.c2).toEqual({ x: 70, y: 65 });
  });
  it('orthogonal routes through the midpoint with rounded corners', () => {
    const d = orthogonalPath(a, b, 'right', 'left');
    expect(d).toMatch(/^M0 0 H40 Q50 0 50 10 V50 Q50 60 60 60 H100$/);
  });
  it('orthogonal degrades to a straight line for near-collinear ports', () => {
    expect(orthogonalPath(a, { x: 100, y: 3 }, 'right', 'left')).toBe('M0 0 L100 3');
  });
  it('orthogonal vertical variant', () => {
    expect(orthogonalPath(a, { x: 60, y: 100 }, 'bottom', 'top')).toBe('M0 0 V40 Q0 50 10 50 H50 Q60 50 60 60 V100');
  });
  it('step', () => {
    expect(stepPath(a, b, 'right')).toBe('M0 0 H50 V60 H100');
    expect(stepPath(a, b, 'bottom')).toBe('M0 0 V30 H100 V60');
  });
});

describe('edgeGeometry + portOffsets', () => {
  const nodes: FlowNode[] = [
    { id: 'a', label: 'A', x: 0, y: 0, w: 100, h: 50, shape: 'card' },
    { id: 'b', label: 'B', x: 300, y: 0, w: 100, h: 50, shape: 'card' },
    { id: 'c', label: 'C', x: 300, y: 200, w: 100, h: 50, shape: 'card' },
  ];
  const edges: FlowEdge[] = [
    { ...DEFAULT_EDGE, id: 'e1', from: 'a', to: 'b' },
    { ...DEFAULT_EDGE, id: 'e2', from: 'a', to: 'c' },
  ];
  it('spreads two edges leaving the same side, ordered by target position', () => {
    const off = portOffsets(nodes, edges);
    expect(off.get('e1:a')).toBeCloseTo(1 / 3);
    expect(off.get('e2:a')).toBeCloseTo(2 / 3);
    const g1 = edgeGeometry(edges[0], nodes[0], nodes[1], off);
    const g2 = edgeGeometry(edges[1], nodes[0], nodes[2], off);
    expect(g1.aSide).toBe('right');
    expect(g1.a.y).toBeLessThan(g2.a.y);
    expect(g1.b).toEqual({ x: 300, y: 25 });
  });
});

describe('misc helpers', () => {
  it('snap', () => {
    expect(snap(23, 20, true)).toBe(20);
    expect(snap(31, 20, true)).toBe(40);
    expect(snap(31, 20, false)).toBe(31);
  });
  it('fitViewport centres and scales the bounding box', () => {
    const vp = fitViewport([rect(0, 0, 100, 100), rect(300, 300, 100, 100)], 800, 400);
    expect(vp.zoom).toBeCloseTo(0.88, 2);
    // bounding box 400x400 → centred horizontally
    expect(vp.x).toBeCloseTo((800 - 400 * vp.zoom) / 2, 0);
    expect(fitViewport([], 100, 100)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
  it('hitNode returns the top-most hit', () => {
    const nodes: FlowNode[] = [
      { id: 'a', label: 'A', x: 0, y: 0, w: 100, h: 50, shape: 'card' },
      { id: 'b', label: 'B', x: 50, y: 0, w: 100, h: 50, shape: 'card' },
    ];
    expect(hitNode(nodes, { x: 60, y: 10 })?.id).toBe('b');
    expect(hitNode(nodes, { x: 10, y: 10 })?.id).toBe('a');
    expect(hitNode(nodes, { x: 500, y: 10 })).toBeUndefined();
  });
  it('uniqueId avoids taken ids', () => {
    expect(uniqueId('node', new Set(['node1', 'node2']))).toBe('node3');
    expect(uniqueId('node', new Set(['node3']))).toBe('node2');
  });
});
