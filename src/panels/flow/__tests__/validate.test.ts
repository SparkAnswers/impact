import { createExampleDiagram } from '../lib/example';
import { normalizeDiagram, parseDiagramJson, validateDiagram } from '../lib/validate';

describe('validateDiagram', () => {
  it('accepts the example diagram round-tripped through JSON', () => {
    const res = parseDiagramJson(JSON.stringify(createExampleDiagram()));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.diagram.nodes).toHaveLength(10);
      expect(res.diagram.edges).toHaveLength(9);
      expect(res.diagram.edges[0].bind?.mapTo).toBe('speed');
    }
  });
  it('keeps the example node images (safe data URLs) through validation', () => {
    const res = parseDiagramJson(JSON.stringify(createExampleDiagram()));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.diagram.nodes.find((n) => n.id === 'solar')?.image).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(res.diagram.nodes.find((n) => n.id === 'grid')?.image).toBeUndefined();
    }
  });
  it('accepts http(s) and data:image node images, trimmed', () => {
    const res = validateDiagram({
      nodes: [
        { id: 'a', x: 0, y: 0, image: '  https://example.test/a.png ' },
        { id: 'b', x: 0, y: 0, image: 'data:image/png;base64,iVBORw0KGgo=' },
        { id: 'c', x: 0, y: 0, image: '' },
      ],
      edges: [],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.diagram.nodes.map((n) => n.image)).toEqual(['https://example.test/a.png', 'data:image/png;base64,iVBORw0KGgo=', undefined]);
    }
  });
  it('rejects node images with unsafe schemes', () => {
    for (const image of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///x.png', '/relative.png']) {
      const res = validateDiagram({ nodes: [{ id: 'a', x: 0, y: 0, image }], edges: [] });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors).toEqual(['nodes[0].image must be an http(s) or data:image URL']);
      }
    }
    // Stored options with a bad URL: normalised without the image rather than thrown away.
    const norm = normalizeDiagram({ nodes: [{ id: 'a', x: 1, y: 2, icon: 'bolt', image: 'javascript:alert(1)' }], edges: [] });
    expect(norm.nodes).toHaveLength(1);
    expect(norm.nodes[0].image).toBeUndefined();
    expect(norm.nodes[0].icon).toBe('bolt');
  });
  it('rejects invalid JSON', () => {
    const res = parseDiagramJson('{nope');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]).toMatch(/Invalid JSON/);
    }
  });
  it('rejects non-objects and missing arrays', () => {
    expect(validateDiagram(null).ok).toBe(false);
    expect(validateDiagram([]).ok).toBe(false);
    const res = validateDiagram({ nodes: 'x' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors).toEqual(['"nodes" must be an array', '"edges" must be an array']);
    }
  });
  it('rejects bad node shapes, duplicate ids and dangling edges', () => {
    const res = validateDiagram({
      nodes: [
        { id: 'a', x: 0, y: 0, shape: 'hexagon' },
        { id: 'a', x: 'zero', y: 0 },
      ],
      edges: [{ id: 'e', from: 'a', to: 'missing', style: 'wiggly', controlPoints: [{ dx: 1 }] }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/nodes\[0\]\.shape/),
          expect.stringMatching(/nodes\[1\]\.x must be a number/),
          expect.stringMatching(/duplicated/),
          expect.stringMatching(/unknown node "missing"/),
          expect.stringMatching(/edges\[0\]\.style/),
          expect.stringMatching(/controlPoints/),
        ])
      );
    }
  });
  it('rejects a bad binding', () => {
    const res = validateDiagram({
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 0, y: 0 },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', bind: { field: 'x', mapTo: 'opacity' } }],
    });
    expect(res.ok).toBe(false);
  });
  it('applies defaults, clamps values and strips markup', () => {
    const res = validateDiagram({
      nodes: [{ id: 'a', x: 0, y: 0, label: '<b>Hi</b>', icon: 'bolt', extra: 1 }],
      edges: [{ id: 'e', from: 'a', to: 'a', stroke: 99, curvature: 7, particles: { count: 100 } }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const n = res.diagram.nodes[0];
      expect(n.label).toBe('bHi/b');
      expect(n.shape).toBe('card');
      expect(n.w).toBe(140);
      expect((n as unknown as { extra?: number }).extra).toBeUndefined();
      const e = res.diagram.edges[0];
      expect(e.stroke).toBe(12);
      expect(e.curvature).toBe(1);
      expect(e.particles.count).toBe(12);
      expect(e.particles.enabled).toBe(true);
      expect(e.style).toBe('bezier');
      expect(res.diagram.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(res.diagram.grid.size).toBe(20);
    }
  });
});

describe('normalizeDiagram', () => {
  it('returns an empty diagram for garbage', () => {
    expect(normalizeDiagram(undefined).nodes).toEqual([]);
    expect(normalizeDiagram('x').edges).toEqual([]);
  });
  it('keeps valid nodes and drops broken edges', () => {
    const d = normalizeDiagram({ nodes: [{ id: 'a', x: 1, y: 2 }, { id: 'b' }], edges: [{ id: 'e', from: 'a', to: 'zzz' }] });
    expect(d.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(d.edges).toEqual([]);
  });
});
