import type { Channel } from '../types';
import { type ColorMapper, rgbCss } from './colors';
import { type Centreline, autoWindow, buildCentreline, smoothSample, smoothSeries } from './path';
import type { BoundChannel } from './data';

/** A paintable ribbon: a centreline with per-sample width and value. */
export interface Ribbon {
  line: Centreline;
  /** Full width in px per sample. */
  W: Float32Array;
  /** Value per sample (signed). */
  V: Float32Array;
  /** Normalised speed magnitude per sample (0..1). */
  SP: Float32Array;
  mapper: ColorMapper;
  opacity: number;
  direction: 1 | -1;
  channel: Channel;
  laneName: string;
  /** Width-weighted spawn CDF. */
  CDF: Float32Array;
}

export interface ChannelGeometry {
  bound: BoundChannel;
  centre: Centreline;
  ribbons: Ribbon[];
  mapper: ColorMapper;
  /** Total width multiplier per sample (0..1). */
  widthAt: (s: number) => number;
}

export function buildChannelGeometry(
  bound: BoundChannel,
  mapper: ColorMapper,
  width: number,
  height: number,
  samples = 600
): ChannelGeometry {
  const { channel } = bound;
  const centre = buildCentreline(channel.path, width, height, samples);
  const M = centre.M;
  const laneCount = Math.max(1, bound.lanes.length);
  const widths = bound.widths ? smoothSeries(bound.widths, autoWindow(bound.widths.length, channel.smoothing)) : null;
  const widthAt = (s: number) => (widths ? smoothSample(widths, s) : 1);
  const absMax = Math.max(Math.abs(mapper.domain[0]), Math.abs(mapper.domain[1])) || 1;

  const ribbons: Ribbon[] = bound.lanes.map((lane, li) => {
    const off = laneCount > 1 ? (li - (laneCount - 1) / 2) / laneCount : 0;
    const line: Centreline = {
      X: new Float32Array(M),
      Y: new Float32Array(M),
      TX: centre.TX,
      TY: centre.TY,
      S: centre.S,
      M,
      L: centre.L,
    };
    const W = new Float32Array(M);
    const V = new Float32Array(M);
    const SP = new Float32Array(M);
    const CDF = new Float32Array(M);
    const values = smoothSeries(lane.values, autoWindow(lane.values.length, channel.smoothing));
    let acc = 0;
    for (let i = 0; i < M; i++) {
      const s = i / (M - 1);
      const total = channel.widthPx * widthAt(s);
      const lateral = total * off;
      line.X[i] = centre.X[i] - centre.TY[i] * lateral;
      line.Y[i] = centre.Y[i] + centre.TX[i] * lateral;
      W[i] = laneCount > 1 ? (total / laneCount) * 0.92 : total;
      V[i] = smoothSample(values, s);
      SP[i] = Math.min(1, Math.abs(V[i]) / absMax);
      acc += W[i];
      CDF[i] = acc;
    }
    for (let i = 0; i < M; i++) {
      CDF[i] = acc > 0 ? CDF[i] / acc : i / (M - 1);
    }
    return {
      line,
      W,
      V,
      SP,
      mapper,
      opacity: channel.opacity,
      direction: bound.direction,
      channel,
      laneName: lane.name,
      CDF,
    };
  });

  return { bound, centre, ribbons, mapper, widthAt };
}

const BANDS: Array<[number, number, number]> = [
  [-1, -0.55, 0.72],
  [-0.55, 0.55, 1.0],
  [0.55, 1, 0.72],
];

/** Paints the halo, speed-coloured quads, seam blend and rim for one ribbon. */
/** `halo` is the halo strength 0..1 (0 = none). */
export function paintRibbon(ctx: CanvasRenderingContext2D, r: Ribbon, halo = 1) {
  const { line, W, V, mapper } = r;
  const { X, Y, TX, TY, M } = line;
  if (M < 2) {
    return;
  }
  // soft dark halo (optional)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; halo > 0 && pass < 2; pass++) {
    ctx.strokeStyle = `rgba(0,0,0,${(pass ? 0.45 : 0.22) * Math.min(1, halo)})`;
    const extra = pass ? 8 : 22;
    for (let i = 0; i < M - 1; i++) {
      ctx.lineWidth = W[i] + extra;
      ctx.beginPath();
      ctx.moveTo(X[i], Y[i]);
      ctx.lineTo(X[i + 1], Y[i + 1]);
      ctx.stroke();
    }
  }
  ctx.restore();

  const lateralBands = r.channel.multiSeries === 'lanes' && W[0] < 24 ? [[-1, 1, 1] as [number, number, number]] : BANDS;
  const [d0, d1] = mapper.domain;
  const span = d1 - d0 || 1;
  // scale a value toward the domain minimum for the cooler edges
  const edgeValue = (v: number, k: number) => d0 + (v - d0) * k + (k < 1 ? 0.12 * span : 0);

  ctx.globalAlpha = r.opacity;
  for (const [a, b, k] of lateralBands) {
    for (let i = 0; i < M - 1; i++) {
      const w0 = W[i] / 2;
      const w1 = W[i + 1] / 2;
      const nx0 = -TY[i];
      const ny0 = TX[i];
      const nx1 = -TY[i + 1];
      const ny1 = TX[i + 1];
      const c = mapper.css(edgeValue(V[i], k));
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(X[i] + nx0 * w0 * a, Y[i] + ny0 * w0 * a);
      ctx.lineTo(X[i + 1] + nx1 * w1 * a, Y[i + 1] + ny1 * w1 * a);
      ctx.lineTo(X[i + 1] + nx1 * w1 * b, Y[i + 1] + ny1 * w1 * b);
      ctx.lineTo(X[i] + nx0 * w0 * b, Y[i] + ny0 * w0 * b);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  // seam blend
  ctx.globalAlpha = r.opacity * 0.55;
  for (let i = 0; i < M - 1; i++) {
    const w0 = W[i] / 2;
    const w1 = W[i + 1] / 2;
    const nx0 = -TY[i];
    const ny0 = TX[i];
    const nx1 = -TY[i + 1];
    const ny1 = TX[i + 1];
    ctx.fillStyle = mapper.css(edgeValue(V[i], 0.9));
    ctx.beginPath();
    ctx.moveTo(X[i] - nx0 * w0, Y[i] - ny0 * w0);
    ctx.lineTo(X[i + 1] - nx1 * w1, Y[i + 1] - ny1 * w1);
    ctx.lineTo(X[i + 1] + nx1 * w1, Y[i + 1] + ny1 * w1);
    ctx.lineTo(X[i] + nx0 * w0, Y[i] + ny0 * w0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // rim
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i < M; i++) {
      const ww = (W[i] / 2) * side;
      const x = X[i] - TY[i] * ww;
      const y = Y[i] + TX[i] * ww;
      if (i) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Base particle speed in px/s at normalised speed 1. */
const PX_PER_SEC = 260;
const MIN_SPEED = 0.15;
const COLOR_BINS = 24;

export interface ParticleSystemOptions {
  count: number;
  speedMultiplier: number;
  random?: () => number;
}

/** Particles advected along one ribbon. Positions are in CSS px. */
export class ParticleSystem {
  readonly S: Float32Array;
  readonly U: Float32Array;
  readonly AGE: Float32Array;
  readonly PX: Float32Array;
  readonly PY: Float32Array;
  readonly N: number;
  private readonly rnd: () => number;
  private readonly binColors: string[];

  constructor(
    readonly ribbon: Ribbon,
    private readonly opts: ParticleSystemOptions
  ) {
    this.N = Math.max(0, opts.count | 0);
    this.S = new Float32Array(this.N);
    this.U = new Float32Array(this.N);
    this.AGE = new Float32Array(this.N);
    this.PX = new Float32Array(this.N);
    this.PY = new Float32Array(this.N);
    this.rnd = opts.random ?? Math.random;
    this.binColors = [];
    for (let b = 0; b < COLOR_BINS; b++) {
      const c = ribbon.mapper.atT((b + 0.5) / COLOR_BINS);
      this.binColors.push(rgbCss([Math.min(255, c[0] * 0.5 + 130), Math.min(255, c[1] * 0.5 + 130), Math.min(255, c[2] * 0.5 + 130)], 0.85));
    }
    for (let i = 0; i < this.N; i++) {
      this.spawn(i, true);
    }
  }

  private sampleIndex(i: number): number {
    const M = this.ribbon.line.M;
    return Math.min(M - 1, Math.max(0, Math.round(this.S[i] * (M - 1))));
  }

  private place(i: number): number {
    const k = this.sampleIndex(i);
    const { line, W } = this.ribbon;
    const ww = (W[k] / 2) * this.U[i];
    this.PX[i] = line.X[k] - line.TY[k] * ww;
    this.PY[i] = line.Y[k] + line.TX[k] * ww;
    return k;
  }

  /** Width-weighted position along the path. */
  private spawnS(): number {
    const { CDF, line } = this.ribbon;
    const r = this.rnd();
    let lo = 0;
    let hi = line.M - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (CDF[m] < r) {
        lo = m + 1;
      } else {
        hi = m;
      }
    }
    return lo / (line.M - 1);
  }

  private spawn(i: number, uniform: boolean) {
    const dir = this.ribbon.direction;
    const edge = this.rnd() * 0.08;
    this.S[i] = uniform ? this.spawnS() : dir > 0 ? edge : 1 - edge;
    this.U[i] = (this.rnd() * 2 - 1) * 0.97;
    this.AGE[i] = (60 + this.rnd() * 160) | 0;
    this.place(i);
  }

  /** Advances the particles by dt seconds and draws streaks on ctx (CSS px space). */
  step(ctx: CanvasRenderingContext2D, dt: number) {
    const { ribbon, N } = this;
    const { line, SP, channel } = ribbon;
    if (line.L <= 0 || N === 0) {
      return;
    }
    const mult = this.opts.speedMultiplier * (channel.particles?.speed ?? 1);
    const dir = ribbon.direction;
    const mode = channel.particles?.color ?? 'white';
    const bins = mode === 'byValue' ? new Uint8Array(N) : null;
    const X0 = this.PX.slice();
    const Y0 = this.PY.slice();
    const alive = new Uint8Array(N);

    for (let i = 0; i < N; i++) {
      const k = this.sampleIndex(i);
      const sp = Math.max(MIN_SPEED, SP[k]);
      const dpx = sp * PX_PER_SEC * mult * dt;
      this.S[i] += (dir * dpx) / line.L;
      this.U[i] += (this.rnd() - 0.5) * 0.01 * (1 - this.U[i] * this.U[i]);
      if (this.U[i] > 0.98) {
        this.U[i] = 0.98;
      }
      if (this.U[i] < -0.98) {
        this.U[i] = -0.98;
      }
      this.AGE[i] -= dt * 60;
      if (this.S[i] >= 1 || this.S[i] <= 0 || this.AGE[i] <= 0) {
        this.spawn(i, this.AGE[i] <= 0);
        continue;
      }
      const k2 = this.place(i);
      alive[i] = 1;
      if (bins) {
        bins[i] = Math.min(COLOR_BINS - 1, Math.floor(ribbon.mapper.toT(ribbon.V[k2]) * COLOR_BINS));
      }
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = channel.particles?.width ?? 1.1;
    if (bins) {
      for (let b = 0; b < COLOR_BINS; b++) {
        ctx.strokeStyle = this.binColors[b];
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < N; i++) {
          if (alive[i] && bins[i] === b) {
            ctx.moveTo(X0[i], Y0[i]);
            ctx.lineTo(this.PX[i], this.PY[i]);
            any = true;
          }
        }
        if (any) {
          ctx.stroke();
        }
      }
    } else {
      ctx.strokeStyle = mode === 'fixed' ? (channel.particles?.fixedColor ?? 'rgba(255,255,255,0.6)') : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        if (alive[i]) {
          ctx.moveTo(X0[i], Y0[i]);
          ctx.lineTo(this.PX[i], this.PY[i]);
        }
      }
      ctx.stroke();
    }
  }

  /** Draws static streaks (reduced-motion fallback). */
  drawStatic(ctx: CanvasRenderingContext2D) {
    const { ribbon, N } = this;
    const { line, SP, channel } = ribbon;
    ctx.lineCap = 'round';
    ctx.lineWidth = channel.particles?.width ?? 1.1;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const k = this.sampleIndex(i);
      const len = 6 + 26 * SP[k];
      ctx.moveTo(this.PX[i], this.PY[i]);
      ctx.lineTo(this.PX[i] + line.TX[k] * len, this.PY[i] + line.TY[k] * len);
    }
    ctx.stroke();
  }
}

/** Splits a particle budget across ribbons proportionally to their requested counts, capped at max. */
export function allocateParticles(requested: number[], max: number): number[] {
  const total = requested.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= max) {
    return requested.map((r) => Math.max(0, Math.round(r)));
  }
  const k = max / total;
  return requested.map((r) => Math.max(0, Math.floor(r * k)));
}

/**
 * Per-frame keep fraction for the trail fade, normalised to 60 fps so trails look the same
 * at any refresh rate: `trail` is the fraction kept per 1/60 s.
 */
export function trailKeep(trail: number, dt: number): number {
  const t = Math.max(0, Math.min(0.995, trail));
  return Math.pow(t, Math.max(0.001, dt * 60));
}

/** Trail used when a channel has no particle options. */
const DEFAULT_TRAIL = 0.9;

/** Normalised trail value: clamped like `trailKeep` and rounded to 2 decimals so near-equal trails share a layer. */
export function trailKey(trail: number | undefined): number {
  const t = typeof trail === 'number' && Number.isFinite(trail) ? trail : DEFAULT_TRAIL;
  return Math.round(Math.max(0, Math.min(0.995, t)) * 100) / 100;
}

export interface TrailLayerSpec {
  /** Effective trail (rounded to 2 decimals) shared by every member of the layer. */
  trail: number;
  /** Indexes into the input array, in input order. */
  channelIndexes: number[];
}

/**
 * Groups channels (or ribbons, anything carrying `particles.trail`) by their effective trail value.
 * Layers are ordered by the first channel that uses each trail, so compositing them in order keeps
 * the channel order as far as a shared layer allows. One trail value = one layer.
 */
export function trailLayers(channels: ReadonlyArray<{ particles?: { trail?: number } }>): TrailLayerSpec[] {
  const layers: TrailLayerSpec[] = [];
  const byTrail = new Map<number, TrailLayerSpec>();
  channels.forEach((c, i) => {
    const trail = trailKey(c.particles?.trail);
    let layer = byTrail.get(trail);
    if (!layer) {
      layer = { trail, channelIndexes: [] };
      byTrail.set(trail, layer);
      layers.push(layer);
    }
    layer.channelIndexes.push(i);
  });
  return layers;
}

/** Minimal offscreen canvas surface, so the layer set can be driven with a stub in tests. */
export interface LayerCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): CanvasRenderingContext2D | null;
}

export interface TrailLayer extends TrailLayerSpec {
  canvas: LayerCanvas;
  ctx: CanvasRenderingContext2D;
}

/**
 * One offscreen particle canvas per distinct trail value. Canvases are created or resized only when the
 * device size or the set of trail values changes; frames only fade, draw and composite.
 */
export class TrailLayerSet {
  private layers: TrailLayer[] = [];
  private readonly pool = new Map<number, TrailLayer>();
  private deviceWidth = 0;
  private deviceHeight = 0;
  private dpr = 1;
  /** CSS size, used by `fade` (contexts are scaled by dpr). */
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(private readonly createCanvas: () => LayerCanvas) {}

  /** Current layers, in composite order. */
  get all(): readonly TrailLayer[] {
    return this.layers;
  }

  /**
   * Makes the set match `specs` at the given device size. Returns false when no 2d context could be
   * obtained (nothing is drawn then). Existing canvases are reused when neither their trail nor the
   * size changed; every surviving layer is cleared so stale streaks never sit on new geometry.
   */
  ensure(specs: TrailLayerSpec[], cssWidth: number, cssHeight: number, dpr: number): boolean {
    const dw = Math.round(cssWidth * dpr);
    const dh = Math.round(cssHeight * dpr);
    const resized = dw !== this.deviceWidth || dh !== this.deviceHeight || dpr !== this.dpr;
    this.deviceWidth = dw;
    this.deviceHeight = dh;
    this.dpr = dpr;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

    const next: TrailLayer[] = [];
    const keep = new Set<number>();
    for (const spec of specs) {
      let layer = this.pool.get(spec.trail);
      if (!layer) {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return false;
        }
        layer = { trail: spec.trail, channelIndexes: spec.channelIndexes, canvas, ctx };
        this.pool.set(spec.trail, layer);
        canvas.width = dw;
        canvas.height = dh;
      } else {
        layer.channelIndexes = spec.channelIndexes;
        if (resized) {
          layer.canvas.width = dw;
          layer.canvas.height = dh;
        }
      }
      // Resizing resets the context state; a fresh transform + clear is cheap and keeps every path identical.
      layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      layer.ctx.clearRect(0, 0, dw, dh);
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      next.push(layer);
      keep.add(spec.trail);
    }
    for (const trail of Array.from(this.pool.keys())) {
      if (!keep.has(trail)) {
        this.release(trail);
      }
    }
    this.layers = next;
    return true;
  }

  /** Fades every layer by its own per-frame keep fraction. */
  fade(dt: number) {
    for (const layer of this.layers) {
      const { ctx } = layer;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${trailKeep(layer.trail, dt)})`;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Draws every layer onto `ctx` (device px, identity transform expected) in layer order. */
  composite(ctx: CanvasRenderingContext2D) {
    for (const layer of this.layers) {
      ctx.drawImage(layer.canvas as unknown as CanvasImageSource, 0, 0);
    }
  }

  /** Drops every canvas (unmount). */
  dispose() {
    for (const trail of Array.from(this.pool.keys())) {
      this.release(trail);
    }
    this.layers = [];
    this.deviceWidth = 0;
    this.deviceHeight = 0;
  }

  private release(trail: number) {
    const layer = this.pool.get(trail);
    if (layer) {
      // Zero-size canvases free their backing store immediately in every engine.
      layer.canvas.width = 0;
      layer.canvas.height = 0;
      this.pool.delete(trail);
    }
  }
}

export interface NodePuck {
  x: number;
  y: number;
  r: number;
  /** Fill colour (status colour or the theme accent). */
  color: string;
}

/** Draws labelled-puck bodies for the network map: glow, dark ring, coloured core, highlight. */
export function paintNodes(ctx: CanvasRenderingContext2D, nodes: NodePuck[], ringColor: string, glow = 1) {
  ctx.save();
  for (const n of nodes) {
    if (glow > 0) {
      ctx.shadowColor = n.color;
      ctx.shadowBlur = n.r * 1.6 * glow;
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r + 2, 0, Math.PI * 2);
    ctx.fillStyle = ringColor;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(n.x - n.r * 0.3, n.y - n.r * 0.3, n.r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
  }
  ctx.restore();
}
