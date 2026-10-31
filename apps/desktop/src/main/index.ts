import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, Menu, net, protocol, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { registerIpc } from './ipc';
import { ScanQueue } from './queue';
import { Services } from './services';
import { Updater } from './updater';

// Screenshots are served to the renderer through a private, read-only protocol limited to the scans folder.
protocol.registerSchemesAsPrivileged([{ scheme: 'h88-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | undefined;
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL;

function isTrustedSender(e: IpcMainInvokeEvent) {
  const url = e.senderFrame?.url ?? '';
  return RENDERER_URL ? url.startsWith(RENDERER_URL) : url.startsWith('file://');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'H88CRO',
    // Packaged builds take the icon from the installer; this covers dev runs on Windows/Linux.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build/icon.png'),
    backgroundColor: '#0b0e1a',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // Scanned pages are never loaded here; external links open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (RENDERER_URL && url.startsWith(RENDERER_URL)) return;
    e.preventDefault();
  });
  if (RENDERER_URL) void win.loadURL(RENDERER_URL);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

function buildMenu(navigate: (to: 'new-scan' | 'dashboard' | 'settings' | 'palette') => void) {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New scan', accelerator: 'CmdOrCtrl+N', click: () => navigate('new-scan') },
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+D', click: () => navigate('dashboard') },
        { label: 'Command palette', accelerator: 'CmdOrCtrl+K', click: () => navigate('palette') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => navigate('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'));
  const svc = new Services();
  await svc.init();

  protocol.handle('h88-asset', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const full = normalize(join(svc.scansDir, rel));
    if (u.host !== 'scans' || !full.startsWith(svc.scansDir + sep) || !/\.(png|jpe?g|webp)$/i.test(full)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(full).toString());
  });

  const queue = new ScanQueue(svc, (event, data) => win?.webContents.send(event, data));
  const updater = new Updater((state) => win?.webContents.send('update:status', state));
  svc.update = () => updater.state;
  registerIpc(svc, queue, updater, () => win, isTrustedSender);
  if (await svc.db.getProfile()) {
    queue.setConcurrency((await svc.settings()).concurrency);
    await queue.resume();
  }
  buildMenu((to) => win?.webContents.send('menu:navigate', { to }));
  createWindow();
  updater.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
