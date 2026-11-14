// Run the app with npm run dev, then: node demo-materials/capture.mjs [app URL]
// Persona: a developer explaining the existing AI support agent example.
// Workflow: overview, unfold retrieval and search, play the flow, inspect Mermaid.
// Value: inspect nested detail and its source, then return to the folded overview.
// The example's content stays intact. Positions are compacted for this recording.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

const run = promisify(execFile);
const directory = dirname(fileURLToPath(import.meta.url));
const appUrl = process.argv[2] ?? 'http://127.0.0.1:5173';
const output = join(directory, 'halloween-demo.gif');
const scratch = await mkdtemp(join(tmpdir(), 'marmerlade-halloween-'));
const fixture = JSON.parse(await readFile(join(directory, '../examples/ai-support-agent/ai-support-agent.merfolk.json'), 'utf8'));
for (const node of fixture.diagram.nodes) {
  node.position.x *= 0.72;
  node.position.y *= 0.72;
}
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
let context;
try {
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: scratch, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(data => {
    if (!localStorage.getItem('marmerlade.diagram')) {
      localStorage.setItem('marmerlade.diagram', JSON.stringify(data));
    }
  }, fixture);
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Halloween', exact: true }).click();
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Fit View', exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'halloween');

  await page.addStyleTag({ content: `
    * { cursor: none !important; }
    #demo-cursor {
      position: fixed; z-index: 2147483647; pointer-events: none;
      width: 15px; height: 15px; border-radius: 50%;
      border: 2px solid #fff0dd; background: #ff963f;
      box-shadow: 0 0 0 4px #ff963f25, 0 2px 10px #0008;
      transform: translate(-50%, -50%);
    }
  ` });
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.style.left = '640px';
    cursor.style.top = '620px';
    document.body.append(cursor);
    document.addEventListener('mousemove', event => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
  });
  let pointer = { x: 640, y: 620 };
  await page.mouse.move(pointer.x, pointer.y);
  async function moveTo(x, y) {
    const start = pointer;
    for (let step = 1; step <= 24; step++) {
      const t = step / 24;
      const eased = t * t * (3 - 2 * t);
      await page.mouse.move(start.x + (x - start.x) * eased, start.y + (y - start.y) * eased);
      await page.waitForTimeout(12);
    }
    pointer = { x, y };
  }
  async function click(locator) {
    await locator.waitFor({ state: 'visible' });
    const box = await locator.boundingBox();
    assert(box, 'The target must have a visible bounding box');
    await moveTo(box.x + box.width / 2, box.y + box.height / 2);
    await locator.click({ delay: 100 });
  }
  const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
  const fit = async () => {
    await click(page.getByRole('button', { name: 'Fit View', exact: true }));
    await page.waitForTimeout(500);
  };
  const checkpoint = async name => {
    await page.screenshot({ path: join(scratch, `${name}.png`) });
    console.log(`Captured ${name}`);
  };
  const started = performance.now();
  let recording = true;
  const frames = [];
  const recordingFrames = (async () => {
    while (recording) {
      const at = performance.now();
      const filename = join(scratch, `frame-${String(frames.length).padStart(5, '0')}.png`);
      await page.screenshot({ path: filename });
      frames.push({ filename, at });
      await page.waitForTimeout(Math.max(1, 100 - (performance.now() - at)));
    }
  })();
  await checkpoint('01-overview');
  await page.waitForTimeout(1000);

  await click(node('Retrieval').getByRole('button', { name: /^Unfold/ }));
  await node('Rewrite').waitFor({ state: 'visible' });
  await page.waitForTimeout(550);
  await fit();
  await checkpoint('02-retrieval');
  await page.waitForTimeout(700);

  await click(node('Search').getByRole('button', { name: /^Unfold/ }));
  await node('Vector').waitFor({ state: 'visible' });
  await page.waitForTimeout(550);
  await fit();
  await checkpoint('03-search');
  await page.waitForTimeout(900);

  await click(page.getByRole('button', { name: 'Play flow', exact: true }));
  await page.getByRole('button', { name: 'Pause flow', exact: true }).waitFor({ state: 'visible' });
  await moveTo(710, 650);
  await page.waitForTimeout(3300);
  await checkpoint('04-playback');
  await click(page.getByRole('button', { name: 'Stop flow', exact: true }));

  await click(page.getByRole('button', { name: 'Open Mermaid panel', exact: true }));
  await page.getByRole('tab', { name: 'Mermaid', exact: true }).waitFor({ state: 'visible' });
  await fit();
  await checkpoint('05-mermaid');
  await page.waitForTimeout(2000);
  await click(page.getByRole('button', { name: 'Close panel', exact: true }));

  await click(node('__sheet__Search').getByRole('button', { name: 'Fold', exact: true }));
  await node('Search').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await click(node('__sheet__Retrieval').getByRole('button', { name: 'Fold', exact: true }));
  await node('Retrieval').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await fit();
  await moveTo(640, 620);
  await page.waitForTimeout(1000);
  await checkpoint('06-overview');
  const duration = (performance.now() - started) / 1000;
  recording = false;
  await recordingFrames;
  assert.deepEqual(errors, [], 'The recorded app must have no browser errors');

  const video = page.video();
  await context.close();
  context = undefined;
  const videoPath = await video.path();
  const frameList = join(scratch, 'frames.txt');
  await writeFile(frameList, frames.map((frame, index) => {
    const next = frames[index + 1]?.at ?? started + duration * 1000;
    return `file '${frame.filename}'\nduration ${Math.max(0.01, (next - frame.at) / 1000).toFixed(4)}`;
  }).join('\n') + '\n');
  const input = ['-f', 'concat', '-safe', '0', '-i', frameList];
  const palette = join(scratch, 'palette.png');
  const speed = Math.min(1, 24 / duration);
  const filter = `setpts=${speed.toFixed(6)}*(PTS-STARTPTS),fps=10,scale=1120:-1:flags=lanczos`;
  await run('ffmpeg', ['-y', ...input, '-vf', `${filter},palettegen=max_colors=128:stats_mode=diff`, '-frames:v', '1', palette]);
  await run('ffmpeg', ['-y', ...input, '-i', palette, '-filter_complex_threads', '1', '-filter_complex', `[0:v]${filter}[v];[v][1:v]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', output]);
  const gif = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', output])).stdout);
  console.log(`GIF: ${output} (${Number(gif.format.duration).toFixed(1)} s, ${((await stat(output)).size / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`Raw recording: ${videoPath}`);
  console.log(`Lossless frames and checkpoints: ${scratch}`);
} finally {
  await context?.close();
  await browser.close();
}
