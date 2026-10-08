import { createTheme, FieldType, toDataFrame } from '@grafana/data';
import { buildDataDiagram, cleanOverrides, mergeOverrides, nodeSize, overridesFromMove, shortLabel } from '../lib/datadriven';
import { extractGraph } from '../lib/frames';
import { diffFade, emptyFade, fadeFrame, FADE_MS } from '../lib/transitions';
import { DEFAULT_DATA_OPTIONS, EMPTY_DIAGRAM, type FlowDiagram } from '../types';

const theme = createTheme();

const frame = toDataFrame({
  refId: 'A',
  fields: [
    { name: 'source', type: FieldType.string, values: ['web', 'api', 'api'] },
    { name: 'target', type: FieldType.string, values: ['api', 'db', 'cache'] },
    { name: 'Value', type: FieldType.number, values: [10, 4, 1], config: { unit: 'reqps', decimals: 1 } },
    { name: 'target_group', type: FieldType.string, values: ['backend', 'data', 'data'] },
  ],
});

const positions = new Map([
  ['web', { x: 0, y: 0 }],
  ['api', { x: 200, y: 0 }],
  ['db', { x: 400, y: 0 }],
  ['cache', { x: 400, y: 100 }],
]);

describe('buildDataDiagram', () => {
  it('builds nodes and edges with synthetic bound fields, groups and labels', () => {
    const graph = extractGraph([frame], DEFAULT_DATA_OPTIONS);
    const built = buildDataDiagram(graph, positions, { ...DEFAULT_DATA_OPTIONS, showEdgeValues: true }, theme, 12);
    expect(built.diagram.nodes.map((n) => n.id)).toEqual(['api', 'cache', 'db', 'web']);
    const api = built.diagram.nodes.find((n) => n.id === 'api')!;
    expect(api).toMatchObject({ x: 200, y: 0, group: 'backend', status: 'ok', shape: 'card' });
    expect(api.color).toBe(built.groupColors.get('backend'));
    expect(built.groups.sort()).toEqual(['backend', 'data']);
    const edge = built.diagram.edges.find((e) => e.from === 'web')!;
    expect(edge.bind).toEqual({ field: 'edge:web→api', mapTo: 'speed', min: 0, max: 10 });
    expect(built.fields.get('edge:web→api')?.value).toBe(10);
    expect(edge.label).toBe('10.0 req/s');
  });

  it('respects the value mapping option and field min/max', () => {
    const graph = extractGraph([frame], DEFAULT_DATA_OPTIONS);
    graph.edges[0].valueField!.config.max = 50;
    const built = buildDataDiagram(graph, positions, { ...DEFAULT_DATA_OPTIONS, valueMap: 'color' }, theme, 12);
    expect(built.diagram.edges[0].bind?.mapTo).toBe('color');
    expect(built.diagram.edges[0].bind?.max).toBe(50);
    const none = buildDataDiagram(graph, positions, { ...DEFAULT_DATA_OPTIONS, valueMap: 'none' }, theme, 12);
    expect(none.diagram.edges[0].bind).toBeUndefined();
    expect(none.diagram.edges[0].label).toBeUndefined();
  });

  it('shortens long labels and sizes nodes to the text', () => {
    expect(shortLabel('a'.repeat(40))).toHaveLength(28);
    expect(shortLabel('short')).toBe('short');
    expect(nodeSize('ab', 12, false)).toEqual({ w: 96, h: 44 });
    expect(nodeSize('a'.repeat(28), 12, true).w).toBe(Math.round(28 + 28 * 12 * 0.6));
    expect(nodeSize('a'.repeat(100), 12, true).w).toBe(260);
  });
});

describe('overrides', () => {
  const diagram: FlowDiagram = {
    ...EMPTY_DIAGRAM,
    nodes: [
      { id: 'a', label: 'A', x: 0, y: 0, w: 100, h: 40, shape: 'card', status: 'none' },
      { id: 'b', label: 'B', x: 200, y: 0, w: 100, h: 40, shape: 'card', status: 'none' },
    ],
    edges: [],
  };

  it('merges position and look overrides and ignores unknown ids / empty values', () => {
    const out = mergeOverrides(diagram, { a: { x: 50, y: 60, color: 'red', icon: 'bolt', shape: 'pill', label: '' }, zzz: { x: 1 } });
    expect(out.nodes[0]).toMatchObject({ x: 50, y: 60, color: 'red', icon: 'bolt', shape: 'pill', label: 'A', w: 100 + 24 + 22 });
    expect(mergeOverrides(diagram, { b: { shape: 'hub', label: 'A much longer label' } }).nodes[1].w).toBe(Math.round(28 + 19 * 7.2) + 44);
    expect(out.nodes[1]).toEqual(diagram.nodes[1]);
    expect(mergeOverrides(diagram, undefined)).toBe(diagram);
    expect(mergeOverrides(diagram, {})).toBe(diagram);
  });

  it('merges an image override (and widens the node for it) and carries graph images into data nodes', () => {
    const out = mergeOverrides(diagram, { a: { image: 'https://example.test/a.png', icon: 'bolt' } });
    expect(out.nodes[0]).toMatchObject({ image: 'https://example.test/a.png', icon: 'bolt', w: 100 + 24 + 4 });
    expect(cleanOverrides({ a: { image: '' }, b: { image: 'https://example.test/b.png' } })).toEqual({ b: { image: 'https://example.test/b.png' } });
    const graph = extractGraph([frame], DEFAULT_DATA_OPTIONS);
    graph.nodes.find((n) => n.id === 'api')!.image = 'data:image/png;base64,iVBORw0KGgo=';
    const built = buildDataDiagram(graph, positions, DEFAULT_DATA_OPTIONS, theme, 12);
    expect(built.diagram.nodes.find((n) => n.id === 'api')?.image).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(built.diagram.nodes.find((n) => n.id === 'web')?.image).toBeUndefined();
  });

  it('records moved nodes as overrides, keeping existing ones', () => {
    const moved: FlowDiagram = { ...diagram, nodes: [{ ...diagram.nodes[0], x: 20, y: 40 }, diagram.nodes[1]] };
    const out = overridesFromMove({ b: { color: 'green' }, a: { icon: 'cog' } }, diagram, moved);
    expect(out).toEqual({ a: { icon: 'cog', x: 20, y: 40 }, b: { color: 'green' } });
  });

  it('cleans empty entries', () => {
    expect(cleanOverrides({ a: { x: undefined, color: '' }, b: { y: 3 } })).toEqual({ b: { y: 3 } });
  });
});

describe('fade transitions', () => {
  const d = (ids: string[]): FlowDiagram => ({
    ...EMPTY_DIAGRAM,
    nodes: ids.map((id) => ({ id, label: id, x: 0, y: 0, w: 10, h: 10, shape: 'card' as const, status: 'none' as const })),
    edges: ids.length > 1 ? [{ id: `${ids[0]}-${ids[1]}`, from: ids[0], to: ids[1], style: 'bezier', curvature: 0.5, stroke: 1, color: '', dash: 'solid', arrow: true, glow: false, particles: { enabled: false, count: 0, speed: 1, size: 1 } }] : [],
  });

  it('fades new nodes in and removed nodes out, then drops them', () => {
    let state = emptyFade(d(['a', 'b']));
    state = diffFade(state, d(['b', 'c']), 1000);
    let f = fadeFrame(state, 1000);
    expect(f.diagram.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(f.opacity.get('node:c')).toBe(0);
    expect(f.opacity.get('node:a')).toBe(1);
    expect(f.opacity.has('node:b')).toBe(false);
    expect(f.active).toBe(true);
    f = fadeFrame(state, 1000 + FADE_MS / 2);
    expect(f.opacity.get('node:c')).toBeCloseTo(0.5);
    expect(f.opacity.get('node:a')).toBeCloseTo(0.5);
    expect(f.opacity.get('edge:a-b')).toBeCloseTo(0.5);
    f = fadeFrame(state, 1000 + FADE_MS + 1);
    expect(f.active).toBe(false);
    expect(f.diagram.nodes.map((n) => n.id).sort()).toEqual(['b', 'c']);
    expect(f.diagram.edges.map((e) => e.id)).toEqual(['b-c']);
    expect(f.state.entries.size).toBe(0);
  });

  it('reverses a tween in place when a node comes back', () => {
    let state = emptyFade(d(['a']));
    state = diffFade(state, d([]), 0);
    state = diffFade(state, d(['a']), FADE_MS / 4);
    const f = fadeFrame(state, FADE_MS / 4);
    expect(f.opacity.get('node:a')).toBeCloseTo(0.75);
  });
});
