const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lab', {
  status:    () => ipcRenderer.invoke('status'),
  dbstats:   () => ipcRenderer.invoke('dbstats'),
  book:      () => ipcRenderer.invoke('book'),
  series:    (min) => ipcRenderer.invoke('series', min),
  start:     () => ipcRenderer.invoke('start'),
  stop:      () => ipcRenderer.invoke('stop'),
  analysis:  (method, opts) => ipcRenderer.invoke('analysis', method, opts),
  logtail:   () => ipcRenderer.invoke('logtail'),
  listlogs:  () => ipcRenderer.invoke('listlogs'),
  openlog:   () => ipcRenderer.invoke('openlog'),
  repo:      () => ipcRenderer.invoke('repo'),
});

contextBridge.exposeInMainWorld('win', {
  min:      () => ipcRenderer.send('win-min'),
  max:      () => ipcRenderer.send('win-max'),
  close:    () => ipcRenderer.send('win-close'),
  isMax:    () => ipcRenderer.invoke('win-is-max'),
  onState:  (cb) => ipcRenderer.on('win-state', (_e, v) => cb(v)),
});
