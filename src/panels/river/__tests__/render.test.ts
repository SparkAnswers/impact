import { type LayerCanvas, TrailLayerSet, allocateParticles, trailKeep, trailKey, trailLayers } from '../lib/render';

const ch = (trail?: number) => (trail === undefined ? {} : { particles: { trail } });

describe('trailKey', () => {
  it('defaults, clamps and rounds to 2 decimals', () => {
    expect(trailKey(undefined)).toBe(0.9);
    expect(trailKey(Number.NaN)).toBe(0.9);
    expect(trailKey(0.861)).toBe(0.86);
    expect(trailKey(0.865)).toBe(0.87);
    expect(trailKey(-1)).toBe(0);
    expect(trailKey(1)).toBe(1);
    expect(trailKey(0.999)).toBe(1);
  });
});

describe('trailLayers', () => {
  it('puts every channel on one layer when the trails match', () => {
    expect(trailLayers([ch(0.9), ch(), ch(0.9)])).toEqual([{ trail: 0.9, channelIndexes: [0, 1, 2] }]);
    expect(trailLayers([])).toEqual([]);
  });

  it('creates one layer per distinct trail in first-use order', () => {
    expect(trailLayers([ch(0.6), ch(0.86), ch(0.95)])).toEqual([
      { trail: 0.6, channelIndexes: [0] },
      { trail: 0.86, channelIndexes: [1] },
      { trail: 0.95, channelIndexes: [2] },
    ]);
    expect(trailLayers([ch(0.95), ch(0.6), ch(0.95), ch(0.6)])).toEqual([
      { trail: 0.95, channelIndexes: [0, 2] },
      { trail: 0.6, channelIndexes: [1, 3] },
    ]);
  });

  it('merges trails that only differ past the second decimal', () => {
    expect(trailLayers([ch(0.9), ch(0.901), ch(0.904)])).toEqual([{ trail: 0.9, channelIndexes: [0, 1, 2] }]);
  });
});

interface StubCtx {
  calls: string[];
  globalCompositeOperation: string;
  fillStyle: string;
  setTransform: jest.Mock;
  clearRect: jest.Mock;
  fillRect: jest.Mock;
  drawImage: jest.Mock;
}

function stubCanvas(created: Array<{ canvas: LayerCanvas; ctx: StubCtx }>, withContext = true): LayerCanvas {
  const ctx: StubCtx = {
    calls: [],
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    drawImage: jest.fn(),
  };
  const canvas: LayerCanvas = {
    width: 0,
    height: 0,
    getContext: () => (withContext ? (ctx as unknown as CanvasRenderingContext2D) : null),
  };
  created.push({ canvas, ctx });
  return canvas;
}

describe('TrailLayerSet', () => {
  it('creates one canvas per layer sized by dpr and reuses them while size and trails are unchanged', () => {
    const created: Array<{ canvas: LayerCanvas; ctx: StubCtx }> = [];
    const set = new TrailLayerSet(() => stubCanvas(created));
    const specs = trailLayers([ch(0.6), ch(0.86), ch(0.6)]);
    expect(set.ensure(specs, 300, 150, 2)).toBe(true);
    expect(created).toHaveLength(2);
    expect(created.map((c) => [c.canvas.width, c.canvas.height])).toEqual([
      [600, 300],
      [600, 300],
    ]);
    expect(set.all.map((l) => l.trail)).toEqual([0.6, 0.86]);
    expect(set.all[0].channelIndexes).toEqual([0, 2]);
    // contexts draw in CSS px: scaled by dpr after the clear
    expect(created[0].ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);

    // same size + same trails (different member order): no allocation, canvases reused and cleared
    set.ensure(trailLayers([ch(0.86), ch(0.6)]), 300, 150, 2);
    expect(created).toHaveLength(2);
    expect(set.all.map((l) => l.trail)).toEqual([0.86, 0.6]);
    expect(set.all[0].canvas).toBe(created[1].canvas);
    expect(created[1].ctx.clearRect).toHaveBeenCalledTimes(2);
  });

  it('resizes in place on a size change and releases layers whose trail disappeared', () => {
    const created: Array<{ canvas: LayerCanvas; ctx: StubCtx }> = [];
    const set = new TrailLayerSet(() => stubCanvas(created));
    set.ensure(trailLayers([ch(0.6), ch(0.9)]), 100, 100, 1);
    set.ensure(trailLayers([ch(0.6), ch(0.9)]), 200, 50, 1);
    expect(created).toHaveLength(2);
    expect(created[0].canvas.width).toBe(200);
    expect(created[0].canvas.height).toBe(50);

    set.ensure(trailLayers([ch(0.9)]), 200, 50, 1);
    expect(set.all).toHaveLength(1);
    expect(set.all[0].canvas).toBe(created[1].canvas);
    // released canvas is zeroed to free its backing store
    expect(created[0].canvas.width).toBe(0);

    // a new trail value allocates exactly one more canvas
    set.ensure(trailLayers([ch(0.9), ch(0.5)]), 200, 50, 1);
    expect(created).toHaveLength(3);
    expect(set.all.map((l) => l.trail)).toEqual([0.9, 0.5]);
  });

  it('fades each layer with its own keep fraction and composites in layer order', () => {
    const created: Array<{ canvas: LayerCanvas; ctx: StubCtx }> = [];
    const set = new TrailLayerSet(() => stubCanvas(created));
    set.ensure(trailLayers([ch(0.6), ch(0.95)]), 300, 150, 1);
    set.fade(1 / 60);
    expect(created[0].ctx.fillStyle).toBe(`rgba(0,0,0,${trailKeep(0.6, 1 / 60)})`);
    expect(created[1].ctx.fillStyle).toBe(`rgba(0,0,0,${trailKeep(0.95, 1 / 60)})`);
    expect(created[0].ctx.fillRect).toHaveBeenCalledWith(0, 0, 300, 150);
    expect(created[0].ctx.globalCompositeOperation).toBe('source-over');

    const target = { drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;
    set.composite(target);
    expect((target.drawImage as jest.Mock).mock.calls.map((c) => c[0])).toEqual([created[0].canvas, created[1].canvas]);

    set.dispose();
    expect(set.all).toHaveLength(0);
    expect(created.every((c) => c.canvas.width === 0)).toBe(true);
  });

  it('reports failure when no 2d context is available', () => {
    const created: Array<{ canvas: LayerCanvas; ctx: StubCtx }> = [];
    const set = new TrailLayerSet(() => stubCanvas(created, false));
    expect(set.ensure(trailLayers([ch(0.9)]), 10, 10, 1)).toBe(false);
  });
});

describe('allocateParticles', () => {
  it('scales requested counts down to the cap', () => {
    expect(allocateParticles([100, 300], 1000)).toEqual([100, 300]);
    expect(allocateParticles([1000, 3000], 400)).toEqual([100, 300]);
  });
});
