import { applyPreset, type PresetCatalog, type QuickStartOptions } from '../presets';
import { BARS_PRESETS } from '../../panels/bars/presets';
import { FLOW_PRESETS } from '../../panels/flow/presets';
import { GAUGE_PRESETS } from '../../panels/gauge/presets';
import { RIVER_PRESETS } from '../../panels/river/presets';

const catalogs: Array<[string, PresetCatalog<QuickStartOptions & Record<string, unknown>>]> = [
  ['flow', FLOW_PRESETS as never],
  ['gauge', GAUGE_PRESETS as never],
  ['river', RIVER_PRESETS as never],
  ['bars', BARS_PRESETS as never],
];

describe.each(catalogs)('%s presets', (_name, catalog) => {
  it('has unique ids, a label and a description each, and at least four presets', () => {
    expect(catalog.presets.length).toBeGreaterThanOrEqual(4);
    const ids = catalog.presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of catalog.presets) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  it('every preset applies on top of the defaults and keeps every default key', () => {
    for (const p of catalog.presets) {
      const out = applyPreset(catalog, p, catalog.defaults, { preset: p.id, token: 1 });
      for (const [key, value] of Object.entries(catalog.defaults)) {
        if (value !== undefined) {
          expect((out as Record<string, unknown>)[key]).toBeDefined();
        }
      }
      expect(out.quickStart).toEqual({ preset: p.id, token: 1, applied: 1 });
    }
  });

  it('does not store a dangling edit mode', () => {
    for (const p of catalog.presets) {
      const out = applyPreset(catalog, p, catalog.defaults, { preset: p.id, token: 1 }) as Record<string, any>;
      expect(out.layout?.editMode ?? false).toBe(false);
      expect(out.network?.editNodes ?? false).toBe(false);
    }
  });
});

describe('flow presets', () => {
  it('site power loads the example diagram while data presets keep a drawn one', () => {
    const site = FLOW_PRESETS.presets.find((p) => p.id === 'site-power')!;
    const out = applyPreset(FLOW_PRESETS, site, FLOW_PRESETS.defaults, { preset: site.id, token: 1 });
    expect(out.diagram.nodes.length).toBeGreaterThan(5);
    expect(out.data.source).toBe('manual');
    const graph = FLOW_PRESETS.presets.find((p) => p.id === 'service-graph')!;
    const next = applyPreset(FLOW_PRESETS, graph, { ...out, data: { ...out.data, sourceField: 'client' } }, { preset: graph.id, token: 2 });
    expect(next.data.source).toBe('data');
    expect(next.data.sourceField).toBe('client');
    expect(next.diagram.nodes.length).toBe(out.diagram.nodes.length);
  });
});

describe('flow presets', () => {
  it('look-only presets keep data-driven settings, data presets override them', () => {
    const current = {
      ...FLOW_PRESETS.defaults,
      data: { ...FLOW_PRESETS.defaults.data, source: 'data' as const, layout: 'radial' as const, valueMap: 'width' as const, topN: 5 },
    };
    const minimal = FLOW_PRESETS.presets.find((p) => p.id === 'minimal')!;
    const out = applyPreset(FLOW_PRESETS, minimal, current, { preset: minimal.id, token: 1 });
    expect(out.data).toMatchObject({ source: 'data', layout: 'radial', valueMap: 'width', topN: 5 });
    expect(out.appearance.nodeStyle).toBe('minimal');
    const graph = FLOW_PRESETS.presets.find((p) => p.id === 'service-graph')!;
    const next = applyPreset(FLOW_PRESETS, graph, current, { preset: graph.id, token: 2 });
    expect(next.data).toMatchObject({ source: 'data', layout: 'lr', valueMap: 'speed', topN: 5 });
  });
});

describe('river presets', () => {
  it('manual presets ship complete channels and network presets none', () => {
    for (const p of RIVER_PRESETS.presets) {
      const out = applyPreset(RIVER_PRESETS, p, RIVER_PRESETS.defaults, { preset: p.id, token: 1 });
      if (out.channelSource === 'network') {
        expect(out.channels).toEqual([]);
      } else {
        expect(out.channels.length).toBeGreaterThan(0);
        for (const c of out.channels) {
          expect(c.particles.trail).toBeGreaterThan(0);
          expect(c.path.length).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});

describe('bars presets', () => {
  it('keeps column choices', () => {
    const p = BARS_PRESETS.presets.find((x) => x.id === 'compact')!;
    const out = applyPreset(BARS_PRESETS, p, { ...BARS_PRESETS.defaults, nameField: 'host', stackFields: ['a', 'b'] }, { preset: p.id, token: 1 });
    expect(out.nameField).toBe('host');
    expect(out.stackFields).toEqual(['a', 'b']);
    expect(out.density).toBe('compact');
  });
});
