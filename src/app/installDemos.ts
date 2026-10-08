// Pure install logic for the Gallery's "Install demo dashboards" flow. Everything talks to Grafana through
// the small `ApiClient` interface so it can be unit-tested with a fake and wired to `getBackendSrv()` in the UI.

export type DemoDashboardJson = Record<string, unknown> & { uid: string; title: string };

export interface ApiClient {
  get<T = unknown>(url: string): Promise<T>;
  post<T = unknown>(url: string, body: unknown): Promise<T>;
}

/** Error shape thrown by `getBackendSrv().fetch` (and by the fake client in tests). */
export interface ApiError {
  status?: number;
  data?: { message?: string };
  message?: string;
}

export const DS_PLACEHOLDER = '${DS_TESTDATA}';
export const TESTDATA_TYPE = 'grafana-testdata-datasource';
export const DEMO_DATASOURCE_NAME = 'Impact demo data';
export const DEMO_FOLDER_TITLE = 'Impact';

export interface DataSourceRef {
  uid: string;
  name: string;
  type: string;
}

export interface FolderRef {
  uid: string;
  title: string;
}

export interface InstalledState {
  installed: boolean;
  /** Relative dashboard URL (`/d/<uid>/<slug>`) when installed. */
  url?: string;
  folderUid?: string;
}

export interface InstallResult {
  uid: string;
  title: string;
  url: string;
}

export class InstallError extends Error {
  constructor(
    message: string,
    /** The Grafana permission a user needs for the failed step, for 401/403 responses. */
    public readonly permission?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'InstallError';
  }
}

function statusOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null ? (err as ApiError).status : undefined;
}

function messageOf(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as ApiError;
    return e.data?.message ?? e.message ?? 'request failed';
  }
  return String(err);
}

/** Wraps a backend error in an `InstallError`, naming the permission when access was denied. */
export function toInstallError(err: unknown, action: string, permission: string): InstallError {
  if (err instanceof InstallError) {
    return err;
  }
  const status = statusOf(err);
  if (status === 401 || status === 403) {
    return new InstallError(
      `Not allowed to ${action}: your account needs ${permission} (an organisation Admin can do this once; the dashboards are then shared with everyone).`,
      permission,
      status
    );
  }
  return new InstallError(`Could not ${action}: ${messageOf(err)}`, undefined, status);
}

/** Returns the first TestData datasource, creating "Impact demo data" when the instance has none. */
export async function ensureTestDataSource(client: ApiClient): Promise<DataSourceRef & { created: boolean }> {
  let list: DataSourceRef[];
  try {
    list = await client.get<DataSourceRef[]>('/api/datasources');
  } catch (err) {
    throw toInstallError(err, 'list data sources', 'the "datasources:read" permission (Admin role)');
  }
  const existing = list.find((d) => d.type === TESTDATA_TYPE);
  if (existing) {
    return { uid: existing.uid, name: existing.name, type: existing.type, created: false };
  }
  try {
    const res = await client.post<{ datasource: DataSourceRef }>('/api/datasources', {
      name: DEMO_DATASOURCE_NAME,
      type: TESTDATA_TYPE,
      access: 'proxy',
    });
    return { ...res.datasource, created: true };
  } catch (err) {
    throw toInstallError(err, 'create a TestData data source', 'the "datasources:create" permission (Admin role)');
  }
}

/** Returns the top-level "Impact" folder, creating it if missing. */
export async function ensureFolder(client: ApiClient): Promise<FolderRef & { created: boolean }> {
  let list: FolderRef[];
  try {
    list = await client.get<FolderRef[]>('/api/folders');
  } catch (err) {
    throw toInstallError(err, 'list folders', 'the "folders:read" permission');
  }
  const existing = list.find((f) => f.title === DEMO_FOLDER_TITLE);
  if (existing) {
    return { uid: existing.uid, title: existing.title, created: false };
  }
  try {
    const res = await client.post<FolderRef>('/api/folders', { title: DEMO_FOLDER_TITLE });
    return { uid: res.uid, title: res.title, created: true };
  } catch (err) {
    throw toInstallError(err, 'create the "Impact" folder', 'the "folders:create" permission (Editor role)');
  }
}

/** Deep-copies the dashboard, replacing every `${DS_TESTDATA}` placeholder with the real datasource uid. */
export function bindDatasource<T>(json: T, dsUid: string): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node === DS_PLACEHOLDER ? dsUid : node;
  };
  return walk(json) as T;
}

/** `installed: false` on 404, `installed: true` with the URL otherwise. Other errors propagate as `InstallError`. */
export async function getInstalledState(client: ApiClient, uid: string): Promise<InstalledState> {
  try {
    const res = await client.get<{ meta?: { url?: string; folderUid?: string } }>(`/api/dashboards/uid/${uid}`);
    return { installed: true, url: res.meta?.url, folderUid: res.meta?.folderUid };
  } catch (err) {
    if (statusOf(err) === 404) {
      return { installed: false };
    }
    throw toInstallError(err, `check dashboard ${uid}`, 'the "dashboards:read" permission');
  }
}

/** Saves one bundled dashboard (uid kept, overwrite on) into the folder, bound to the datasource. */
export async function installDashboard(
  client: ApiClient,
  json: DemoDashboardJson,
  dsUid: string,
  folderUid: string
): Promise<InstallResult> {
  const dashboard = { ...bindDatasource(json, dsUid), id: null };
  try {
    const res = await client.post<{ uid: string; url: string }>('/api/dashboards/db', {
      dashboard,
      folderUid,
      overwrite: true,
      message: 'Installed from the Impact gallery',
    });
    return { uid: res.uid, title: json.title, url: res.url };
  } catch (err) {
    throw toInstallError(err, `save "${json.title}"`, 'the "dashboards:create" permission (Editor role)');
  }
}

/**
 * Installs several dashboards in one go: data source and folder are resolved once, then every dashboard
 * is saved in order. Fails fast with an `InstallError`; already-saved dashboards stay installed.
 */
export async function installDemos(
  client: ApiClient,
  load: () => Promise<DemoDashboardJson[]>
): Promise<{ datasource: DataSourceRef; folder: FolderRef; results: InstallResult[] }> {
  const datasource = await ensureTestDataSource(client);
  const folder = await ensureFolder(client);
  const results: InstallResult[] = [];
  for (const json of await load()) {
    results.push(await installDashboard(client, json, datasource.uid, folder.uid));
  }
  return { datasource, folder, results };
}
