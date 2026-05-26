const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  readDir:  (path)          => ipcRenderer.invoke('read-dir', path),
  readFile: (path)          => ipcRenderer.invoke('read-file', path),
  writeFile:(path, content) => ipcRenderer.invoke('write-file', path, content),
  openFolderDialog: ()              => ipcRenderer.invoke('open-folder-dialog'),
  lspRequest:  (lang, method, params) => ipcRenderer.invoke('lsp:request', lang, method, params),
  lspNotify:   (lang, method, params) => ipcRenderer.send('lsp:notify', lang, method, params),
  onLspNotification: (cb) => ipcRenderer.on('lsp:notification', (_e, data) => cb(data)),
  minimize: ()              => ipcRenderer.invoke('window-minimize'),
  maximize: ()              => ipcRenderer.invoke('window-maximize'),
  close:    ()              => ipcRenderer.invoke('window-close'),
})
