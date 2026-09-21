// Probe the public NASA ISSLIVE Lightstreamer feed to discover which telemetry
// PUIs actually publish data. Run: npm run probe:telemetry
import ls from 'lightstreamer-client-node';
const { LightstreamerClient, Subscription } = ls.default || ls;

const CANDIDATES = [
  'TIME_000001', 'TIME_000002',
  // Station mode / attitude
  'USLAB000058', 'USLAB000086', 'USLAB000087', 'USLAB000088',
  'USLAB000012', 'USLAB000013', 'USLAB000014', 'USLAB000015',
  // CMG
  'Z1000005', 'Z1000006', 'Z1000007', 'Z1000008',
  // Solar array voltages
  'S4000001', 'S4000004', 'P4000001', 'P4000004',
  'S6000001', 'S6000004', 'P6000001', 'P6000004',
  // Solar array currents
  'S4000002', 'S4000005', 'P4000002', 'P4000005',
  'S6000002', 'S6000005', 'P6000002', 'P6000005',
  // Beta gimbal angles
  'S4000007', 'S4000008', 'P4000007', 'P4000008',
  'S6000007', 'S6000008', 'P6000007', 'P6000008',
  // SARJ
  'S0000003', 'S0000004', 'S0000002', 'S0000001',
  // Airlock / pressure
  'AIRLOCK000049', 'AIRLOCK000050', 'AIRLOCK000051',
  'AIRLOCK000052', 'AIRLOCK000053', 'AIRLOCK000054',
  // Node / thermal / ECLSS
  'NODE3000001', 'NODE3000002', 'NODE3000003', 'NODE3000004',
  'NODE3000005', 'NODE3000006', 'NODE3000007', 'NODE3000008',
  'NODE3000009', 'NODE3000010', 'NODE3000011', 'NODE3000012',
  'NODE2000001', 'NODE2000002', 'NODE2000003',
  // External thermal loops
  'S1000001', 'S1000002', 'S1000003', 'S1000004',
  'P1000001', 'P1000002', 'P1000003', 'P1000004',
  // Russian segment
  'RUSSEG000001', 'RUSSEG000002', 'RUSSEG000015',
];

const seen = new Map();
const client = new LightstreamerClient('https://push.lightstreamer.com', 'ISSLIVE');

client.addListener({
  onStatusChange: (s) => console.error('[status]', s),
  onServerError: (c, m) => console.error('[server-error]', c, m),
});

const sub = new Subscription('MERGE', CANDIDATES, ['TimeStamp', 'Value', 'Status.Class']);
sub.setRequestedSnapshot('yes');
sub.addListener({
  onItemUpdate: (u) => {
    const name = u.getItemName();
    const v = u.getValue('Value');
    const t = u.getValue('TimeStamp');
    if (!seen.has(name)) seen.set(name, { first: v, ts: t, count: 0 });
    const e = seen.get(name);
    e.count++; e.last = v; e.ts = t;
  },
  onSubscriptionError: (c, m) => console.error('[sub-error]', c, m),
});

client.connect();
client.subscribe(sub);

const SECONDS = Number(process.argv[2] || 30);
setTimeout(() => {
  console.log(`\n=== responded: ${seen.size} / ${CANDIDATES.length} after ${SECONDS}s ===`);
  for (const [k, v] of [...seen.entries()].sort()) {
    console.log(`${k.padEnd(16)} updates=${String(v.count).padEnd(4)} ts=${String(v.ts).padEnd(12)} value=${v.last}`);
  }
  const silent = CANDIDATES.filter((c) => !seen.has(c));
  console.log(`\n=== silent (${silent.length}) ===\n${silent.join(' ')}`);
  process.exit(0);
}, SECONDS * 1000);
