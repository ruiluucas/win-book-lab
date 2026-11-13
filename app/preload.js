const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lab', {
  status:    () => ipcRenderer.invoke('status'),
  dbstats:   () => ipcRenderer.invoke('dbstats'),
  start:     () => ipcRenderer.invoke('start'),
  stop:      () => ipcRenderer.invoke('stop'),
  analysis:  (method, opts) => ipcRenderer.invoke('analysis', method, opts),
  logtail:   () => ipcRenderer.invoke('logtail'),
  listlogs:  () => ipcRenderer.invoke('listlogs'),
  openlog:   () => ipcRenderer.invoke('openlog'),
  repo:      () => ipcRenderer.invoke('repo'),
});
