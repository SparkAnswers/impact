import { DEFAULT_PARTICLES, type FlowDiagram, type FlowEdge, type FlowNode } from '../types';

const node = (n: Partial<FlowNode> & Pick<FlowNode, 'id' | 'label' | 'x' | 'y'>): FlowNode => ({
  w: 140,
  h: 52,
  shape: 'card',
  status: 'ok',
  ...n,
});

const edge = (e: Partial<FlowEdge> & Pick<FlowEdge, 'id' | 'from' | 'to'>): FlowEdge => ({
  fromSide: 'auto',
  toSide: 'auto',
  style: 'bezier',
  curvature: 0.55,
  stroke: 1.5,
  color: 'blue',
  dash: 'solid',
  arrow: true,
  glow: true,
  particles: { ...DEFAULT_PARTICLES },
  ...e,
});

/**
 * "Site power flow" example: sources on the left, a hub in the middle, loads on the right.
 * Field names match the demo dashboard's random-walk aliases.
 */
export function createExampleDiagram(): FlowDiagram {
  return {
    nodes: [
      node({ id: 'solar', label: 'Solar array', x: 40, y: 120, icon: 'power', valueField: 'solar_kw', status: 'ok' }),
      node({ id: 'grid', label: 'Grid import', x: 40, y: 200, icon: 'plug', valueField: 'grid_kw', status: 'warn' }),
      node({ id: 'battery', label: 'Battery', x: 40, y: 280, icon: 'bolt', valueField: 'battery_kw', status: 'ok' }),
      node({ id: 'generator', label: 'Generator', x: 40, y: 360, icon: 'cog', sublabel: 'offline', status: 'error' }),
      node({
        id: 'bus',
        label: 'Site bus',
        x: 330,
        y: 205,
        w: 160,
        h: 110,
        shape: 'hub',
        icon: 'crosshair',
        valueField: 'bus_kw',
        status: 'ok',
      }),
      node({ id: 'house', label: 'House loads', x: 620, y: 100, w: 150, icon: 'home', valueField: 'house_kw' }),
      node({ id: 'ev', label: 'Vehicle charger', x: 620, y: 182, w: 150, h: 32, shape: 'pill', icon: 'rocket' }),
      node({ id: 'hvac', label: 'Climate', x: 620, y: 244, w: 150, h: 32, shape: 'pill', icon: 'cloud', status: 'warn' }),
      node({ id: 'servers', label: 'Server room', x: 620, y: 306, w: 150, h: 32, shape: 'pill', icon: 'database' }),
      node({ id: 'export', label: 'Grid export', x: 620, y: 380, w: 150, icon: 'arrow-to-right', valueField: 'export_kw' }),
    ],
    edges: [
      edge({
        id: 'e1',
        from: 'solar',
        to: 'bus',
        color: '#19D3F0',
        stroke: 2,
        curvature: 0.55,
        particles: { enabled: true, count: 3, speed: 1.4, size: 2 },
        bind: { field: 'solar_kw', mapTo: 'speed', min: 0, max: 20 },
      }),
      edge({
        id: 'e2',
        from: 'grid',
        to: 'bus',
        style: 'orthogonal',
        color: 'orange',
        particles: { enabled: true, count: 2, speed: 1.2, size: 2 },
        bind: { field: 'grid_kw', mapTo: 'speed', min: 0, max: 10, reverseBelowZero: true },
      }),
      edge({
        id: 'e3',
        from: 'battery',
        to: 'bus',
        color: 'blue',
        arrow: false,
        particles: { enabled: true, count: 2, speed: 1, size: 2 },
        bind: { field: 'battery_kw', mapTo: 'speed', min: -5, max: 5, reverseBelowZero: true },
      }),
      edge({
        id: 'e4',
        from: 'generator',
        to: 'bus',
        style: 'straight',
        color: 'red',
        stroke: 1.2,
        dash: 'dash',
        arrow: false,
        glow: false,
        particles: { enabled: false, count: 0, speed: 1, size: 2 },
      }),
      edge({
        id: 'e5',
        from: 'bus',
        to: 'house',
        color: 'green',
        stroke: 2,
        curvature: 0.6,
        particles: { enabled: true, count: 3, speed: 1.2, size: 2 },
        bind: { field: 'house_kw', mapTo: 'color' },
      }),
      edge({ id: 'e6', from: 'bus', to: 'ev', style: 'orthogonal', color: 'green' }),
      edge({ id: 'e7', from: 'bus', to: 'hvac', style: 'straight', color: 'purple', particles: { enabled: true, count: 2, speed: 1.6, size: 2 } }),
      edge({ id: 'e8', from: 'bus', to: 'servers', style: 'step', color: 'blue' }),
      edge({
        id: 'e9',
        from: 'bus',
        to: 'export',
        color: '#19D3F0',
        curvature: 0.6,
        bind: { field: 'export_kw', mapTo: 'width', min: 0, max: 10 },
      }),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    grid: { show: true, size: 20, snap: true },
  };
}
