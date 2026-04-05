// Test script for serial number serialization
import { useDataStore } from './src/renderer/store/data';
import { useTabsStore } from './src/renderer/store/tabs';
import { useCanvasStore } from './src/renderer/store/canvas';

console.log("Setting up stores...");
// Normally zustand stores are used in React but we can interact via getState / setState
// ... wait, the stores rely on DOM / Window (due to persists, ipc, etc.)
