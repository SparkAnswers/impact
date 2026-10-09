import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useStyles2, useTheme2 } from '@grafana/ui';
import { DemoBadge, rollingMultiSeries, useDemoFrames, type DemoGenerator } from '../../shared/demo';
import { useMotionAllowed } from '../../shared/motion';
import { useQuickStart } from '../../shared/presets';
import { ReducedMotionHint } from '../../shared/ReducedMotionHint';
import { Legend } from './components/Legend';
import { NodeEditor } from './components/NodeEditor';
import { PathEditor } from './components/PathEditor';
import { bindChannels, effectiveChannels, getNumericFields } from './lib/data';
import { applyValueToken, displayFor, formatValue, isSafeImageUrl, legendFormatter, mapperFor } from './lib/format';
import { buildNetwork, demoNetworkFrames, hasEdges, networkParticleCounts, spreadLabels } from './lib/network';
import { pointAt } from './lib/path';
import { ParticleSystem, TrailLayerSet, allocateParticles, buildChannelGeometry, paintNodes, paintRibbon, trailLayers } from './lib/render';
import { RIVER_PRESETS } from './presets';
import { DEFAULT_NETWORK, DEFAULT_OPTIONS, MAX_TOTAL_PARTICLES, type RiverOptions, type Waypoint } from './types';

/**
 * Overlay styles. `onImage` = a picture is behind the text, so use light text with strong shadows;
 * otherwise use theme text colours with a subtle shadow so the panel stays legible on light themes
 * and when the panel background is transparent.
 */
const getStyles = (theme: GrafanaTheme2, onImage: boolean) => {
  const strong = onImage ? '#f3f4f5' : theme.colors.text.primary;
  const soft = onImage ? '#b9bcc2' : theme.colors.text.secondary;
  // Off-image text gets a glow in the theme background colour: legible over the channel, no fill.
  const bg = theme.colors.background.primary;
  const shadow = onImage ? '0 1px 6px rgba(0,0,0,.85)' : `0 0 2px ${bg}, 0 1px 4px ${bg}, 0 0 10px ${bg}`;
  const bigShadow = onImage ? '0 2px 10px rgba(0,0,0,.9)' : `0 0 2px ${bg}, 0 0 8px ${bg}, 0 0 18px ${bg}`;
  return {
    root: css({ position: 'relative', overflow: 'hidden', fontFamily: theme.typography.fontFamily }),
    canvas: css({ position: 'absolute', left: 0, top: 0, display: 'block' }),
    overlay: css({ position: 'absolute', pointerEvents: 'none' }),
    title: css({
      left: 20,
      top: 14,
      h1: { margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: -0.2, color: strong, textShadow: shadow },
      p: { margin: '2px 0 0', fontSize: 11, color: soft, textShadow: shadow },
    }),
    shade: css({
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: 520,
      height: 220,
      maxWidth: '100%',
      background: onImage
        ? 'radial-gradient(ellipse at 20% 100%,rgba(10,12,16,.92) 0%,rgba(10,12,16,.7) 40%,rgba(10,12,16,0) 72%)'
        : 'none',
      pointerEvents: 'none',
    }),
    caption: css({ left: 20, bottom: 16 }),
    big: css({ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: strong, textShadow: bigShadow, lineHeight: 1.05 }),
    small: css({ fontSize: 14, color: soft, textShadow: shadow }),
    sub: css({
      fontSize: 14,
      color: soft,
      marginTop: 4,
      textShadow: shadow,
      b: { color: onImage || theme.isDark ? '#ffcf5a' : theme.colors.warning.text, fontWeight: 600 },
    }),
    anchor: css({
      position: 'absolute',
      pointerEvents: 'none',
      fontSize: 10.5,
      color: strong,
      textShadow: onImage ? '0 1px 3px #000,0 0 6px rgba(0,0,0,.8)' : shadow,
      whiteSpace: 'nowrap',
      transform: 'translateY(-50%)',
    }),
    dot: css({
      position: 'absolute',
      width: 5,
      height: 5,
      borderRadius: '50%',
      background: strong,
      boxShadow: onImage ? '0 0 4px #000' : `0 0 0 1px ${theme.colors.background.primary}`,
      transform: 'translate(-50%,-50%)',
      pointerEvents: 'none',
    }),
    nodeLabel: css({
      position: 'absolute',
      pointerEvents: 'none',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.2,
      color: strong,
      textShadow: onImage ? '0 1px 3px #000,0 0 6px rgba(0,0,0,.8)' : shadow,
      whiteSpace: 'nowrap',
      transform: 'translate(-50%,0)',
    }),
    valueLabel: css({
      position: 'absolute',
      pointerEvents: 'none',
      fontSize: 10,
      fontWeight: 600,
      color: strong,
      background: onImage ? 'rgba(10,12,16,.72)' : theme.colors.background.primary,
      border: `1px solid ${onImage ? 'rgba(255,255,255,.18)' : theme.colors.border.weak}`,
      borderRadius: 3,
      padding: '0 4px',
      lineHeight: '15px',
      whiteSpace: 'nowrap',
      transform: 'translate(-50%,-50%)',
    }),
    notice: css({
      position: 'absolute',
      right: 10,
      bottom: 8,
      fontSize: 10,
      color: soft,
      textShadow: shadow,
      pointerEvents: 'none',
    }),
  };
};

/** Demo data: three smooth 0..100 series (first one feeds the default channel; lanes and A/B/C bindings get all three). */
const demoGenerator: DemoGenerator = (w) =>
  rollingMultiSeries(3, w.now, w.durationMs, Math.max(w.stepMs, Math.ceil(w.durationMs / 240_000) * 1000), {
    unit: 'percent',
  });
/** Demo network for the "Network map" channel source (edges table + node table). */
const demoNetworkGenerator: DemoGenerator = (w) => demoNetworkFrames(w.now);
/** Real data counts as usable when it has at least one numeric field. */
const hasNumericField = (series: Parameters<typeof getNumericFields>[0]) => getNumericFields(series).length > 0;

export const RIVER_NO_DATA_MESSAGE = 'Needs one or more numeric series';
export const RIVER_NO_EDGES_MESSAGE = 'Needs edges: a source and a target field (or series labels) per link';

export const RiverPanel: React.FC<PanelProps<RiverOptions>> = (props) => {
  const { data, width, height, fieldConfig, replaceVariables, onOptionsChange, onFieldConfigChange, timeZone, timeRange, id } = props;
  const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...props.options }), [props.options]);
  useQuickStart(RIVER_PRESETS, { options, fieldConfig, onOptionsChange, onFieldConfigChange });
  const theme = useTheme2();
  const onImage = options.background === 'image' && isSafeImageUrl(options.backgroundUrl);
  const styles = useStyles2(getStyles, onImage);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // One offscreen particle canvas per distinct trail value, kept across renders and resized only when
  // the device size or the set of trail values changes; released on unmount.
  const layersRef = useRef<TrailLayerSet | null>(null);
  useEffect(
    () => () => {
      layersRef.current?.dispose();
      layersRef.current = null;
    },
    []
  );
  const motionOn = useMotionAllowed(options.animate, options.reducedMotion);
  const [loadedBg, setLoadedBg] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const isNetwork = options.channelSource === 'network';
  const networkOptions = useMemo(() => ({ ...DEFAULT_NETWORK, ...(options.network ?? {}) }), [options.network]);

  // Generated data when the query has nothing usable (or always), through the same field-config pipeline.
  const isUsable = useCallback(
    (series: Parameters<typeof getNumericFields>[0]) => (isNetwork ? hasEdges(series, networkOptions) : hasNumericField(series)),
    [isNetwork, networkOptions]
  );
  const { frames, isDemo } = useDemoFrames(data, options.demoData, isNetwork ? demoNetworkGenerator : demoGenerator, {
    fieldConfig,
    replaceVariables,
    theme,
    timeZone,
    timeRange,
    isUsable,
  });

  const channels = useMemo(() => (isNetwork ? [] : effectiveChannels(options)), [isNetwork, options]);
  const network = useMemo(() => (isNetwork ? buildNetwork(frames, networkOptions, width, height) : null), [isNetwork, frames, networkOptions, width, height]);
  const bound = useMemo(() => (network ? network.bound : bindChannels(channels, frames)), [network, channels, frames]);
  const geometries = useMemo(
    () => bound.map((b) => buildChannelGeometry(b, mapperFor(b, fieldConfig, theme), width, height, network ? 240 : 600)),
    [bound, fieldConfig, theme, width, height, network]
  );
  const primary = geometries[0];
  const display = useMemo(
    () => displayFor(network ? network.valueField : primary?.bound.field, fieldConfig, theme, timeZone),
    [network, primary, fieldConfig, theme, timeZone]
  );
  const latestText = formatValue(display, network ? network.captionValue : primary?.bound.latest);
  const legend = useMemo(
    () => (primary ? legendFormatter(primary.mapper, primary.bound.field, fieldConfig, theme, timeZone) : undefined),
    [primary, fieldConfig, theme, timeZone]
  );

  // Background image loading (http(s)/data:image only)
  const bgUrl = options.background === 'image' && isSafeImageUrl(options.backgroundUrl) ? options.backgroundUrl.trim() : '';
  const bgImage = bgUrl && loadedBg?.url === bgUrl ? loadedBg.img : null;
  useEffect(() => {
    if (!bgUrl) {
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setLoadedBg({ url: bgUrl, img });
      }
    };
    img.src = bgUrl;
    return () => {
      cancelled = true;
    };
  }, [bgUrl]);

  // Rendering + animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) {
      return;
    }
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const staticLayer = document.createElement('canvas');
    staticLayer.width = canvas.width;
    staticLayer.height = canvas.height;
    const sx = staticLayer.getContext('2d');
    if (!sx) {
      return;
    }

    // --- static layer: background + ribbons
    sx.scale(dpr, dpr);
    // 'panel' and 'none' paint nothing: the panel background (or the dashboard, when the panel is
    // transparent) shows through. Only 'image' fills the canvas.
    if (options.background === 'image' && bgImage) {
      const iw = bgImage.naturalWidth || 1;
      const ih = bgImage.naturalHeight || 1;
      const scale = options.backgroundFit === 'contain' ? Math.min(width / iw, height / ih) : Math.max(width / iw, height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      sx.fillStyle = '#0b0c0e';
      sx.fillRect(0, 0, width, height);
      sx.drawImage(bgImage, (width - dw) / 2, (height - dh) / 2, dw, dh);
      sx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, options.backgroundDim))})`;
      sx.fillRect(0, 0, width, height);
    }
    for (const g of geometries) {
      for (const r of g.ribbons) {
        // Network maps have many narrow channels: a lighter halo keeps crossings readable.
        paintRibbon(sx, r, options.channelHalo === false ? 0 : (theme.isDark ? 1 : 0.45) * (network ? 0.55 : 1));
      }
    }
    if (network) {
      const statusColor = (s: string | undefined) =>
        s === 'ok' ? theme.colors.success.main : s === 'warn' ? theme.colors.warning.main : s === 'error' ? theme.colors.error.main : theme.colors.primary.main;
      paintNodes(
        sx,
        network.nodes.map((n) => ({ x: n.x, y: n.y, r: n.r, color: statusColor(n.status) })),
        onImage ? '#0b0c0e' : theme.colors.background.primary,
        theme.isDark ? 1 : 0.5
      );
    }

    // --- particles
    const ribbons = geometries.flatMap((g) => g.ribbons);
    const requested = network
      ? networkParticleCounts(
          network.bound.map((b) => b.latest),
          networkOptions.particleBudget * options.particleCountMultiplier
        )
      : ribbons.map((r) => {
          const perChannel = (r.channel.particles?.count ?? 1500) * options.particleCountMultiplier;
          const laneCount = r.channel.multiSeries === 'lanes' ? geometries.find((g) => g.ribbons.includes(r))?.ribbons.length ?? 1 : 1;
          return perChannel / laneCount;
        });
    const counts = allocateParticles(requested, MAX_TOTAL_PARTICLES);
    const systems = ribbons.map(
      (r, i) => new ParticleSystem(r, { count: counts[i], speedMultiplier: options.particleSpeedMultiplier * options.animationSpeed })
    );
    // Particle layers: one offscreen canvas per distinct trail value (ribbons of one channel share its
    // trail, so lanes land on the same layer; network links all use the shared network trail = one layer).
    const layers = (layersRef.current ??= new TrailLayerSet(() => document.createElement('canvas')));
    if (!layers.ensure(trailLayers(ribbons.map((r) => r.channel)), width, height, dpr)) {
      return;
    }
    const targets: CanvasRenderingContext2D[] = new Array(systems.length);
    for (const layer of layers.all) {
      for (const i of layer.channelIndexes) {
        targets[i] = layer.ctx;
      }
    }

    const compose = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(staticLayer, 0, 0);
      layers.composite(ctx);
    };

    const animate = motionOn && typeof requestAnimationFrame === 'function';
    if (!animate) {
      systems.forEach((s, i) => s.drawStatic(targets[i]));
      compose();
      return;
    }

    let raf = 0;
    let last = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let running = true;
    const frame = (now: number) => {
      if (!running) {
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      layers.fade(dt);
      for (let i = 0; i < systems.length; i++) {
        systems[i].step(targets[i], dt);
      }
      compose();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [geometries, options, theme, width, height, bgImage, motionOn, network, networkOptions, onImage]);

  const onPathChange = useCallback(
    (channelId: string, path: Waypoint[]) => {
      onOptionsChange({
        ...options,
        channels: (options.channels ?? []).map((c) => (c.id === channelId ? { ...c, path } : c)),
      });
    },
    [onOptionsChange, options]
  );
  const onNodeChange = useCallback(
    (nodeId: string, position: Waypoint) => {
      const layout = networkOptions.layout ?? { positions: [], overrides: {} };
      onOptionsChange({
        ...options,
        network: { ...networkOptions, layout: { positions: layout.positions ?? [], overrides: { ...(layout.overrides ?? {}), [nodeId]: position } } },
      });
    },
    [onOptionsChange, options, networkOptions]
  );

  if (network && network.graph.edges.length === 0) {
    return <PanelDataErrorView panelId={id} data={data} fieldConfig={fieldConfig} needsStringField message={RIVER_NO_EDGES_MESSAGE} />;
  }
  if (!network && !hasNumericField(frames) && !channels.some((c) => c.speedSource?.mode === 'fixed')) {
    return <PanelDataErrorView panelId={id} data={data} fieldConfig={fieldConfig} needsNumberField message={RIVER_NO_DATA_MESSAGE} />;
  }

  const text = (s: string) => applyValueToken(replaceVariables(s ?? ''), latestText);
  const title = text(options.title);
  const subtitle = text(options.subtitle);
  const caption = text(options.caption);
  const editing = channels.filter((c) => c.editPath && (options.channels ?? []).some((o) => o.id === c.id));
  const titleHeight = (title ? 26 : 0) + (subtitle ? 16 : 0);

  return (
    <div className={styles.root} style={{ width, height }} data-testid="river-panel">
      <canvas ref={canvasRef} className={styles.canvas} style={{ width, height }} />
      {(title || subtitle) && (
        <div className={`${styles.overlay} ${styles.title}`}>
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      )}
      {options.showLegend && primary && legend ? (
        <Legend
          mapper={primary.mapper}
          format={legend.format}
          unit={legend.unit}
          position={options.legendPosition}
          onImage={onImage}
          panelWidth={width}
          panelHeight={height}
          offsetTop={options.legendPosition === 'top-left' ? titleHeight + 6 : 0}
          name={network ? undefined : geometries.length > 1 ? primary.bound.channel.name : undefined}
        />
      ) : null}
      {network && networkOptions.showValueLabels
        ? spreadLabels(geometries.length, (i, t) => pointAt(geometries[i].centre, t)).map((p, i) => (
            <span key={`v-${geometries[i].bound.channel.id}`} className={styles.valueLabel} style={{ left: p.x, top: p.y }}>
              {formatValue(display, geometries[i].bound.latest)}
            </span>
          ))
        : null}
      {network && networkOptions.showNodeLabels
        ? network.nodes.map((n) => (
            <span key={`n-${n.id}`} className={styles.nodeLabel} style={{ left: n.x, top: n.y + n.r + 4 }}>
              {n.label}
            </span>
          ))
        : null}
      {network && network.notices.length ? <div className={styles.notice}>{network.notices.join(' · ')}</div> : null}
      {geometries.map((g) =>
        (g.bound.channel.labels ?? []).map((l, i) => {
          const at = Math.max(0, Math.min(1, l.at ?? 0.5));
          const half = (g.bound.channel.widthPx * g.widthAt(at)) / 2;
          const lateral = l.side === 'left' ? half + 10 : l.side === 'right' ? -(half + 10) : 0;
          const p = pointAt(g.centre, at, lateral);
          const edge = pointAt(g.centre, at, l.side === 'left' ? half : l.side === 'right' ? -half : 0);
          return (
            <React.Fragment key={`${g.bound.channel.id}-${i}`}>
              {l.side !== 'center' ? <span className={styles.dot} style={{ left: edge.x, top: edge.y }} /> : null}
              <span
                className={styles.anchor}
                style={{ left: p.x, top: p.y, transform: l.side === 'center' ? 'translate(-50%,-50%)' : undefined }}
              >
                {replaceVariables(l.text ?? '')}
              </span>
            </React.Fragment>
          );
        })
      )}
      {caption || options.captionValue ? (
        <>
          <div className={styles.shade} />
          <div className={`${styles.overlay} ${styles.caption}`}>
            {caption ? <div className={options.captionBig ? styles.big : styles.small}>{caption}</div> : null}
            {options.captionValue && primary ? (
              <div className={styles.sub}>
                {network ? network.captionName : primary.bound.channel.name}: <b>{latestText}</b>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {editing.length > 0 ? <PathEditor width={width} height={height} channels={editing} onChange={onPathChange} /> : null}
      {network && networkOptions.editNodes ? <NodeEditor width={width} height={height} nodes={network.nodes} onChange={onNodeChange} /> : null}
      <DemoBadge visible={isDemo} width={width} />
      <ReducedMotionHint animationEnabled={options.animate} preference={options.reducedMotion} width={width} />
    </div>
  );
};
