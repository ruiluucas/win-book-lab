const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const lab = require('./lib/lab');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 1000, minWidth: 980, minHeight: 660,
    backgroundColor: '#0b0e14',
    title: 'WIN Book Lab',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

ipcMain.handle('status',    () => lab.getStatus());
ipcMain.handle('dbstats',   () => lab.dbStats());
ipcMain.handle('start',     () => lab.startCollection());
ipcMain.handle('stop',      () => lab.stopCollection());
ipcMain.handle('analysis',  (_e, m, o) => lab.runAnalysis(m, o));
ipcMain.handle('logtail',   () => lab.tailLog());
ipcMain.handle('listlogs',  () => lab.listLogs());
ipcMain.handle('openlog',   () => shell.showItemInFolder(path.join(lab.LOG_DIR, 'coleta_auto.log')));
ipcMain.handle('repo',      () => lab.REPO);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
