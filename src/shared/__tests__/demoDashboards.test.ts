// Guards against drift between the provisioned demo dashboards and the copies bundled in the plugin.
// Fix with: node scripts/sync-demo-dashboards.mjs
import fs from 'fs';
import path from 'path';
import { DEMO_DASHBOARDS } from '../../demo';
import { DS_PLACEHOLDER, TESTDATA_TYPE } from '../../app/installDemos';

const root = path.resolve(__dirname, '..', '..', '..');
const provisioned = path.join(root, 'provisioning', 'dashboards', 'impact');
const bundled = path.join(root, 'src', 'demo', 'dashboards');

function placeholderised(json: unknown): unknown {
  if (Array.isArray(json)) {
    return json.map(placeholderised);
  }
  if (json && typeof json === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(json)) {
      out[k] = placeholderised(v);
    }
    if (out.uid === 'impact-testdata' && typeof out.type === 'string') {
      out.uid = DS_PLACEHOLDER;
      out.type = TESTDATA_TYPE;
    }
    return out;
  }
  return json;
}

/** Same rewrite as scripts/sync-demo-dashboards.mjs: placeholder datasource, no top-level id. */
function expectedCopy(json: Record<string, unknown>): unknown {
  const out = placeholderised(json) as Record<string, unknown>;
  delete out.id;
  return out;
}

describe('bundled demo dashboards', () => {
  const files = fs
    .readdirSync(provisioned)
    .filter((f) => f.endsWith('.json'))
    .sort();

  it('lists every provisioned dashboard in DEMO_DASHBOARDS', () => {
    expect(DEMO_DASHBOARDS.map((d) => `${d.id}.json`).sort()).toEqual(files);
    expect(
      fs
        .readdirSync(bundled)
        .filter((f) => f.endsWith('.json'))
        .sort()
    ).toEqual(files);
  });

  it.each(files)('%s matches provisioning (run scripts/sync-demo-dashboards.mjs)', (file) => {
    const src = JSON.parse(fs.readFileSync(path.join(provisioned, file), 'utf8'));
    const copy = JSON.parse(fs.readFileSync(path.join(bundled, file), 'utf8'));
    expect(copy).toEqual(expectedCopy(src));
    expect(JSON.stringify(copy)).not.toContain('impact-testdata');
    const meta = DEMO_DASHBOARDS.find((d) => `${d.id}.json` === file)!;
    expect(copy.uid).toBe(meta.uid);
    expect(copy.title).toBe(meta.title);
  });
});
