const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  readDir:  (path)          => ipcRenderer.invoke('read-dir', path),
  readFile: (path)          => ipcRenderer.invoke('read-file', path),
  writeFile:(path, content) => ipcRenderer.invoke('write-file', path, content),
  openFolderDialog: ()              => ipcRenderer.invoke('open-folder-dialog'),
  terminalStart:      (cwd) => ipcRenderer.invoke('terminal:start', cwd),
  terminalWrite:      (data) => ipcRenderer.send('terminal:write', data),
  terminalKill:       ()    => ipcRenderer.send('terminal:kill'),
  onTerminalData:     (cb)  => ipcRenderer.on('terminal:data', (_e, d) => cb(d)),
  onTerminalExit:     (cb)  => ipcRenderer.on('terminal:exit', (_e, code) => cb(code)),
  lspRequest:  (lang, method, params) => ipcRenderer.invoke('lsp:request', lang, method, params),
  lspNotify:   (lang, method, params) => ipcRenderer.send('lsp:notify', lang, method, params),
  onLspNotification: (cb) => ipcRenderer.on('lsp:notification', (_e, data) => cb(data)),
  minimize: ()              => ipcRenderer.invoke('window-minimize'),
  maximize: ()              => ipcRenderer.invoke('window-maximize'),
  close:    ()              => ipcRenderer.invoke('window-close'),
})
