# Building & Publishing the Posso One installer

This repo (`Cleanpos-pos/Posso-One-Electron`) is the **packaging shell** that
produces the Windows `.exe` installer for Posso One. It does **not** contain the
app's UI.

---

## Mental model — read this first

There are two repos:

| Repo | Role |
|---|---|
| **`Cleanpos-pos/Kiosk`** | The real React + TypeScript + Vite app **and** the Electron main-process source (`electron-src/`). |
| **`Cleanpos-pos/Posso-One-Electron`** (this repo) | The packaging shell: the *compiled* Electron files + electron-builder config. Produces the installer. |

The installed desktop app is essentially a **Chromium window that loads the
Firebase-hosted PWA**. The main process does literally:

```js
win.loadURL('https://kioskflow-iee04.web.app/');
```

**The rule that follows from this:**

- A **UI / React / business-logic change** ships with `npm run build` +
  `firebase deploy --only hosting` from the **Kiosk** repo. No new installer —
  every installed till picks it up on reload.
- You only rebuild **this installer** when you change **Electron main-process
  code** (`electron-src/` in the Kiosk repo): printing, cash drawer, the second
  customer-facing display, window config, or the auto-updater itself.

---

## What lives in this repo

```
main.js            ← compiled from Kiosk/electron-src/main.ts
preload.js         ← compiled from Kiosk/electron-src/preload.ts
windows-utils.js   ← compiled Windows/printer helpers
resources/         ← native print helpers (see below)
license.rtf        ← EULA shown in the installer wizard
icon.png
package.json       ← electron-builder config lives in the "build" block
```

`main.js` / `preload.js` / `windows-utils.js` are **build artifacts copied from
the Kiosk repo** — do not hand-edit them here. Edit the `.ts` source in
`Kiosk/electron-src/`, rebuild, and copy the output over.

### Native resources (`resources/`)

- `PossoPrintHelper.exe` — persistent raw-printing helper.
- `PossoRawPrinter.dll` — raw ESC/POS printing support.

These are `asarUnpack`-ed (see config below) so Windows can exec them from disk —
they cannot live inside the asar archive.

> ⚠️ Both must be present before building, or the installer ships without working
> printing. They are committed to this repo.

---

## Prerequisites

- Node 18+ and npm
- `npm install` in this repo (pulls electron + electron-builder + escpos libs)
- A local clone of the **Kiosk** repo to produce the compiled Electron files
- For publishing: the `gh` CLI authenticated against the `Cleanpos-pos` org

---

## Step 1 — Compile the Electron code (in the Kiosk repo)

```bash
cd <path-to>/Kiosk
npm run build          # = vite build
```

`vite.config.ts` (via `vite-plugin-electron/simple`) compiles:

- `electron-src/main.ts`    → `dist-electron/main.js`     (CommonJS; electron, electron-updater, escpos*, path, net kept external)
- `electron-src/preload.ts` → `dist-electron/preload.js`
- a custom `copyElectronResources` plugin copies `electron-src/resources/*`
  (the print helper `.exe`/`.dll`) → `dist-electron/resources/`

## Step 2 — Copy artifacts into this repo

From `Kiosk/dist-electron/` into this repo's root:

- `main.js`
- `preload.js`
- `windows-utils.js`
- `resources/` (`PossoPrintHelper.exe`, `PossoRawPrinter.dll`)

> The installed app is **asar-packed**, so you cannot hot-swap these files inside
> an already-installed copy — you must rebuild the installer and reinstall.

## Step 3 — Bump the version

Edit `version` in `package.json`. **This is mandatory** — electron-updater
compares this number against the latest GitHub Release to decide whether an
update exists. Forget it and installed tills won't treat the build as an upgrade.

## Step 4 — Build the installer

```bash
npm run build          # = electron-builder
```

Output lands in `dist/` (gitignored):

- `Posso One Setup X.Y.Z.exe`  (~85 MB)
- `Posso One Setup X.Y.Z.exe.blockmap`
- `latest.yml`  (the auto-update manifest)

The build is **unsigned** (no code-signing cert) — Windows SmartScreen warns on
first run. That's expected.

---

## electron-builder config (`package.json` → `"build"`)

```jsonc
{
  "appId": "com.possoone.app",
  "productName": "Posso One",
  "publish": [{ "provider": "github", "owner": "Cleanpos-pos", "repo": "Posso-One-Electron" }],
  "files": ["main.js", "preload.js", "windows-utils.js", "resources/**/*", "license.rtf", "node_modules/**/*"],
  "asarUnpack": ["resources/**/*"],          // native helpers must sit OUTSIDE the asar so Windows can exec them
  "win": { "target": ["nsis"] },
  "nsis": {
    "oneClick": false,                        // full wizard, not silent
    "perMachine": true,                       // installs for all users (needs admin)
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": "always",
    "createStartMenuShortcut": true,
    "shortcutName": "Posso One",
    "license": "license.rtf"
  }
}
```

The only runtime `dependencies` are `electron-updater` and the `escpos*` printing
libs — everything else (the UI) is served from Firebase, not bundled.

---

## Publishing for auto-update

The main process checks for updates **10 s after launch**, then **every 4 hours**.
`autoDownload = false`, so the user clicks **Download** then **Install** from
**Settings → App Settings → "App Version & Updates"** (there's no auto-popup).

To publish a build so tills can auto-update:

```bash
GH_TOKEN=$(gh auth token) npx electron-builder --publish always
```

Then mind these three gotchas — each has silently broken auto-update before:

1. **Un-draft the release.** electron-builder creates the GitHub Release as a
   **DRAFT**. electron-updater fetches *anonymously* and can't see drafts, so:
   ```bash
   gh release edit vX.Y.Z --repo Cleanpos-pos/Posso-One-Electron --draft=false --latest
   ```
2. **This repo must stay PUBLIC.** The app's embedded `app-update.yml` carries no
   token, so it fetches releases anonymously. Private repo → every asset 404s →
   auto-update silently never happens.
3. **Asset names must match `latest.yml`.** The manifest's `url` uses **dashes**
   (`Posso-One-Setup-X.Y.Z.exe`) even though the local file has **spaces**
   (`Posso One Setup X.Y.Z.exe`). The Release must carry, with matching names:
   `latest.yml`, `Posso-One-Setup-X.Y.Z.exe`, and the `.blockmap`.

---

## TL;DR — a main-process change end to end

```
edit Kiosk/electron-src/*.ts
  → npm run build                              (in Kiosk → produces dist-electron/)
  → copy main.js, preload.js, windows-utils.js, resources/ → this repo
  → bump "version" in package.json
  → npm run build                              (here → produces dist/*.exe)
  → GH_TOKEN=$(gh auth token) npx electron-builder --publish always
  → gh release edit vX.Y.Z --repo Cleanpos-pos/Posso-One-Electron --draft=false --latest
```

For a UI-only change: none of the above — just `firebase deploy --only hosting`
from the Kiosk repo.
