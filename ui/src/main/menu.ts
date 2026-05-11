import { app, Menu, shell, BrowserWindow, MenuItemConstructorOptions } from 'electron';

export function setupApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // { role: 'appMenu' } (macOS ONLY)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // { role: 'fileMenu' } (Windows/Linux & macOS common)
    {
      label: 'File',
      submenu: [
        {
          label: 'New Template',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
             const focusedWindow = BrowserWindow.getFocusedWindow();
             focusedWindow?.webContents.send('menu:file-new');
          }
        },
        {
          label: 'Open Template...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            focusedWindow?.webContents.send('menu:file-open');
          }
        },
        { type: 'separator' },
        {
          label: 'Save Template',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            focusedWindow?.webContents.send('menu:file-save');
          }
        },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close' as const }] : [{ role: 'quit' as const }])
      ]
    },

    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
          { type: 'separator' as const },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' as const },
              { role: 'stopSpeaking' as const }
            ]
          }
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },

    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },

    // { role: 'help' }
    {
      label: 'Help',
      submenu: [
        {
          label: 'About OMG',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            focusedWindow?.webContents.send('menu:show-about');
          }
        },
        {
          label: 'User Documentation',
          click: () => {
             const focusedWindow = BrowserWindow.getFocusedWindow();
             focusedWindow?.webContents.send('menu:show-docs');
          }
        },
        { type: 'separator' },
        {
          label: 'Report Issue / Feedback',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            focusedWindow?.webContents.send('menu:show-feedback');
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: async () => {
             const focusedWindow = BrowserWindow.getFocusedWindow();
             // Manually invoke updater IPC handler natively or send message to UI to show updater.
             // We'll let the UI handle it so it can show spinners/toast notifications.
             focusedWindow?.webContents.send('menu:check-updates');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
