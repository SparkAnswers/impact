import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FieldConfigSource } from '@grafana/data';
import {
  applyPreset,
  createQuickStartEditor,
  deepMerge,
  findPreset,
  isPending,
  useQuickStart,
  type PresetCatalog,
  type QuickStartOptions,
} from '../presets';

interface Opts extends QuickStartOptions {
  a: number;
  nested: { x: number; y: string; list: number[] };
  field?: string;
  drawn?: { nodes: string[] };
}

const defaults: Opts = { a: 1, nested: { x: 1, y: 'd', list: [1, 2] } };

const catalog: PresetCatalog<Opts> = {
  defaults,
  keep: ['field', 'drawn', 'nested.y'],
  presets: [
    { id: 'one', label: 'One', description: 'first', options: { a: 2, nested: { x: 5, list: [9] } } },
    { id: 'two', label: 'Two', description: 'second', options: { nested: { y: 'p' } }, fieldConfig: { unit: 'kwatt', decimals: 2 } },
  ],
};

describe('deepMerge', () => {
  it('merges objects, replaces arrays and primitives, skips undefined and never mutates', () => {
    const base = { a: 1, o: { p: 1, q: [1, 2] }, arr: [1] };
    const out = deepMerge(base, { a: 2, o: { q: [3] }, arr: undefined });
    expect(out).toEqual({ a: 2, o: { p: 1, q: [3] }, arr: [1] });
    expect(base).toEqual({ a: 1, o: { p: 1, q: [1, 2] }, arr: [1] });
    expect(out.o.q).not.toBe(base.o.q);
  });
});

describe('applyPreset', () => {
  const request = { preset: 'one', token: 7 };

  it('starts from the defaults, not from the current options', () => {
    const current: Opts = { a: 99, nested: { x: 99, y: 'd', list: [] } };
    const out = applyPreset(catalog, findPreset(catalog, 'one')!, current, request);
    expect(out.a).toBe(2);
    expect(out.nested).toEqual({ x: 5, y: 'd', list: [9] });
    expect(out.quickStart).toEqual({ preset: 'one', token: 7, applied: 7 });
  });

  it('keeps the catalog paths from the current options unless the preset sets them', () => {
    const current: Opts = { ...defaults, field: 'f1', drawn: { nodes: ['n'] }, nested: { x: 0, y: 'mine', list: [] } };
    const one = applyPreset(catalog, findPreset(catalog, 'one')!, current, request);
    expect(one.field).toBe('f1');
    expect(one.drawn).toEqual({ nodes: ['n'] });
    expect(one.drawn).not.toBe(current.drawn);
    expect(one.nested.y).toBe('mine');
    const two = applyPreset(catalog, findPreset(catalog, 'two')!, current, { preset: 'two', token: 8 });
    expect(two.nested.y).toBe('p');
  });

  it('does not invent kept values that the current options lack', () => {
    const out = applyPreset(catalog, findPreset(catalog, 'one')!, defaults, request);
    expect('field' in out).toBe(false);
  });

  it('isPending is true until the panel records the token', () => {
    expect(isPending(undefined)).toBe(false);
    expect(isPending({ preset: 'one', token: 1 })).toBe(true);
    expect(isPending({ preset: 'one', token: 1, applied: 1 })).toBe(false);
    expect(isPending({ preset: 'one', token: 2, applied: 1 })).toBe(true);
  });
});

describe('useQuickStart', () => {
  const fieldConfig: FieldConfigSource = { defaults: { unit: 'percent', min: 0 }, overrides: [] };

  function Host({ options, onOptionsChange, onFieldConfigChange }: { options: Opts; onOptionsChange: jest.Mock; onFieldConfigChange: jest.Mock }) {
    useQuickStart(catalog, { options, fieldConfig, onOptionsChange, onFieldConfigChange });
    return null;
  }

  it('does nothing without a pending request', () => {
    const onOptionsChange = jest.fn();
    const onFieldConfigChange = jest.fn();
    const { rerender } = render(<Host options={defaults} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    rerender(<Host options={{ ...defaults, quickStart: { preset: 'one', token: 3, applied: 3 } }} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    expect(onOptionsChange).not.toHaveBeenCalled();
    expect(onFieldConfigChange).not.toHaveBeenCalled();
  });

  it('applies a pending request to the options and the field defaults', () => {
    const onOptionsChange = jest.fn();
    const onFieldConfigChange = jest.fn();
    render(<Host options={{ ...defaults, quickStart: { preset: 'two', token: 4 } }} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    expect(onFieldConfigChange).toHaveBeenCalledWith({ defaults: { unit: 'kwatt', min: 0, decimals: 2 }, overrides: [] });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0]).toMatchObject({ nested: { y: 'p' }, quickStart: { preset: 'two', token: 4, applied: 4 } });
    expect(onOptionsChange.mock.calls[0][1]).toBe(true);
  });

  it('goes idle once its own result comes back', () => {
    const onOptionsChange = jest.fn();
    const onFieldConfigChange = jest.fn();
    const { rerender } = render(<Host options={{ ...defaults, quickStart: { preset: 'one', token: 4 } }} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const applied = onOptionsChange.mock.calls[0][0] as Opts;
    rerender(<Host options={applied} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    rerender(<Host options={{ ...applied, a: 42 }} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    // A new token (even for the same preset) fires again.
    rerender(<Host options={{ ...applied, quickStart: { preset: 'one', token: 5, applied: 4 } }} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    expect(onOptionsChange).toHaveBeenCalledTimes(2);
  });

  it('marks an unknown preset as applied without touching anything else', () => {
    const onOptionsChange = jest.fn();
    const onFieldConfigChange = jest.fn();
    render(<Host options={{ ...defaults, a: 5, quickStart: { preset: 'gone', token: 9 } }} onOptionsChange={onOptionsChange} onFieldConfigChange={onFieldConfigChange} />);
    expect(onFieldConfigChange).not.toHaveBeenCalled();
    expect(onOptionsChange).toHaveBeenCalledWith({ ...defaults, a: 5, quickStart: { preset: 'gone', token: 9, applied: 9 } });
  });
});

describe('QuickStartEditor', () => {
  const Editor = createQuickStartEditor(catalog);
  const item = { id: 'quickStart', name: 'Presets' };

  it('lists every preset and writes a request when one is clicked', () => {
    const onChange = jest.fn();
    render(<Editor value={undefined} onChange={onChange} context={{ data: [] }} item={item} />);
    expect(screen.getByRole('button', { name: /One/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Two/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const req = onChange.mock.calls[0][0];
    expect(req.preset).toBe('two');
    expect(typeof req.token).toBe('number');
    expect(req.applied).toBeUndefined();
  });

  it('tokens grow from the stored state so two quick clicks never collide', () => {
    const onChange = jest.fn();
    render(<Editor value={{ preset: 'one', token: 5, applied: 5 }} onChange={onChange} context={{ data: [] }} item={item} />);
    fireEvent.click(screen.getByRole('button', { name: /Two/ }));
    expect(onChange).toHaveBeenCalledWith({ preset: 'two', token: 6 });
  });

  it('marks the active preset', () => {
    render(<Editor value={{ preset: 'one', token: 1, applied: 1 }} onChange={jest.fn()} context={{ data: [] }} item={item} />);
    expect(screen.getByRole('button', { name: /One/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Two/ })).not.toHaveAttribute('aria-current');
  });
});
