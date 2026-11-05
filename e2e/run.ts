import { mkdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { createServer } from 'vite';

const MIN_FPS = Number(process.env.CEDAR_MIN_FPS ?? 3);
const RUN_MS = 10_000;
const ART = fileURLToPath(new URL('./artifacts/', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));

type Snap = { frames: number; running: boolean; paused: boolean; dist: number; speed: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class Fail extends Error {}
const check = (ok: boolean, msg: string) => {
  if (!ok) throw new Fail(msg);
};

const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const f = window.__cedar;
    if (!f) throw new Error('window.__cedar missing');
    return f();
  });

async function litPixels(page: Page, shot: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d ctx');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) {
      seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    }
    return seen.size;
  }, shot.toString('base64'));
}

async function run(): Promise<{ fps: number; shots: number }> {
  rmSync(ART, { recursive: true, force: true });
  mkdirSync(ART, { recursive: true });
  let shots = 0;

  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const { port } = server.httpServer?.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
    });
    await page.route(
      (u) => u.origin !== origin,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain',
          body: '',
        }),
    );

    const shot = async (name: string) => {
      const buf = await page.screenshot({ path: `${ART}${name}.png` });
      shots++;
      return buf;
    };

    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__cedar === 'function', undefined, {
      timeout: 15_000,
    });
    await sleep(1500);

    const menu = await shot('01-menu');
    const menuColors = await litPixels(page, menu);
    check(menuColors > 8, `canvas looks blank on menu (${menuColors} colors)`);
    const s0 = await snap(page);
    check(!s0.running, 'game should start idle');
    check(s0.frames > 5, 'render loop not ticking');

    await page.keyboard.press('Enter');
    await sleep(300);
    check((await snap(page)).running, 'Enter did not start the run');

    await page.keyboard.down('KeyW');
    await sleep(3000);
    const s1 = await snap(page);
    await shot('02-pedalling');
    check(s1.speed > s0.speed + 1, `holding W did not speed up (${s0.speed} -> ${s1.speed})`);
    check(s1.dist > s0.dist + 1, `no distance covered (${s0.dist} -> ${s1.dist})`);

    const a = await snap(page);
    const t0 = Date.now();
    await sleep(RUN_MS / 2);
    await shot('03-midrun');
    await sleep(RUN_MS / 2);
    const b = await snap(page);
    const secs = (Date.now() - t0) / 1000;
    await page.keyboard.up('KeyW');
    const fps = Math.round((b.frames - a.frames) / secs);
    const end = await shot('04-end');
    const endColors = await litPixels(page, end);
    check(endColors > 8, `canvas blank after run (${endColors} colors)`);
    check(b.dist > a.dist, 'run stalled');
    check(!b.paused, 'game paused itself during run');

    check(problems.length === 0, problems.slice(0, 3).join(' | '));
    check(fps >= MIN_FPS, `fps ${fps} below floor ${MIN_FPS}`);
    return { fps, shots };
  } finally {
    await browser.close();
    await server.close();
  }
}

try {
  const { fps, shots } = await run();
  console.log(`VERIFY cedar-drop-e2e PASS fps=${fps} shots=${shots}`);
  process.exit(0);
} catch (e) {
  const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').trim();
  console.log(`VERIFY cedar-drop-e2e FAIL ${msg}`);
  process.exit(1);
}
