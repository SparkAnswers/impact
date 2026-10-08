import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { lastValueFrom } from 'rxjs';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { getBackendSrv, PluginPage } from '@grafana/runtime';
import {
  Alert,
  Badge,
  Button,
  Card,
  ClipboardButton,
  ControlledCollapse,
  LinkButton,
  Stack,
  Text,
  useStyles2,
} from '@grafana/ui';
import { DEMO_DASHBOARDS, loadDemoDashboard, type DemoDashboardMeta, type DemoId } from '../demo';
import { DATA_SHAPES, testdataExample, type DataShape } from './dataShapes';
import {
  DEMO_FOLDER_TITLE,
  ensureFolder,
  ensureTestDataSource,
  getInstalledState,
  installDashboard,
  InstallError,
  type ApiClient,
  type InstalledState,
} from './installDemos';

type PanelId = Exclude<DemoId, 'showcase'>;

interface PanelCard {
  id: PanelId;
  name: string;
  blurb: string;
}

const PANELS: PanelCard[] = [
  { id: 'flow', name: 'Flow Designer', blurb: 'Node and edge diagrams with animated particles and editable curves.' },
  { id: 'gauge', name: 'Power Gauge', blurb: 'Ring gauge with signed arc fill and an in-ring history chart.' },
  { id: 'river', name: 'Flow River', blurb: 'Particle streamlines along a channel coloured by value.' },
  { id: 'bars', name: 'Status Bars', blurb: 'Rows of animated progress bars, sparklines and status pills.' },
];

type Status =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'installed'; url: string }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

/** Thin adapter from Grafana's backend service to the testable `ApiClient` (no toast on failure). */
function backendClient(): ApiClient {
  const srv = getBackendSrv();
  const request = async <T,>(method: 'GET' | 'POST', url: string, data?: unknown): Promise<T> => {
    const res = await lastValueFrom(
      srv.fetch<T>({ method, url, data, showErrorAlert: false, showSuccessAlert: false })
    );
    return res.data;
  };
  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
  };
}

function toStatus(state: InstalledState): Status {
  return state.installed && state.url ? { kind: 'installed', url: state.url } : { kind: 'missing' };
}

/** Installed/missing state for every bundled dashboard (404 = missing; other failures become an error state). */
async function checkAll(client: ApiClient): Promise<Record<string, Status>> {
  const entries = await Promise.all(
    DEMO_DASHBOARDS.map(async (d): Promise<[string, Status]> => {
      try {
        return [d.id, toStatus(await getInstalledState(client, d.uid))];
      } catch (err) {
        return [d.id, { kind: 'error', message: errorMessage(err) }];
      }
    })
  );
  return Object.fromEntries(entries);
}

function errorMessage(err: unknown): string {
  if (err instanceof InstallError) {
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export default function Gallery() {
  const styles = useStyles2(getStyles);
  const client = useMemo(() => backendClient(), []);
  const [status, setStatus] = useState<Record<string, Status>>(() =>
    Object.fromEntries(DEMO_DASHBOARDS.map((d) => [d.id, { kind: 'checking' }]))
  );
  const [banner, setBanner] = useState<{ severity: 'success' | 'error'; title: string; body?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => checkAll(client).then(setStatus), [client]);

  useEffect(() => {
    let live = true;
    checkAll(client).then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [client]);

  const install = useCallback(
    async (targets: DemoDashboardMeta[]) => {
      setBusy(true);
      setBanner(null);
      setStatus((s) => ({ ...s, ...Object.fromEntries(targets.map((t) => [t.id, { kind: 'installing' }])) }));
      try {
        const ds = await ensureTestDataSource(client);
        const folder = await ensureFolder(client);
        const done: Array<{ title: string; url: string }> = [];
        for (const t of targets) {
          const json = await loadDemoDashboard(t.id);
          const res = await installDashboard(client, json, ds.uid, folder.uid);
          done.push(res);
          setStatus((s) => ({ ...s, [t.id]: { kind: 'installed', url: res.url } }));
        }
        const dsNote = ds.created ? ` Created TestData data source "${ds.name}".` : ` Using data source "${ds.name}".`;
        setBanner({
          severity: 'success',
          title: `Installed ${done.length} dashboard${done.length === 1 ? '' : 's'} into folder "${folder.title}".${dsNote}`,
          body: done.map((d) => d.title).join(', '),
        });
      } catch (err) {
        const message = errorMessage(err);
        setBanner({ severity: 'error', title: 'Could not install the demo dashboards', body: message });
        setStatus((s) => ({
          ...s,
          ...Object.fromEntries(
            targets.map((t) => [t.id, s[t.id]?.kind === 'installed' ? s[t.id] : { kind: 'error', message }])
          ),
        }));
      } finally {
        setBusy(false);
        void refresh();
      }
    },
    [client, refresh]
  );

  const allInstalled = DEMO_DASHBOARDS.every((d) => status[d.id]?.kind === 'installed');
  const showcase = DEMO_DASHBOARDS.find((d) => d.id === 'showcase')!;

  return (
    <PluginPage>
      <Stack direction="column" gap={2}>
        <Text element="p">
          Impact ships four visualisations. Add any of them from the panel picker (they are listed under the
          &quot;Impact&quot; prefix) or install the demo dashboards below: they run on the built-in TestData source, so
          they work on any Grafana without extra setup.
        </Text>

        <div className={styles.toolbar}>
          <Stack direction="row" gap={1} wrap="wrap" alignItems="center">
            <Button
              icon={allInstalled ? 'sync' : 'cloud-download'}
              disabled={busy}
              onClick={() => install(DEMO_DASHBOARDS)}
              aria-label="Install all demo dashboards"
            >
              {allInstalled ? 'Reinstall all demos' : 'Install all demos'}
            </Button>
            <ShowcaseActions status={status[showcase.id]} busy={busy} onInstall={() => install([showcase])} />
            <Text color="secondary" variant="bodySmall">
              Dashboards are saved in the &quot;{DEMO_FOLDER_TITLE}&quot; folder; existing copies are overwritten.
              Creating the TestData source needs an organisation Admin the first time.
            </Text>
          </Stack>
        </div>

        {banner && (
          <Alert severity={banner.severity} title={banner.title} onRemove={() => setBanner(null)}>
            {banner.body}
          </Alert>
        )}

        <div className={styles.grid}>
          {PANELS.map((p) => {
            const meta = DEMO_DASHBOARDS.find((d) => d.id === p.id)!;
            return (
              <PanelSection
                key={p.id}
                panel={p}
                status={status[p.id] ?? { kind: 'checking' }}
                busy={busy}
                shape={DATA_SHAPES[p.id]}
                onInstall={() => install([meta])}
              />
            );
          })}
        </div>
      </Stack>
    </PluginPage>
  );
}

function ShowcaseActions({
  status,
  busy,
  onInstall,
}: {
  status: Status | undefined;
  busy: boolean;
  onInstall: () => void;
}) {
  if (status?.kind === 'installed') {
    return (
      <LinkButton variant="secondary" icon="apps" href={status.url}>
        Open showcase
      </LinkButton>
    );
  }
  return (
    <Button variant="secondary" icon="apps" disabled={busy || status?.kind === 'checking'} onClick={onInstall}>
      {status?.kind === 'installing' ? 'Installing showcase...' : 'Install showcase'}
    </Button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  switch (status.kind) {
    case 'checking':
      return <Badge color="blue" text="Checking" icon="fa fa-spinner" />;
    case 'installing':
      return <Badge color="blue" text="Installing" icon="fa fa-spinner" />;
    case 'installed':
      return <Badge color="green" text="Installed" icon="check" />;
    case 'error':
      return <Badge color="red" text="Error" icon="exclamation-triangle" tooltip={status.message} />;
    default:
      return <Badge color="orange" text="Not installed" icon="info-circle" />;
  }
}

function PanelSection({
  panel,
  status,
  busy,
  shape,
  onInstall,
}: {
  panel: PanelCard;
  status: Status;
  busy: boolean;
  shape: DataShape;
  onInstall: () => void;
}) {
  const styles = useStyles2(getStyles);
  const installed = status.kind === 'installed';
  return (
    <div className={styles.section}>
      <Card noMargin className={styles.card}>
        <Card.Heading>{`Impact ${panel.name}`}</Card.Heading>
        <Card.Description>{panel.blurb}</Card.Description>
        <Card.Meta>
          <StatusBadge status={status} />
        </Card.Meta>
        <Card.Actions>
          <Button
            size="sm"
            variant={installed ? 'secondary' : 'primary'}
            icon={installed ? 'sync' : 'cloud-download'}
            disabled={busy || status.kind === 'checking'}
            onClick={onInstall}
            aria-label={`${installed ? 'Reinstall' : 'Install'} ${panel.name} demo dashboard`}
          >
            {installed ? 'Reinstall demo' : status.kind === 'installing' ? 'Installing...' : 'Install demo'}
          </Button>
          {installed && (
            <LinkButton size="sm" variant="secondary" icon="external-link-alt" href={status.url}>
              Open
            </LinkButton>
          )}
        </Card.Actions>
        {status.kind === 'error' && (
          <Card.SecondaryActions>
            <Text color="error" variant="bodySmall">
              {status.message}
            </Text>
          </Card.SecondaryActions>
        )}
      </Card>
      <ControlledCollapse label="Data shape: use with your data" className={styles.collapse}>
        <Stack direction="column" gap={1}>
          <Text element="p">{shape.summary}</Text>
          <ul className={styles.list}>
            {shape.reads.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Example title="Prometheus-style query" text={shape.prometheus.query} note={shape.prometheus.note} />
          <Example title="TestData query (JSON)" text={testdataExample(shape)} note={shape.testdata.note} />
        </Stack>
      </ControlledCollapse>
    </div>
  );
}

function Example({ title, text, note }: { title: string; text: string; note?: string }) {
  const styles = useStyles2(getStyles);
  return (
    <div>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Text weight="medium" variant="bodySmall">
          {title}
        </Text>
        <ClipboardButton size="sm" variant="secondary" icon="copy" getText={() => text}>
          Copy
        </ClipboardButton>
      </Stack>
      <pre className={styles.code}>{text}</pre>
      {note && (
        <Text color="secondary" variant="bodySmall">
          {note}
        </Text>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  toolbar: css({
    padding: theme.spacing(1.5),
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
  }),
  grid: css({
    display: 'grid',
    gap: theme.spacing(2),
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
    alignItems: 'start',
  }),
  section: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minWidth: 0,
  }),
  card: css({
    height: '100%',
  }),
  collapse: css({
    marginBottom: 0,
  }),
  list: css({
    margin: 0,
    paddingLeft: theme.spacing(2.5),
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  code: css({
    margin: theme.spacing(0.5, 0),
    padding: theme.spacing(1),
    background: theme.colors.background.canvas,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 240,
    overflow: 'auto',
  }),
});
