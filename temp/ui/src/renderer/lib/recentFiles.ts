// src/renderer/lib/recentFiles.ts — Persistent recent files via localStorage
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'omg-recent-files-v1';
const MAX_RECENTS = 20;

export interface RecentFile {
  name: string;
  path: string;
  modified: string; // ISO string
  size?: string;
  width?: number;
  height?: number;
  elementCount?: number;
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    return await (window as any).electron.ipcRenderer.invoke('app:get-recents');
  } catch {
    return [];
  }
}

export async function addRecentFile(file: RecentFile): Promise<void> {
  try {
    await (window as any).electron.ipcRenderer.invoke('app:add-recent', file);
  } catch (err) {
    console.error('Failed to add recent file:', err);
  }
}

export async function removeRecentFile(path: string): Promise<void> {
  try {
    await (window as any).electron.ipcRenderer.invoke('app:remove-recent', path);
  } catch (err) {
    console.error('Failed to remove recent file:', err);
  }
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
