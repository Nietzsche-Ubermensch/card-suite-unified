// REPL driver for card-suite-unified (Express API + Vite/React frontend).
// Run on headless Linux with the global `playwright` package (see SKILL.md
// for the NODE_PATH incantation - this repo has no local playwright-core).
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// This repo has no local playwright-core; ESM ignores NODE_PATH, so resolve
// the globally-installed `playwright` package explicitly (see SKILL.md).
const globalRoot = execSync('npm root -g').toString().trim();
const { chromium } = await import(pathToFileURL(path.join(globalRoot, 'playwright', 'index.mjs')).href);

/**
 * Split "<selector> <value>" where the selector may contain spaces if it is
 * double-quoted: `fill "input[placeholder=\"Card #\"]" 22`.
 * Inner quotes must be backslash-escaped (the escapes are stripped here), so
 * the scan cannot stop at the first `"` it sees. A single-quoted CSS attribute
 * value needs no escaping at all and is the easier form to type through tmux:
 * `fill "input[placeholder='Card #']" 22`.
 * Without quotes the first whitespace run separates selector from value.
 */
function splitArgs(args) {
  const s = String(args ?? '').trim();
  if (s.startsWith('"')) {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) { out += s[++i]; continue; }
      if (s[i] === '"') return [out, s.slice(i + 1).trim()];
      out += s[i];
    }
    // unterminated quote - fall through to whitespace splitting
  }
  const i = s.search(/\s/);
  return i === -1 ? [s, ''] : [s.slice(0, i), s.slice(i + 1).trim()];
}

const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const BASE_URL = process.env.APP_URL || 'http://localhost:5999';

let browser = null;
let page = null;

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    page = await (await browser.newContext()).newPage();
    console.log('launched.');
  },

  async nav(url) {
    if (!page) return console.log('ERROR: launch first');
    await page.goto(url ? new URL(url, BASE_URL).toString() : BASE_URL, { waitUntil: 'load' });
    console.log('nav ->', page.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: true });
    console.log('screenshot:', f);
  },

  async 'screenshot-element'(args) {
    if (!page) return console.log('ERROR: launch first');
    const [sel, name] = splitArgs(args);
    const f = path.join(SHOT_DIR, (name || `ss-el-${Date.now()}`) + '.png');
    const el = await page.$(sel);
    if (!el) return console.log('NOT_FOUND:', sel);
    await el.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.click(sel, { timeout: 5000 }); console.log('click', sel, '-> OK'); }
    catch (e) { console.log('click', sel, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try {
      await page.getByText(text, { exact: false }).first().click({ timeout: 5000 });
      console.log('click-text', JSON.stringify(text), '-> OK');
    } catch (e) { console.log('click-text', JSON.stringify(text), '-> ERROR:', e.message.split('\n')[0]); }
  },

  async fill(args) {
    if (!page) return console.log('ERROR: launch first');
    const [sel, value] = splitArgs(args);
    try { await page.fill(sel, value, { timeout: 5000 }); console.log('fill', sel, '<-', JSON.stringify(value)); }
    catch (e) { console.log('fill', sel, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async upload(args) {
    if (!page) return console.log('ERROR: launch first');
    const [sel, file] = splitArgs(args);
    try { await page.setInputFiles(sel, file); console.log('upload', sel, '<-', file); }
    catch (e) { console.log('upload', sel, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async type(text) { if (page) await page.keyboard.type(text, { delay: 20 }); },
  async press(key) { if (page) await page.keyboard.press(key); },

  async 'wait-for'(sel) {
    if (!page) return console.log('ERROR: launch first');
    try {
      if (sel.startsWith('text=')) await page.getByText(sel.slice(5)).first().waitFor({ timeout: 10_000 });
      else await page.waitForSelector(sel, { timeout: 10_000 });
      console.log('found:', sel);
    } catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  async console(flag) {
    if (!page) return console.log('ERROR: launch first');
    if (flag === '--errors') {
      console.log(consoleErrors.length ? consoleErrors.join('\n') : '(no console errors captured)');
    } else {
      console.log(consoleLog.slice(-30).join('\n'));
    }
  },

  async quit() { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const consoleLog = [];
const consoleErrors = [];
function wireConsole(p) {
  p.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`;
    consoleLog.push(line);
    if (msg.type() === 'error') consoleErrors.push(line);
  });
  p.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message));
}
const origLaunch = COMMANDS.launch;
COMMANDS.launch = async function () { await origLaunch(); if (page) wireConsole(page); };

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return rl.prompt();
  const sp = trimmed.indexOf(' ');
  const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
  const rest = sp === -1 ? '' : trimmed.slice(sp + 1);
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '- try: help'); return rl.prompt(); }
  try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('card-suite-unified driver - "help" for commands, "launch" to start');
rl.prompt();
