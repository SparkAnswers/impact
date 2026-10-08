import {
  bindDatasource,
  DEMO_DATASOURCE_NAME,
  DEMO_FOLDER_TITLE,
  DS_PLACEHOLDER,
  ensureFolder,
  ensureTestDataSource,
  getInstalledState,
  installDashboard,
  installDemos,
  InstallError,
  TESTDATA_TYPE,
  type ApiClient,
  type DemoDashboardJson,
} from '../installDemos';

interface Call {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
}

/** In-memory Grafana: datasources, folders, dashboards, with per-route permission denial. */
function fakeGrafana(opts: { datasources?: Array<{ uid: string; name: string; type: string }>; deny?: string[] } = {}) {
  const calls: Call[] = [];
  const datasources = [...(opts.datasources ?? [])];
  const folders: Array<{ uid: string; title: string }> = [];
  const dashboards = new Map<string, { folderUid: string; dashboard: DemoDashboardJson }>();
  const deny = new Set(opts.deny ?? []);
  const forbidden = (url: string) => ({ status: 403, data: { message: `forbidden ${url}` } });
  const client: ApiClient = {
    async get<T>(url: string): Promise<T> {
      calls.push({ method: 'GET', url });
      if (deny.has(`GET ${url}`)) {
        throw forbidden(url);
      }
      if (url === '/api/datasources') {
        return datasources as T;
      }
      if (url === '/api/folders') {
        return folders as T;
      }
      const m = url.match(/^\/api\/dashboards\/uid\/(.+)$/);
      if (m) {
        const hit = dashboards.get(m[1]);
        if (!hit) {
          throw { status: 404, data: { message: 'Dashboard not found' } };
        }
        return { dashboard: hit.dashboard, meta: { url: `/d/${m[1]}/slug`, folderUid: hit.folderUid } } as T;
      }
      throw new Error(`unexpected GET ${url}`);
    },
    async post<T>(url: string, body: unknown): Promise<T> {
      calls.push({ method: 'POST', url, body });
      if (deny.has(`POST ${url}`)) {
        throw forbidden(url);
      }
      if (url === '/api/datasources') {
        const b = body as { name: string; type: string };
        const ds = { uid: 'ds-new', name: b.name, type: b.type };
        datasources.push(ds);
        return { datasource: ds } as T;
      }
      if (url === '/api/folders') {
        const f = { uid: 'folder-new', title: (body as { title: string }).title };
        folders.push(f);
        return f as T;
      }
      if (url === '/api/dashboards/db') {
        const b = body as { dashboard: DemoDashboardJson; folderUid: string; overwrite: boolean };
        if (dashboards.has(b.dashboard.uid) && !b.overwrite) {
          throw { status: 412, data: { message: 'exists' } };
        }
        dashboards.set(b.dashboard.uid, { folderUid: b.folderUid, dashboard: b.dashboard });
        return { uid: b.dashboard.uid, url: `/d/${b.dashboard.uid}/slug`, status: 'success' } as T;
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };
  return { client, calls, datasources, folders, dashboards };
}

const demo = (uid: string): DemoDashboardJson => ({
  uid,
  title: `Demo ${uid}`,
  panels: [
    { datasource: { type: TESTDATA_TYPE, uid: DS_PLACEHOLDER }, targets: [{ datasource: { uid: DS_PLACEHOLDER } }] },
  ],
});

describe('bindDatasource', () => {
  it('replaces every placeholder without mutating the input', () => {
    const src = demo('impact-x');
    const out = bindDatasource(src, 'real');
    expect(JSON.stringify(out)).not.toContain(DS_PLACEHOLDER);
    expect(JSON.stringify(out).split('"real"')).toHaveLength(3);
    expect(JSON.stringify(src)).toContain(DS_PLACEHOLDER);
  });
});

describe('ensureTestDataSource', () => {
  it('reuses an existing TestData source regardless of name', async () => {
    const g = fakeGrafana({ datasources: [{ uid: 'td', name: 'Whatever', type: TESTDATA_TYPE }] });
    const ds = await ensureTestDataSource(g.client);
    expect(ds).toMatchObject({ uid: 'td', created: false });
    expect(g.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('creates one when missing', async () => {
    const g = fakeGrafana({ datasources: [{ uid: 'p', name: 'Metrics', type: 'prometheus' }] });
    const ds = await ensureTestDataSource(g.client);
    expect(ds).toMatchObject({ uid: 'ds-new', name: DEMO_DATASOURCE_NAME, created: true });
    expect(g.calls[1]).toEqual({
      method: 'POST',
      url: '/api/datasources',
      body: { name: DEMO_DATASOURCE_NAME, type: TESTDATA_TYPE, access: 'proxy' },
    });
  });

  it('explains the missing permission on 403', async () => {
    const g = fakeGrafana({ deny: ['POST /api/datasources'] });
    const err = await ensureTestDataSource(g.client).catch((e) => e);
    expect(err).toBeInstanceOf(InstallError);
    expect(err.status).toBe(403);
    expect(err.permission).toContain('datasources:create');
    expect(err.message).toMatch(/Admin/);
  });
});

describe('ensureFolder', () => {
  it('finds by title, else creates', async () => {
    const g = fakeGrafana();
    const first = await ensureFolder(g.client);
    expect(first).toMatchObject({ uid: 'folder-new', title: DEMO_FOLDER_TITLE, created: true });
    const second = await ensureFolder(g.client);
    expect(second.created).toBe(false);
    expect(g.folders).toHaveLength(1);
  });
});

describe('getInstalledState', () => {
  it('treats 404 as not installed and other failures as errors', async () => {
    const g = fakeGrafana({ deny: ['GET /api/dashboards/uid/denied'] });
    await expect(getInstalledState(g.client, 'nope')).resolves.toEqual({ installed: false });
    await expect(getInstalledState(g.client, 'denied')).rejects.toBeInstanceOf(InstallError);
  });
});

describe('installDashboard / installDemos', () => {
  it('posts with overwrite, folderUid, id null and bound datasource', async () => {
    const g = fakeGrafana();
    const res = await installDashboard(g.client, demo('impact-a'), 'td', 'f1');
    expect(res).toEqual({ uid: 'impact-a', title: 'Demo impact-a', url: '/d/impact-a/slug' });
    const body = g.calls[0].body as { dashboard: Record<string, unknown>; folderUid: string; overwrite: boolean };
    expect(body.overwrite).toBe(true);
    expect(body.folderUid).toBe('f1');
    expect(body.dashboard.id).toBeNull();
    expect(JSON.stringify(body.dashboard)).not.toContain(DS_PLACEHOLDER);
    await expect(getInstalledState(g.client, 'impact-a')).resolves.toMatchObject({ installed: true, folderUid: 'f1' });
  });

  it('installs all, resolving datasource and folder once, and is idempotent', async () => {
    const g = fakeGrafana();
    const load = async () => [demo('impact-a'), demo('impact-b')];
    const first = await installDemos(g.client, load);
    expect(first.results.map((r) => r.uid)).toEqual(['impact-a', 'impact-b']);
    expect(first.datasource.uid).toBe('ds-new');
    const second = await installDemos(g.client, load);
    expect(second.datasource.uid).toBe('ds-new');
    expect(g.datasources).toHaveLength(1);
    expect(g.folders).toHaveLength(1);
    expect(g.dashboards.size).toBe(2);
    expect(g.calls.filter((c) => c.url === '/api/datasources' && c.method === 'POST')).toHaveLength(1);
  });

  it('stops at the first failure with a clear message', async () => {
    const g = fakeGrafana({
      datasources: [{ uid: 'td', name: 'T', type: TESTDATA_TYPE }],
      deny: ['POST /api/dashboards/db'],
    });
    const err = await installDemos(g.client, async () => [demo('impact-a')]).catch((e) => e);
    expect(err).toBeInstanceOf(InstallError);
    expect(err.message).toContain('save "Demo impact-a"');
    expect(err.permission).toContain('dashboards:create');
  });
});
