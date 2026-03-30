// src/main/python-bridge.ts — JSON-RPC Bridge to Python Engine
// ═══════════════════════════════════════════════════════════════════
// Spawns Python subprocess, communicates via stdin/stdout JSON-RPC.
// Each request is a newline-delimited JSON object; Python responds
// with a JSON object on stdout.
// ═══════════════════════════════════════════════════════════════════

import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import path from 'path';

let py: ChildProcess | null = null;
let buffer = '';
const pending = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}>();

const TIMEOUT_MS = 30_000;
let lastStderr = '';

/**
 * Start the Python JSON-RPC subprocess.
 */
export function startPythonBridge(engineDir: string): void {
  const isPackaged = app.isPackaged;
  let command = '';
  let args: string[] = [];
  let cwd = engineDir;

  if (isPackaged) {
    if (process.platform === 'win32') {
      command = path.join(engineDir, 'omg_engine.exe');
      cwd = engineDir;
    } else {
      // Standalone Binary (macOS/Linux)
      command = path.join(engineDir, 'omg_engine');
      cwd = engineDir;
      
      // Ensure binary is executable
      const fs = require('fs');
      try {
        fs.chmodSync(command, 0o755);
      } catch (err) {
        console.error('Failed to set executable bit on engine binary:', err);
      }
    }
  } else {
    // Development mode — prefer project .venv Python which has all deps
    const projectRoot = path.dirname(engineDir);
    const venvPython = process.platform === 'win32'
      ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(projectRoot, '.venv', 'bin', 'python3');
    
    // Check if .venv exists; fall back to system Python
    const fs = require('fs');
    command = fs.existsSync(venvPython)
      ? venvPython
      : (process.platform === 'win32' ? 'python' : 'python3');
    args = ['-m', 'omg.rpc_server'];
    cwd = projectRoot;
  }

  console.log(`Starting Python bridge: ${command} ${args.join(' ')} in ${cwd}`);
  
  try {
    py = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
  } catch (err: any) {
    console.error('Failed to spawn Python process:', err);
    lastStderr = `Spawn Error: ${err.message}`;
    return;
  }

  py.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const entry = pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          pending.delete(msg.id);
          if (msg.error) {
            entry.reject(new Error(msg.error));
          } else {
            entry.resolve(msg.result);
          }
        }
      } catch (err) {
        console.error('Python bridge parse error:', line, err);
      }
    }
  });

  py.stderr!.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    console.error('[Python]', text.trim());
    lastStderr = (lastStderr + text).slice(-2000); // Keep last 2KB
  });

  py.on('error', (err) => {
    console.error('Python process error:', err);
    lastStderr = `Process Error: ${err.message}`;
  });

  py.on('exit', (code) => {
    console.log(`Python process exited with code ${code}`);
    // Reject all pending calls
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`Engine exited (code ${code}). Output: ${lastStderr}`));
    }
    pending.clear();
    py = null;
  });
}

/**
 * Call a Python method via JSON-RPC.
 */
export function callPython(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!py || !py.stdin) {
      reject(new Error('Python bridge not started'));
      return;
    }

    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`IPC timeout: ${method}`));
    }, TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    py.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

/**
 * Stop the Python subprocess gracefully.
 */
export function stopPythonBridge(): void {
  if (py) {
    try {
      py.stdin?.end();
      py.kill('SIGTERM');
    } catch {
      // Ignore
    }
    py = null;
  }
  // Clear pending
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
  }
  pending.clear();
}

/**
 * Check if the Python bridge is running.
 */
export function isPythonReady(): boolean {
  return py !== null && !py.killed;
}

/**
 * Get the current error/status message.
 */
export function getPythonStatus(): string {
  if (py === null) {
    if (lastStderr) return lastStderr;
    return 'Engine process not found';
  }
  if (py.killed) return 'Engine process terminated';
  return 'Ready';
}
