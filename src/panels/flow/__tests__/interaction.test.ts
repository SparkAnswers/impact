import { layeredLayout, radialLayout, type LayoutNode } from '../lib/layout';
import { MAX_ZOOM, MIN_ZOOM, zoomAt } from '../lib/geometry';
import { groupSegments, segmentsOverlap } from '../lib/groups';
import { fillLinkTemplate, resolveNodeLink, safeHref } from '../lib/links';
import type { FlowNode } from '../types';

describe('zoomAt', () => {
  it('keeps the canvas point under the pointer fixed', () => {
    const vp = { x: 40, y: -10, zoom: 1 };
    const px = 300;
    const py = 120;
    // Canvas point under the pointer before zooming.
    const cx = (px - vp.x) / vp.zoom;
    const cy = (py - vp.y) / vp.zoom;
    const next = zoomAt(vp, px, py, 1.5);
    expect(next.zoom).toBe(1.5);
    expect((px - next.x) / next.zoom).toBeCloseTo(cx);
    expect((py - next.y) / next.zoom).toBeCloseTo(cy);
    const back = zoomAt(next, px, py, 1 / 1.5);
    expect(back.zoom).toBeCloseTo(1);
    expect(back.x).toBeCloseTo(vp.x);
    expect(back.y).toBeCloseTo(vp.y);
  });
  it('clamps and rounds the zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.0001).zoom).toBe(MIN_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 1.23456).zoom).toBe(1.235);
  });
});

describe('links', () => {
  const node: FlowNode = { id: 'api gw/1', label: 'API & gateway', group: 'edge', status: 'warn', x: 0, y: 0, w: 1, h: 1, shape: 'card' };
  const vars = (s: string) => s.replace(/\$\{?site\}?/g, 'eu-1');

  it('fills and URL-encodes node tokens before dashboard variables', () => {
    const out = fillLinkTemplate('/d/x?var-node=${node.id}&l=${node.label}&g=${node.group}&v=${node.value}&s=${node.status}&site=$site', node, '12.5 kW', vars);
    expect(out).toBe('/d/x?var-node=api%20gw%2F1&l=API%20%26%20gateway&g=edge&v=12.5%20kW&s=warn&site=eu-1');
  });
  it('encoded values cannot smuggle variables; missing tokens become empty', () => {
    const n: FlowNode = { ...node, id: '$site', group: undefined, status: undefined };
    expect(fillLinkTemplate('/d?a=${node.id}&g=${node.group}&s=${node.status}', n, undefined, vars)).toBe('/d?a=%24site&g=&s=');
  });
  it('only allows http(s) and relative links', () => {
    expect(safeHref('/d/abc')).toBe('/d/abc');
    expect(safeHref('https://example.test/x')).toBe('https://example.test/x');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('  ')).toBeUndefined();
  });
  it('resolves precedence: manual node link beats template, template beats data link', () => {
    const links = { nodeUrl: '/d/t?n=${node.id}', target: 'same' as const, trigger: 'dblclick' as const };
    const manual: FlowNode = { ...node, id: 'a', link: '/own?x=${node.label}' };
    expect(resolveNodeLink(manual, links, undefined, vars, false)).toBe('/own?x=API%20%26%20gateway');
    expect(resolveNodeLink({ ...manual, link: undefined }, links, undefined, vars, false)).toBe('/d/t?n=a');
    const data: FlowNode = { ...node, id: 'b', link: '/from-field?already=encoded' };
    expect(resolveNodeLink(data, links, undefined, vars, true)).toBe('/d/t?n=b');
    expect(resolveNodeLink(data, { ...links, nodeUrl: '' }, undefined, vars, true)).toBe('/from-field?already=encoded');
    expect(resolveNodeLink(data, { ...links, trigger: 'off' }, undefined, vars, true)).toBeUndefined();
    expect(resolveNodeLink({ ...node, link: undefined }, { ...links, nodeUrl: '' }, undefined, vars, false)).toBeUndefined();
  });
});

describe('group boxes', () => {
  const n = (id: string, group?: string): LayoutNode => ({ id, w: 140, h: 44, group });
  const flow = (nodes: LayoutNode[], edges: Array<[string, string]>, groupGap: number) => {
    const { positions } = layeredLayout(
      nodes,
      edges.map(([source, target]) => ({ source, target })),
      { direction: 'lr', layerGap: 120, nodeGap: 24, groupGap }
    );
    return nodes.map<FlowNode>((x) => ({ id: x.id, label: x.id, group: x.group, ...positions.get(x.id)!, w: x.w, h: x.h, shape: 'card' }));
  };
  // Hosts (no group) → pods in three namespaces → claims in the same namespaces (like the storage chain).
  const nodes = [
    n('host-a'),
    n('host-b'),
    n('pod-a1', 'ns-a'),
    n('pod-b1', 'ns-b'),
    n('pod-a2', 'ns-a'),
    n('pod-c1', 'ns-c'),
    n('pod-b2', 'ns-b'),
    n('pvc-b', 'ns-b'),
    n('pvc-a', 'ns-a'),
    n('pv-1'),
    n('pv-2'),
  ];
  const edges: Array<[string, string]> = [
    ['host-a', 'pod-a1'],
    ['host-a', 'pod-b1'],
    ['host-b', 'pod-a2'],
    ['host-b', 'pod-c1'],
    ['host-a', 'pod-b2'],
    ['pod-b1', 'pvc-b'],
    ['pod-a2', 'pvc-a'],
    ['pvc-a', 'pv-1'],
    ['pvc-b', 'pv-2'],
  ];

  it('keeps nodes of a group contiguous within a layer, in the same order across layers', () => {
    const placed = flow(nodes, edges, 22);
    const layer1 = placed.filter((x) => x.id.startsWith('pod-')).sort((a, b) => a.y - b.y).map((x) => x.group);
    // Groups appear as uninterrupted runs.
    const runs = layer1.filter((g, i) => i === 0 || g !== layer1[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
    const layer2 = placed.filter((x) => x.id.startsWith('pvc-')).sort((a, b) => a.y - b.y).map((x) => x.group!);
    const orderIn1 = runs.filter((g) => layer2.includes(g!));
    expect(layer2).toEqual(orderIn1);
    // The extra group gap sits between the runs.
    const sorted = placed.filter((x) => x.id.startsWith('pod-')).sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].h);
      expect(gap).toBe(sorted[i].group === sorted[i - 1].group ? 24 : 46);
    }
  });

  it('draws one box per layer segment and boxes of different groups never overlap', () => {
    const placed = flow(nodes, edges, 22);
    const segs = groupSegments(placed, 'lr', 14, 16);
    expect(segs.filter((s) => s.group === 'ns-a')).toHaveLength(2); // pods layer + claims layer
    expect(segs.filter((s) => s.group === 'ns-c')).toHaveLength(1);
    expect(segs.filter((s) => s.first).map((s) => s.group).sort()).toEqual(['ns-a', 'ns-b', 'ns-c']);
    for (const a of segs) {
      for (const b of segs) {
        if (a.group !== b.group) {
          expect(segmentsOverlap(a, b)).toBe(false);
        }
      }
    }
    // No box covers a node of another group (or an ungrouped one).
    for (const s of segs) {
      for (const x of placed) {
        if (x.group !== s.group) {
          expect(x.x < s.x + s.w && s.x < x.x + x.w && x.y < s.y + s.h && s.y < x.y + x.h).toBe(false);
        }
      }
    }
    // Every node of the group is inside one of its segments.
    for (const x of placed.filter((p) => p.group)) {
      expect(segs.some((s) => s.group === x.group && x.x >= s.x && x.y >= s.y && x.x + x.w <= s.x + s.w && x.y + x.h <= s.y + s.h)).toBe(true);
    }
  });

  it('radial boxes follow the arcs of a ring and never cover nodes of another group', () => {
    const groups = ['ns-a', 'ns-b', 'ns-c', 'ns-d'];
    // A hub with two rings (18 + 18 nodes) whose groups interleave by id, plus an unrelated component.
    const ring1 = Array.from({ length: 18 }, (_, i) => n(`pod-${i}`, groups[i % 4]));
    const ring2 = Array.from({ length: 18 }, (_, i) => n(`pvc-${i}`, groups[(i + 1) % 4]));
    const other = [n('other'), n('other-1', 'ns-a'), n('other-2', 'ns-a')];
    const all = [n('hub'), ...ring1, ...ring2, ...other];
    const edges = [
      ...ring1.map((x) => ({ source: 'hub', target: x.id })),
      ...ring2.map((x, i) => ({ source: ring1[i].id, target: x.id })),
      ...other.slice(1).map((x) => ({ source: 'other', target: x.id })),
    ];
    const res = radialLayout(all, edges, { direction: 'radial', layerGap: 120, nodeGap: 24, aspect: 1.5 });
    const placed = all.map<FlowNode>((x) => ({ id: x.id, label: x.id, group: x.group, ...res.positions.get(x.id)!, w: x.w, h: x.h, shape: 'card' }));
    const inside = (x: FlowNode, s: { x: number; y: number; w: number; h: number }) => x.x >= s.x && x.y >= s.y && x.x + x.w <= s.x + s.w && x.y + x.h <= s.y + s.h;
    const covers = (s: { x: number; y: number; w: number; h: number }, x: FlowNode) => x.x < s.x + s.w && s.x < x.x + x.w && x.y < s.y + s.h && s.y < x.y + x.h;
    for (const hints of [{ ranks: res.ranks, centres: res.centres }, undefined]) {
      const segs = groupSegments(placed, 'radial', 10, 16, hints);
      // Several compact boxes per group instead of one rectangle across the panel.
      const span = Math.max(...placed.map((x) => x.x + x.w)) - Math.min(...placed.map((x) => x.x));
      for (const s of segs) {
        expect(s.w).toBeLessThan(span / 2);
        for (const x of placed) {
          if (x.group !== s.group) {
            expect(covers(s, x)).toBe(false);
          }
        }
      }
      for (const x of placed.filter((p) => p.group)) {
        expect(segs.some((s) => s.group === x.group && inside(x, s))).toBe(true);
      }
      expect(segs.filter((s) => s.first).map((s) => s.group).sort()).toEqual(groups);
    }
    // With the ring index known, nodes of one group on different rings never share a box.
    const exact = groupSegments(placed, 'radial', 10, 16, { ranks: res.ranks, centres: res.centres });
    for (const s of exact) {
      const members = placed.filter((x) => x.group === s.group && inside(x, s));
      expect(new Set(members.map((x) => res.ranks.get(x.id))).size).toBe(1);
    }
  });

  it('top-to-bottom clusters by y instead of x', () => {
    const placed: FlowNode[] = [
      { id: 'a', label: 'a', group: 'g', x: 0, y: 0, w: 100, h: 40, shape: 'card' },
      { id: 'b', label: 'b', group: 'g', x: 200, y: 0, w: 100, h: 40, shape: 'card' },
      { id: 'c', label: 'c', group: 'g', x: 0, y: 200, w: 100, h: 40, shape: 'card' },
    ];
    expect(groupSegments(placed, 'tb', 10, 10)).toHaveLength(2);
    expect(groupSegments(placed, 'lr', 10, 10)).toHaveLength(2);
  });
});
