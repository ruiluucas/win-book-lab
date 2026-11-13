const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const lab = require('./lib/lab');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 1000, minWidth: 1000, minHeight: 680,
    backgroundColor: '#0b0e14',
    title: 'WIN Book Lab',
    frame: false,               // titlebar propria
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // mantem o estado do botao maximizar sincronizado
  const sendState = () => win.webContents.send('win-state', win.isMaximized());
  win.on('maximize', () => sendState());
  win.on('unmaximize', () => sendState());
  return win;
}

// ---------- IPC ----------
ipcMain.handle('status',   () => lab.getStatus());
ipcMain.handle('dbstats',  () => lab.dbStats());
ipcMain.handle('book',     () => lab.getBook());
ipcMain.handle('candles',  (_e, min, bucket) => lab.getCandles(min, bucket));
ipcMain.handle('start',    () => lab.startCollection());
ipcMain.handle('stop',     () => lab.stopCollection());
ipcMain.handle('analysis', (_e, m, o) => lab.runAnalysis(m, o));
ipcMain.handle('logtail',  () => lab.tailLog());
ipcMain.handle('listlogs', () => lab.listLogs());
ipcMain.handle('openlog',  () => shell.showItemInFolder(path.join(lab.LOG_DIR, 'coleta_auto.log')));
ipcMain.handle('repo',     () => lab.REPO);
  // fonte do dado: local ou VM. Trocar aqui muda DSN, tunel e status.
  ipcMain.handle('config',      () => lab.config.carrega());
  ipcMain.handle('config-set',  (_e, c) => {
    const antes = lab.config.carrega().fonte;
    const novo = lab.config.salva(c);
    if (antes !== novo.fonte) lab.tunel.derruba();   // troca limpa
    return novo;
  });
  ipcMain.handle('fonte',       async () => {
    const f = await lab.fonteAtual();
    return { fonte: f.fonte, dsnOk: !!f.dsn, preparo: f.preparo, motivo: f.motivo || null };
  });

// controles da janela
ipcMain.on('win-min',   () => win && win.minimize());
ipcMain.on('win-max',   () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win-close', () => win && win.close());
ipcMain.handle('win-is-max', () => (win ? win.isMaximized() : false));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
