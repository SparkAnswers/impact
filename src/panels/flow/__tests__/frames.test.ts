import { createTheme, FieldType, toDataFrame, applyFieldOverrides, type DataFrame } from '@grafana/data';
import { DEFAULT_DATA_OPTIONS } from '../types';
import { extractGraph, statusFromText, topEdges, type GraphEdge } from '../lib/frames';

const names = DEFAULT_DATA_OPTIONS;

const table = (rows: Array<[string, string, number]>, extra: Partial<{ group: string[]; label: string[] }> = {}): DataFrame =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'source', type: FieldType.string, values: rows.map((r) => r[0]) },
      { name: 'target', type: FieldType.string, values: rows.map((r) => r[1]) },
      { name: 'Value', type: FieldType.number, values: rows.map((r) => r[2]) },
      ...(extra.group ? [{ name: 'target_group', type: FieldType.string, values: extra.group }] : []),
      ...(extra.label ? [{ name: 'label', type: FieldType.string, values: extra.label }] : []),
    ],
  });

const series = (labels: Record<string, string>, values: Array<number | null>, name = 'Value'): DataFrame =>
  toDataFrame({
    refId: 'B',
    fields: [
      { name: 'Time', type: FieldType.time, values: values.map((_, i) => i) },
      { name, type: FieldType.number, values, labels },
    ],
  });

describe('extractGraph', () => {
  it('reads table-shaped edge frames (source/target/value rows)', () => {
    const g = extractGraph([table([['web', 'api', 5], ['api', 'db', 2], ['web', 'cache', 1]])], names);
    expect(g.edges.map((e) => [e.source, e.target, e.value])).toEqual([
      ['web', 'api', 5],
      ['api', 'db', 2],
      ['web', 'cache', 1],
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(['api', 'cache', 'db', 'web']); // sorted, derived from endpoints
    expect(g.nodes.every((n) => !n.explicit)).toBe(true);
    expect(g.notices).toEqual([]);
  });

  it('reads series-shaped edge frames (labels on the numeric field, last value wins)', () => {
    const frames = [series({ client: 'web', server: 'api' }, [1, 2, null]), series({ client: 'api', server: 'db' }, [3, 4, 5])];
    const g = extractGraph(frames, { ...names, sourceField: 'client', targetField: 'server' });
    expect(g.edges.map((e) => [e.id, e.value])).toEqual([
      ['web→api', 2],
      ['api→db', 5],
    ]);
    expect(g.edges[0].valueField?.labels).toEqual({ client: 'web', server: 'api' });
  });

  it('sums duplicate pairs and keeps groups / labels from the table', () => {
    const g = extractGraph([table([['a', 'b', 1], ['a', 'b', 2]], { group: ['ns1', 'ns1'], label: ['x', 'y'] })], names);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].value).toBe(3);
    expect(g.edges[0].label).toBe('x');
    expect(g.nodes.find((n) => n.id === 'b')?.group).toBe('ns1');
    expect(g.nodes.find((n) => n.id === 'a')?.group).toBeUndefined();
  });

  it('decorates nodes from a node frame (label, group, status via value mappings, value)', () => {
    const nodeFrame = toDataFrame({
      refId: 'N',
      fields: [
        { name: 'id', type: FieldType.string, values: ['api', 'db', 'extra'] },
        { name: 'label', type: FieldType.string, values: ['API', 'Database', 'Lonely'] },
        { name: 'group', type: FieldType.string, values: ['backend', 'backend', 'misc'] },
        { name: 'status', type: FieldType.number, values: [1, 3, 2], config: { mappings: [{ type: 'value', options: { '3': { text: 'failed' } } }] } },
        { name: 'cpu', type: FieldType.number, values: [0.5, 0.9, 0.1] },
      ],
    });
    const [withMappings] = applyFieldOverrides({ data: [nodeFrame], fieldConfig: { defaults: {}, overrides: [] }, replaceVariables: (v) => v, theme: createTheme() });
    const g = extractGraph([table([['web', 'api', 1], ['api', 'db', 1]]), withMappings], names);
    const api = g.nodes.find((n) => n.id === 'api')!;
    expect(api).toMatchObject({ label: 'API', group: 'backend', status: 'ok', value: 0.5, explicit: true });
    expect(g.nodes.find((n) => n.id === 'db')?.status).toBe('error'); // "failed" after the value mapping
    expect(g.nodes.find((n) => n.id === 'extra')).toMatchObject({ status: 'warn', explicit: true }); // isolated node kept
    expect(g.nodes.find((n) => n.id === 'web')?.explicit).toBe(false);
  });

  it('reads a node image column, keeping only safe URLs', () => {
    const nodeFrame = toDataFrame({
      refId: 'N',
      fields: [
        { name: 'id', type: FieldType.string, values: ['api', 'db', 'cache', 'web'] },
        { name: 'image', type: FieldType.string, values: ['https://example.test/api.png', 'javascript:alert(1)', null, 'data:image/svg+xml;base64,PHN2Zy8+'] },
        { name: 'cpu', type: FieldType.number, values: [0.5, 0.9, 0.1, 0.2] },
      ],
    });
    const g = extractGraph([table([['web', 'api', 1], ['api', 'db', 1], ['api', 'cache', 1]]), nodeFrame], names);
    expect(g.nodes.find((n) => n.id === 'api')?.image).toBe('https://example.test/api.png');
    expect(g.nodes.find((n) => n.id === 'web')?.image).toBe('data:image/svg+xml;base64,PHN2Zy8+');
    expect(g.nodes.find((n) => n.id === 'db')?.image).toBeUndefined();
    expect(g.nodes.find((n) => n.id === 'cache')?.image).toBeUndefined();
    // The image column is text, so the value still comes from the first numeric field.
    expect(g.nodes.find((n) => n.id === 'api')?.value).toBe(0.5);
    // A renamed / empty image field is never read.
    expect(extractGraph([nodeFrame], { ...names, nodeImageField: '' }).nodes.find((n) => n.id === 'api')?.image).toBeUndefined();
    expect(extractGraph([nodeFrame], { ...names, nodeImageField: 'logo' }).nodes.find((n) => n.id === 'api')?.image).toBeUndefined();
  });

  it('reads a node image from series labels', () => {
    const g = extractGraph([series({ id: 'api', image: 'https://example.test/api.png' }, [1])], names);
    expect(g.nodes.find((n) => n.id === 'api')?.image).toBe('https://example.test/api.png');
  });

  it('matches secondary values from a second series with the same source/target labels', () => {
    const frames = [series({ client: 'web', server: 'api' }, [10]), series({ client: 'web', server: 'api', __name__: 'errors' }, [0.2], 'errors')];
    const g = extractGraph(frames, { ...names, sourceField: 'client', targetField: 'server', value2Field: 'errors' });
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].value).toBe(10);
    expect(g.edges[0].value2).toBe(0.2);
  });

  it('keeps the top N edges by value and reports it', () => {
    const g = extractGraph([table([['a', 'b', 1], ['a', 'c', 9], ['a', 'd', 5], ['e', 'f', 7]])], { ...names, topN: 2 });
    expect(g.edges.map((e) => e.id)).toEqual(['a→c', 'e→f']);
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'c', 'e', 'f']);
    expect(g.notices).toEqual(['Top 2 of 4 edges']);
    expect(g.totalEdges).toBe(4);
  });

  it('caps nodes and edges and drops dangling edges', () => {
    const rows: Array<[string, string, number]> = [];
    for (let i = 0; i < 20; i++) {
      rows.push(['hub', `n${i}`, i]);
    }
    const g = extractGraph([table(rows)], { ...names, topN: 0, maxNodes: 6, maxEdges: 10 });
    expect(g.edges.length).toBeLessThanOrEqual(10);
    expect(g.nodes.length).toBe(6);
    expect(g.nodes.some((n) => n.id === 'hub')).toBe(true);
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    expect(g.notices).toEqual(['Showing 10 of 20 edges', 'Showing 6 of 11 nodes']);
  });

  it('ignores frames without the configured fields and skips empty endpoints', () => {
    const noise = toDataFrame({ refId: 'Z', fields: [{ name: 'Value', type: FieldType.number, values: [1, 2] }] });
    const g = extractGraph([noise, table([['a', '', 1], ['a', 'b', 1]])], names);
    expect(g.edges).toHaveLength(1);
  });

  it('is case-insensitive about field names', () => {
    const g = extractGraph([table([['a', 'b', 1]])], { ...names, sourceField: 'SOURCE', targetField: 'Target' });
    expect(g.edges).toHaveLength(1);
  });
});

describe('topEdges / statusFromText', () => {
  it('orders by value, keeps input order for ties and puts valueless edges last', () => {
    const e = (id: string, value?: number): GraphEdge => ({ id, source: id, target: id, value });
    const out = topEdges([e('x'), e('a', 1), e('b', 3), e('c', 3), e('d', 2)], 3);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(topEdges([e('a', 1)], 0)).toHaveLength(1);
  });
  it('maps common words and numbers to statuses', () => {
    expect(statusFromText('Running')).toBe('ok');
    expect(statusFromText('Pending')).toBe('warn');
    expect(statusFromText('CrashLoopBackOff')).toBe('error');
    expect(statusFromText('whatever')).toBe('none');
    expect(statusFromText(undefined, 0)).toBe('error');
    expect(statusFromText(undefined)).toBeUndefined();
  });
});
