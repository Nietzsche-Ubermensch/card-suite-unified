---
name: run-card-suite-unified
description: Build, run, and drive the card-suite-unified app (Express API on :3999 + Vite/React frontend on :5999). Use when asked to start the app, take a screenshot of it, verify a frontend change actually renders, or interact with its UI.
---

card-suite-unified is a two-process app: an Express API (`server.js`,
port 3999) and a Vite/React frontend (`frontend/`, port 5999) that
proxies `/api`, `/ws`, `/uploads`, `/cropped` to the API. There is no
production build step involved in running it locally — both run in dev
mode. For agent/automated use, drive the frontend via the Playwright
REPL at `.claude/skills/run-card-suite-unified/driver.mjs`.

All paths below are relative to the repo root.

## Prerequisites

Playwright's Chromium is pre-installed in this environment at
`/opt/pw-browsers` (env vars `PLAYWRIGHT_BROWSERS_PATH` /
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` already point at it) and the
`playwright` npm package is installed **globally** (`playwright@1.56.1`
under `npm root -g`) — this repo has no local `playwright`/
`playwright-core` dependency. The driver resolves the global package
itself (see Gotchas), so no extra install is needed. If a fresh
environment lacks the global package: `npm install -g playwright`.

## Build

No build is required to run in dev mode.

```bash
npm install               # repo root (Express deps)
cd frontend && npm install && cd ..   # frontend deps
```

## Run (agent path)

Start both processes in the background, then drive the frontend:

```bash
# from repo root
nohup node server.js > /tmp/server.log 2>&1 &
echo $! > /tmp/server.pid
curl -sf http://localhost:3999/api/health   # poll until this succeeds

cd frontend
nohup npx vite --port 5999 --host > /tmp/vite.log 2>&1 &
echo $! > /tmp/vite.pid
cd ..
timeout 30 bash -c 'until curl -sf http://localhost:5999 >/dev/null; do sleep 1; done'
```

Then run the driver (it resolves the global `playwright` package
itself — no `NODE_PATH` needed):

```bash
node .claude/skills/run-card-suite-unified/driver.mjs
```

Wrap in tmux for interactive/agent use:

```bash
tmux new-session -d -s app -x 200 -y 50
tmux send-keys -t app 'cd /path/to/card-suite-unified && node .claude/skills/run-card-suite-unified/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t app -p | grep -q "driver>"; do sleep 0.2; done'
tmux send-keys -t app 'launch' Enter
timeout 30 bash -c 'until tmux capture-pane -t app -p | grep -q "launched\."; do sleep 0.3; done'
tmux send-keys -t app 'nav' Enter
tmux send-keys -t app 'ss landing' Enter
timeout 15 bash -c 'until tmux capture-pane -t app -p | grep -q "screenshot:"; do sleep 0.3; done'
tmux capture-pane -t app -p
```

Then actually open the screenshot file (default `/tmp/shots/<name>.png`,
override with `SCREENSHOT_DIR`) — don't just check the command
succeeded.

### Commands

| command | what it does |
|---|---|
| `launch` | launch headless Chromium, open a page |
| `nav [url]` | navigate; bare `nav` goes to `http://localhost:5999` (override with `APP_URL`) |
| `ss [name]` | full-page screenshot -> `/tmp/shots/<name>.png` |
| `screenshot-element <sel> [name]` | screenshot one element |
| `click <css-sel>` | click via Playwright's locator |
| `click-text <text>` | click the first element containing this text |
| `fill <css-sel> <text>` | fill a form field (goes through React's input pipeline). Quote a selector that contains spaces, and prefer single quotes *inside* it so nothing needs escaping on the way through `tmux send-keys`: `fill "input[placeholder='Card #']" 22` |
| `upload <css-sel> <path>` | set a file input (e.g. `upload input[type=file] /path/scan.jpg` on the Scan/Batch Cleanup dropzones) |
| `type <text>` / `press <key>` | keyboard input |
| `wait-for <css-sel \| text=...>` | wait up to 10s for an element or text |
| `eval <js>` | evaluate JS in the page, print JSON |
| `text [css-sel]` | print `innerText` (whole body if no selector) |
| `console --errors` | print captured `console.error`/`pageerror` since launch |
| `quit` | close the browser, exit |

## Image pipeline endpoints (local, no API key)

The cleanup path is `lib/pipeline/` (sharp, deterministic). Smoke it with curl —
`image` is bare base64 or a data URL:

```bash
B64=$(base64 -w0 test/fixtures/lola-vice-sideways.jpg)
printf '{"image":"%s","filename":"lola.jpg","strength":0.45}' "$B64" > /tmp/req.json
curl -s -X POST localhost:3999/api/ai/analyze -H 'Content-Type: application/json' --data-binary @/tmp/req.json | jq '{orientation,confidence,artifactTypes}'
curl -s -X POST localhost:3999/api/ai/scan-cleanup -H 'Content-Type: application/json' --data-binary @/tmp/req.json | jq '{success,width,height,cleanedPath,steps:[.steps[].step]}'
curl -s -F images=@test/fixtures/julia-hart-upright.jpg localhost:3999/api/jobs/submit   # then GET /api/jobs/<id>/status
curl -s localhost:3999/api/pipeline/capabilities | jq .
```

Outputs land in `enhanced/` (served at `/enhanced/`, gitignored). A too-small
result is a 422 `MEASUREMENT_VIOLATION` (long edge must be ≥ 1600px).

## Card identification and comps (`lib/cards/`, sports cards only)

Comps are pure local URL building — **no API key, no network, no scraping**.
Only `/api/cards/extract` needs Venice (503 without a key, 422 on a schema
mismatch), and it is the one that reads the two scans with a vision model.

```bash
curl -s localhost:3999/api/cards/parallels | jq '.parallels | length'
curl -s -X POST localhost:3999/api/cards/comps -H 'Content-Type: application/json' \
  -d '{"card":{"playerName":"Aaron Judge","copyrightYear":"2025","manufacturer":"Topps","productSet":"Finest","cardNumber":"51","parallelType":"checkerboard","sport":"baseball"}}' \
  | jq '{recommended: .comps.recommended, queries: [.comps.searches[].query], warnings}'
```

Two rules the code enforces that are easy to undo by accident:

- Comps search the **print run**, not your serial — `/299` finds every sale
  from the run, `190/299` finds only your one copy.
- Every comps URL sets `LH_Sold=1&LH_Complete=1`. Active listings are asking
  prices, not comps.

The UI for all this is **Price Check** (`frontend/src/pages/PriceCheck.tsx`).
Drive it with single-quoted selectors, e.g.
`fill "input[placeholder='Julia Hart']" Julia Hart`; the comps ladder is
debounced, so `wait-for "a[href*=ebay]"` before asserting on it.

## Test

```bash
npm test              # node --test test/*.test.js — real images, ~20s
cd frontend && npm run lint && npx tsc -b
```

## Stopping

```bash
kill "$(cat /tmp/server.pid)" "$(cat /tmp/vite.pid)" 2>/dev/null
# or, if you lost the pids:
lsof -ti:3999 -sTCP:LISTEN | xargs -r kill
lsof -ti:5999 -sTCP:LISTEN | xargs -r kill
```

## Run (human path)

```bash
npm run dev
```

**This is currently broken** — see Gotchas (`concurrently` isn't a
declared dependency). Until that's fixed, start the two processes
separately as shown above (`node server.js` and, in `frontend/`,
`npx vite --port 5999 --host`).

## Gotchas

- **`npm run dev` doesn't work out of the box.** The root `dev` script
  is `concurrently "node server.js" "cd frontend && npx vite --port 5999 --host"`,
  but `concurrently` is not listed in `package.json` dependencies or
  devDependencies and isn't installed. Either `npm install -D
  concurrently`, or just launch the two processes separately (what the
  driver instructions above do).

- **This repo has no local Playwright.** Neither `playwright` nor
  `playwright-core` is a dependency anywhere in the repo, so a plain
  `import { chromium } from 'playwright'` fails with
  `ERR_MODULE_NOT_FOUND`. Also, Node's ESM resolver does **not** honor
  `NODE_PATH` (unlike CommonJS `require`), so setting `NODE_PATH` to the
  global `node_modules` doesn't fix a bare `import`. The driver works
  around this by shelling out to `npm root -g` at startup and importing
  the global package's `index.mjs` via an explicit `pathToFileURL(...)`
  — see the top of `driver.mjs`.

- **`server.js` had a syntax error as of this writing** (fixed in this
  session, commit pending): commit `60fc97e` deleted the
  `app.get('/api/health', (req, res) => {` line while inserting new
  job-queue routes above it, leaving the health-check's response body
  as an orphaned block with no enclosing route handler — the file
  failed to even parse (`SyntaxError: Unexpected token '}'` at the old
  line 192). If you see this again after a `git pull`, check
  `server.js` around the `/api/health` route.

- **`/api/models`, `/api/chat`, `/api/ai/restore` and other Venice-backed routes 500s
  without `VENICE_API_KEY`.** Analyze / Clean / Batch no longer need it — they
  run the local sharp pipeline. This is expected in this environment — no
  key is configured — and the route fails gracefully with
  `{"error":"VENICE_API_KEY not found"}`, not a crash. The "Model
  Catalogue" page will show a permanent "Loading models..." spinner in
  this state. Not a driver bug; don't chase it unless you have a real
  key to set.

- **React controlled inputs**: use the driver's `fill`/`type`, not
  `eval el.value = '...'` — the latter doesn't fire React's `onChange`.

- **Vite's first paint can be slow** (~a few seconds cold). `wait-for`
  the element you need rather than a raw `sleep`.

## Troubleshooting

- **`SyntaxError` on `node server.js`**: see the `/api/health` Gotcha
  above — check nothing else in the file is missing an opening route
  declaration.
- **`ERR_MODULE_NOT_FOUND: playwright`**: you're running a plain `node`
  script that does `import 'playwright'` directly instead of via the
  driver's `pathToFileURL` workaround, or the global package isn't
  installed (`npm ls -g playwright`).
- **`EADDRINUSE` on 3999 or 5999**: a previous run's process is still
  listening. `lsof -ti:3999 -sTCP:LISTEN | xargs -r kill` (same for
  5999), then relaunch.
- **Driver hangs with no `driver>` prompt**: check `node
  .claude/skills/run-card-suite-unified/driver.mjs` isn't erroring on
  the global-playwright resolution (`npm root -g` must return a path
  containing a `playwright` directory).
