// Copies provisioning/dashboards/impact/*.json into src/demo/dashboards/ so the dashboards ship inside the
// plugin bundle (webpack copies src/**/*.json to dist and the Gallery imports them). The provisioned
// datasource uid `impact-testdata` is rewritten to the placeholder `${DS_TESTDATA}`, which the Gallery's
// "Install demo dashboards" flow replaces with the uid of the TestData datasource it finds or creates.
//
// Usage: node scripts/sync-demo-dashboards.mjs [--check]
//   --check  exit 1 if src/demo/dashboards is out of date instead of writing (the unit test does the same).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'provisioning', 'dashboards', 'impact');
const outDir = path.join(root, 'src', 'demo', 'dashboards');
const check = process.argv.includes('--check');

export const PROVISIONED_DS_UID = 'impact-testdata';
export const PLACEHOLDER_DS_UID = '${DS_TESTDATA}';
export const TESTDATA_TYPE = 'grafana-testdata-datasource';

/** Rewrites every datasource reference to the placeholder uid and the TestData type. */
export function transform(json) {
  const walk = (node) => {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v);
      }
      if (out.uid === PROVISIONED_DS_UID && typeof out.type === 'string') {
        out.uid = PLACEHOLDER_DS_UID;
        out.type = TESTDATA_TYPE;
      }
      return out;
    }
    return node;
  };
  const dashboard = walk(json);
  delete dashboard.id;
  return dashboard;
}

export function render(json) {
  return JSON.stringify(transform(json), null, 2) + '\n';
}

fs.mkdirSync(outDir, { recursive: true });
let stale = 0;
for (const file of fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const expected = render(JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8')));
  const target = path.join(outDir, file);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === expected) {
    continue;
  }
  stale++;
  if (check) {
    console.error(`stale: src/demo/dashboards/${file}`);
  } else {
    fs.writeFileSync(target, expected);
    console.log(`wrote src/demo/dashboards/${file}`);
  }
}
if (check && stale) {
  console.error('Run: node scripts/sync-demo-dashboards.mjs');
  process.exit(1);
}
if (!stale) {
  console.log('src/demo/dashboards is up to date');
}
