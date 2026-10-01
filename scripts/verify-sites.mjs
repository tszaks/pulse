// Verify every tracked site end to end against the live Pulse instance.
//
// Loads each site in a real browser, confirms the tracker script loads, the
// collect POST fires with the right website id, and the pageview count in
// Umami actually increments.
//
// Requires a realistic user agent: Umami rejects headless UAs as bots and
// returns {beep:"boop"} without recording anything.
//
//   npm i -D playwright && node scripts/verify-sites.mjs
//
import { chromium } from 'playwright';

const BASE = 'https://pulse.szakacsmedia.com';
const SITES = [
  ['szakacsmedia.com',            '36bed286-eeb3-4ea5-a022-cb8575ebde2b'],
  ['tylerszakacs.com',            '51bda4bf-deae-4069-acf9-ea10975923a9'],
  ['askvero.app',                 'b9ea9787-a196-4c3c-a73d-93bcfd98447b'],
  ['marpenutrition.com',          '7685d6ba-2850-4fc2-b84b-47799af73079'],
  ['mymarpedetox.com',            '19c280ad-dcf9-4987-9d7c-fcf04d79557b'],
  ['gnaworks.com',                'e593c469-a145-4619-ac33-ea8dd1f685be'],
  ['outpostdigital.org',          'f7c051c4-bbc7-4c92-a2d6-0e0f989a4f1d'],
  ['homangrown.com',              '5a979c6f-e2d3-4947-905c-0f0abc72a621'],
  ['background-lift.vercel.app',  'd5deb627-a1f6-43c9-a101-6ec6572f0534'],
];

async function api(path, { token, body } = {}) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

const { data: auth } = await api('/api/auth/login', { body: { username: process.env.PULSE_USER ?? 'admin', password: process.env.PULSE_PASS } });
const token = auth.token;

async function counts() {
  const end = Date.now(), start = end - 3600 * 1000;
  const out = {};
  for (const [, id] of SITES) {
    const { data } = await api(`/api/websites/${id}/stats?startAt=${start}&endAt=${end}`, { token });
    const pv = data?.pageviews;
    out[id] = (typeof pv === 'number' ? pv : pv?.value) ?? 0;
  }
  return out;
}

const before = await counts();

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const rows = [];

for (const [domain, id] of SITES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();
  let scriptMs = null, scriptStatus = null, sendStatus = null, sendMs = null, sentId = null;
  let t0 = 0, t1 = 0;

  page.on('request', req => {
    const u = req.url();
    if (u.includes('pulse.szakacsmedia.com/script.js')) t0 = Date.now();
    if (u.includes('pulse.szakacsmedia.com/api/send')) {
      t1 = Date.now();
      try { sentId = JSON.parse(req.postData() || '{}')?.payload?.website ?? null; } catch {}
    }
  });
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('pulse.szakacsmedia.com/script.js')) { scriptStatus = res.status(); scriptMs = Date.now() - t0; }
    if (u.includes('pulse.szakacsmedia.com/api/send')) { sendStatus = res.status(); sendMs = Date.now() - t1; }
  });

  const nav0 = Date.now();
  let pageMs = null, navErr = null;
  try {
    await page.goto('https://' + domain + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    pageMs = Date.now() - nav0;
    await page.waitForTimeout(6000);
  } catch (e) { navErr = e.message.slice(0, 50); }

  rows.push({ domain, id, pageMs, scriptStatus, scriptMs, sendStatus, sendMs, sentId, navErr,
              idMatch: sentId ? (sentId === id) : null });
  await ctx.close();
}
await browser.close();

await new Promise(r => setTimeout(r, 4000));
const after = await counts();

console.log('\n' + '='.repeat(104));
console.log('REAL BROWSER END-TO-END TEST');
console.log('='.repeat(104));
console.log(
  'SITE'.padEnd(28) + 'PAGE'.padStart(7) + 'SCRIPT'.padStart(9) + 'SEND'.padStart(9) +
  'ID OK'.padStart(7) + 'PV BEFORE'.padStart(11) + 'PV AFTER'.padStart(10) + '  RESULT');
console.log('-'.repeat(104));

let pass = 0;
for (const r of rows) {
  const b = before[r.id], a = after[r.id];
  const ok = r.scriptStatus === 200 && r.sendStatus === 200 && r.idMatch === true && a > b;
  if (ok) pass++;
  console.log(
    r.domain.padEnd(28) +
    String(r.pageMs ?? 'ERR').padStart(6) + 'ms' +
    String(r.scriptStatus === 200 ? r.scriptMs + 'ms' : (r.scriptStatus ?? 'MISS')).padStart(9) +
    String(r.sendStatus === 200 ? r.sendMs + 'ms' : (r.sendStatus ?? 'MISS')).padStart(9) +
    String(r.idMatch === true ? 'yes' : r.idMatch === false ? 'NO' : '-').padStart(7) +
    String(b).padStart(11) + String(a).padStart(10) +
    '  ' + (ok ? 'PASS' : 'FAIL' + (r.navErr ? ' ' + r.navErr : '')));
}
console.log('-'.repeat(104));
console.log(`${pass}/${rows.length} sites fully functional end to end`);

const sms = rows.filter(r => r.scriptStatus === 200).map(r => r.scriptMs);
const dms = rows.filter(r => r.sendStatus === 200).map(r => r.sendMs);
const stat = (a) => a.length ? `min ${Math.min(...a)}ms  avg ${Math.round(a.reduce((x,y)=>x+y,0)/a.length)}ms  max ${Math.max(...a)}ms` : 'n/a';
console.log(`\ntracker script load : ${stat(sms)}`);
console.log(`collect POST        : ${stat(dms)}`);
