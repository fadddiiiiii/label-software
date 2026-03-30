import React from 'react';
import {
  Activity,
  Component,
  HomeIcon,
  Mail,
  Package,
  ScrollText,
  SunMoon,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Settings,
  Printer,
  FileCheck2,
  Search,
  ZoomIn,
  ZoomOut,
  Grid,
} from 'lucide-react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { usePrintStore } from '../../store/print';
import { invokeIPC, saveTemplate, loadTemplate } from '../../hooks/useIPC';
import { Dock, DockIcon, DockItem, DockLabel } from './dock';

export default function AppleStyleDock({ onGoHome }: { onGoHome: () => void }) {
  const { 
    undo, redo, undoStack, redoStack, toDocument, loadTemplate: loadDoc, 
    setFilePath, markClean, filePath, newTemplate, zoom, setZoom,
    toggleGrid, toggleSnap, showGrid, snapToGrid 
  } = useCanvasStoreCompat();
  const { showBatchConsole, setShowBatchConsole } = usePrintStore();

  const handleSave = async () => {
    let path = filePath;
    if (!path) {
      path = await invokeIPC('template:save-dialog');
      if (!path) return;
      setFilePath(path);
    }
    await saveTemplate(path, toDocument());
    markClean();
  };

  const handleOpen = async () => {
    const path = await invokeIPC('template:open-dialog');
    if (!path) return;
    const doc = await loadTemplate(path);
    loadDoc(doc);
    setFilePath(path);
  };

  const data = [
    {
      title: 'Home',
      icon: <HomeIcon className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: onGoHome,
    },
    {
      title: 'New Label',
      icon: <FileCheck2 className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: newTemplate,
    },
    {
      title: 'Open File',
      icon: <FolderOpen className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: handleOpen,
    },
    {
      title: 'Save',
      icon: <Save className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: handleSave,
    },
    {
      title: 'Undo',
      icon: <Undo2 className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: undo,
      disabled: undoStack.length === 0,
    },
    {
      title: 'Redo',
      icon: <Redo2 className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: redo,
      disabled: redoStack.length === 0,
    },
    {
      title: 'Zoom Out',
      icon: <ZoomOut className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: () => setZoom(zoom - 0.25),
    },
    {
      title: `Zoom (${Math.round(zoom * 100)}%)`,
      icon: <Search className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: () => setZoom(1),
    },
    {
      title: 'Zoom In',
      icon: <ZoomIn className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: () => setZoom(zoom + 0.25),
    },
    {
      title: 'Grid / Snap',
      icon: <Grid className={`h-full w-full ${showGrid ? 'text-blue-500' : 'text-neutral-600 dark:text-neutral-300'}`} />,
      action: () => { toggleGrid(); toggleSnap(); },
    },
    {
      title: 'Print Console',
      icon: <Printer className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: () => setShowBatchConsole(!showBatchConsole),
    },
    {
      title: 'Settings',
      icon: <Settings className='h-full w-full text-neutral-600 dark:text-neutral-300' />,
      action: () => document.dispatchEvent(new CustomEvent('open-settings')),
    },
  ];

  return (
    <div className='absolute top-4 left-1/2 max-w-full -translate-x-1/2 z-[9000]'>
      <Dock className='items-start pt-3 bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-2xl'>
        {data.map((item, idx) => (
          <DockItem
            key={idx}
            className={`aspect-square rounded-full flex items-center justify-center transition-all p-2.5 ${
              item.disabled ? 'opacity-40 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
            }`}
            onClick={!item.disabled ? item.action : undefined}
          >
            <DockLabel>{item.title}</DockLabel>
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}
      </Dock>
    </div>
  );
}
