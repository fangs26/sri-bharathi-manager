'use strict';

const { app, BrowserWindow, ipcMain, dialog, session, shell, safeStorage } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const DEV_URL = process.env.SBH_DEV_URL || '';
const isDev = !!DEV_URL;

let mainWindow = null;

/* ------------------------------------------------------------------ paths */

function userDir() {
  return app.getPath('userData');
}
function dataFile() {
  return path.join(userDir(), 'sbh-data.json');
}
function configFile() {
  return path.join(userDir(), 'sbh-config.json');
}
function secretFile() {
  return path.join(userDir(), 'sbh-secret.bin');
}
function backupDir() {
  return path.join(userDir(), 'backups');
}

async function ensureDirs() {
  await fsp.mkdir(backupDir(), { recursive: true });
}

/* --------------------------------------------------- atomic json file i/o */

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    // Corrupt file: keep a copy so nothing is silently destroyed.
    try {
      await fsp.copyFile(file, `${file}.corrupt-${Date.now()}`);
    } catch {}
    return fallback;
  }
}

// Write to a temp file then rename, so a crash mid-write can never leave a
// half-written ledger behind.
async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

// One backup per calendar day, keeping the last 30.
async function rollDailyBackup() {
  try {
    if (!fs.existsSync(dataFile())) return;
    await ensureDirs();
    const stamp = new Date().toISOString().slice(0, 10);
    const target = path.join(backupDir(), `sbh-data-${stamp}.json`);
    if (!fs.existsSync(target)) await fsp.copyFile(dataFile(), target);
    const files = (await fsp.readdir(backupDir())).filter((f) => f.startsWith('sbh-data-')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - 30))) {
      await fsp.unlink(path.join(backupDir(), old)).catch(() => {});
    }
  } catch {}
}

/* -------------------------------------------------------------- ipc: data */

ipcMain.handle('data:read', async () => readJson(dataFile(), null));

ipcMain.handle('data:write', async (_e, payload) => {
  await ensureDirs();
  await writeJsonAtomic(dataFile(), payload);
  await rollDailyBackup();
  return true;
});

ipcMain.handle('config:read', async () => readJson(configFile(), {}));

ipcMain.handle('config:write', async (_e, payload) => {
  await writeJsonAtomic(configFile(), payload);
  return true;
});

/* --------------------------------------------------------------- ipc: PIN */
// The PIN never reaches the UI. It is salted and hashed here, and the record is
// then encrypted by safeStorage with a key Windows holds for this user account,
// so copying the file to another machine gets you nothing.

async function readSecret() {
  try {
    const buf = await fsp.readFile(secretFile());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(buf));
  } catch {
    return null;
  }
}

async function writeSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  await fsp.writeFile(secretFile(), safeStorage.encryptString(JSON.stringify(value)));
  return true;
}

const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');

ipcMain.handle('pin:status', async () => {
  const secret = await readSecret();
  return { set: !!secret?.pin, supported: safeStorage.isEncryptionAvailable() };
});

ipcMain.handle('pin:set', async (_e, pin) => {
  if (!pin) return false;
  const salt = crypto.randomBytes(16).toString('hex');
  return writeSecret({ pin: { salt, hash: hashPin(pin, salt) } });
});

ipcMain.handle('pin:verify', async (_e, pin) => {
  const secret = await readSecret();
  if (!secret?.pin) return true;
  const attempt = Buffer.from(hashPin(pin, secret.pin.salt), 'hex');
  const stored = Buffer.from(secret.pin.hash, 'hex');
  return attempt.length === stored.length && crypto.timingSafeEqual(attempt, stored);
});

ipcMain.handle('pin:clear', async () => {
  await fsp.unlink(secretFile()).catch(() => {});
  return true;
});

/* --------------------------------------------------- ipc: backup export/import */

ipcMain.handle('backup:export', async (_e, payload) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save backup',
    defaultPath: path.join(app.getPath('documents'), `sri-bharathi-backup-${stamp}.sbh`),
    filters: [{ name: 'Sri Bharathi backup', extensions: ['sbh', 'json'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  await fsp.writeFile(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.handle('backup:import', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Open backup file',
    properties: ['openFile'],
    filters: [{ name: 'Sri Bharathi backup', extensions: ['sbh', 'json'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  const data = await readJson(res.filePaths[0], null);
  if (!data) return { ok: false, error: 'That file could not be read.' };
  return { ok: true, data, path: res.filePaths[0] };
});

ipcMain.handle('backup:reveal', async () => {
  await ensureDirs();
  await shell.openPath(backupDir());
  return true;
});

/* --------------------------------------------------------------- ipc: excel */

const { writeWorkbook } = require('./excel.cjs');

// Save to a chosen location, then open it.
ipcMain.handle('excel:save', async (_e, { spec }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save as Excel',
    defaultPath: path.join(app.getPath('documents'), spec.fileName || 'register.xlsx'),
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  try {
    await writeWorkbook(spec, res.filePath);
    await shell.openPath(res.filePath);
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: describeWriteError(err) };
  }
});

ipcMain.handle('excel:chooseFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Where should the Excel copy be kept?',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: app.getPath('documents'),
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  return { ok: true, folder: res.filePaths[0] };
});

// The automatic copy: same workbook, fixed name, no dialog, never opened.
ipcMain.handle('excel:autoSave', async (_e, { spec, folder }) => {
  if (!folder) return { ok: false, error: 'No folder chosen yet.' };
  const target = path.join(folder, 'Sri Bharathi register.xlsx');
  try {
    // Write beside it and swap in, so a reader never catches a half-written file.
    const tmp = path.join(folder, `.sbh-register-${process.pid}.tmp.xlsx`);
    await writeWorkbook(spec, tmp);
    await fsp.rename(tmp, target);
    return { ok: true, path: target, at: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: describeWriteError(err) };
  }
});

// Excel holds an exclusive lock on an open file; say so in plain words.
function describeWriteError(err) {
  const code = err && err.code;
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return 'The Excel file is open right now. Close it and try again.';
  }
  if (code === 'ENOENT') return 'That folder no longer exists. Choose another one.';
  return (err && err.message) || 'The Excel file could not be written.';
}

/* ------------------------------------------------------------ ipc: printing */

function withPrintWindow(html, fn) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, javascript: false },
    });
    win.webContents.once('did-finish-load', async () => {
      try {
        resolve(await fn(win));
      } catch (err) {
        reject(err);
      } finally {
        setTimeout(() => win.destroy(), 500);
      }
    });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(reject);
  });
}

ipcMain.handle('print:pdf', async (_e, { html, suggestedName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save as PDF',
    defaultPath: path.join(app.getPath('documents'), suggestedName || 'receipt.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  const buf = await withPrintWindow(html, (win) =>
    win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } })
  );
  await fsp.writeFile(res.filePath, buf);
  await shell.openPath(res.filePath);
  return { ok: true, path: res.filePath };
});

ipcMain.handle('print:paper', async (_e, { html }) => {
  await withPrintWindow(
    html,
    (win) =>
      new Promise((resolve) => {
        win.webContents.print({ silent: false, printBackground: true }, (success) => resolve(success));
      })
  );
  return { ok: true };
});

/* ------------------------------------------------------------ ipc: external */

// Only http(s), tel: and mailto: are ever handed to the OS.
ipcMain.handle('shell:open', async (_e, url) => {
  if (typeof url !== 'string') return false;
  if (!/^(https?|tel|mailto):/i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  dataPath: dataFile(),
  backupPath: backupDir(),
  platform: process.platform,
}));

/* -------------------------------------------------------------- the window */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#FCF8F1',
    title: 'Sri Bharathi Manager',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Anything that tries to open a new window goes to the real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await ensureDirs();
    // The shipped app loads nothing from the network and evaluates no remote
    // code. Locked down here rather than in a meta tag so the dev server's
    // hot reload keeps working.
    if (!isDev) {
      session.defaultSession.webRequest.onHeadersReceived((details, done) => {
        done({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data:; font-src 'self'; connect-src 'self' https:; object-src 'none'; " +
                "base-uri 'none'; form-action 'none'",
            ],
          },
        });
      });
    }
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
