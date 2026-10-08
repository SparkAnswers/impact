import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { NodeView } from '../components/NodeView';
import { SUN_IMAGE } from '../lib/example';
import { DEFAULT_IMAGE_SIZE, MAX_IMAGE_SIZE, type FlowNode } from '../types';

const theme = createTheme();

const base: FlowNode = { id: 'n1', label: 'Node', x: 0, y: 0, w: 140, h: 52, shape: 'card', status: 'ok', icon: 'bolt' };

function renderNode(node: Partial<FlowNode>, imageSize?: number) {
  return render(
    <svg>
      <NodeView node={{ ...base, ...node }} theme={theme} uid="t" nodeStyle="cards" fontSize={12} imageSize={imageSize} accent="#00f" selected={false} editing={false} />
    </svg>
  );
}

const image = (id = 'n1') => screen.queryByTestId(`flow-node-image-${id}`) as SVGImageElement | null;
const icon = () => document.querySelector('foreignObject');

describe('NodeView images', () => {
  it('renders a clipped <image> in place of the icon for a safe URL', () => {
    renderNode({ image: SUN_IMAGE });
    const img = image();
    expect(img).not.toBeNull();
    expect(img!.getAttribute('href')).toBe(SUN_IMAGE);
    expect(img!.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(img!.getAttribute('width')).toBe(String(DEFAULT_IMAGE_SIZE));
    expect(img!.getAttribute('clip-path')).toBe('url(#t-img-n1)');
    expect(document.querySelector('clipPath#t-img-n1 rect')).not.toBeNull();
    expect(icon()).toBeNull();
  });

  it('never renders an <image> for an unsafe URL and shows the icon instead', () => {
    renderNode({ image: 'javascript:alert(1)' });
    expect(image()).toBeNull();
    expect(document.querySelector('image')).toBeNull();
    expect(icon()).not.toBeNull();
  });

  it('falls back to the icon when the image fails to load', () => {
    renderNode({ image: 'https://example.test/missing.png' });
    expect(image()).not.toBeNull();
    expect(icon()).toBeNull();
    fireEvent.error(image()!);
    expect(image()).toBeNull();
    expect(icon()).not.toBeNull();
  });

  it('retries with a new URL after a failure', () => {
    const { rerender } = renderNode({ image: 'https://example.test/a.png' });
    fireEvent.error(image()!);
    expect(image()).toBeNull();
    rerender(
      <svg>
        <NodeView node={{ ...base, image: 'https://example.test/b.png' }} theme={theme} uid="t" nodeStyle="cards" fontSize={12} accent="#00f" selected={false} editing={false} />
      </svg>
    );
    expect(image()!.getAttribute('href')).toBe('https://example.test/b.png');
  });

  it('honours the image size option, capped to the node height and the slider range', () => {
    renderNode({ image: SUN_IMAGE }, 40);
    expect(image()!.getAttribute('width')).toBe('40');
    renderNode({ id: 'n2', image: SUN_IMAGE, h: 30 }, 40);
    expect(image('n2')!.getAttribute('width')).toBe('24'); // h - 6
    renderNode({ id: 'n3', image: SUN_IMAGE, h: 200 }, 500);
    expect(image('n3')!.getAttribute('width')).toBe(String(MAX_IMAGE_SIZE));
  });

  it('centres the image on circle nodes', () => {
    renderNode({ image: SUN_IMAGE, shape: 'circle', w: 60, h: 60 });
    const img = image()!;
    const size = Number(img.getAttribute('width'));
    expect(size).toBe(DEFAULT_IMAGE_SIZE);
    expect(Number(img.getAttribute('x'))).toBe(30 - size / 2);
    expect(Number(img.getAttribute('y'))).toBe(30 - size / 2);
  });
});
