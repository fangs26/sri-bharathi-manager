'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The only surface the UI gets. Everything else stays in the main process.
contextBridge.exposeInMainWorld('sbh', {
  isDesktop: true,
  data: {
    read: () => ipcRenderer.invoke('data:read'),
    write: (payload) => ipcRenderer.invoke('data:write', payload),
  },
  config: {
    read: () => ipcRenderer.invoke('config:read'),
    write: (payload) => ipcRenderer.invoke('config:write', payload),
  },
  pin: {
    status: () => ipcRenderer.invoke('pin:status'),
    set: (pin) => ipcRenderer.invoke('pin:set', pin),
    verify: (pin) => ipcRenderer.invoke('pin:verify', pin),
    clear: () => ipcRenderer.invoke('pin:clear'),
  },
  backup: {
    export: (payload) => ipcRenderer.invoke('backup:export', payload),
    import: () => ipcRenderer.invoke('backup:import'),
    reveal: () => ipcRenderer.invoke('backup:reveal'),
  },
  excel: {
    save: (spec) => ipcRenderer.invoke('excel:save', { spec }),
    autoSave: (spec, folder) => ipcRenderer.invoke('excel:autoSave', { spec, folder }),
    chooseFolder: () => ipcRenderer.invoke('excel:chooseFolder'),
  },
  print: {
    pdf: (html, suggestedName) => ipcRenderer.invoke('print:pdf', { html, suggestedName }),
    paper: (html) => ipcRenderer.invoke('print:paper', { html }),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
});
