// src/renderer/components/auth/AuthScreen.tsx — First-Time Activation Gate
// ═══════════════════════════════════════════════════════════════════
// Shown on first launch of a fresh PC. After the correct password is
// entered, an activation flag is written to AppData and the screen
// is never shown again on this machine.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useEffect } from 'react';
import { invokeIPC } from '../../hooks/useIPC';
import { AlertCircle } from 'lucide-react';
import omgIcon from '../../../../assets/icons/icon.png';

// ┌──────────────────────────────────────────────────────┐
// │  Change this password for future app versions.       │
// │  It must also match VALID_PASSWORD in ipc.ts.        │
// └──────────────────────────────────────────────────────┘
const ADMIN_PASSWORD = 'OMG2026';

interface AuthScreenProps {
  onActivated: () => void;
}

export default function AuthScreen({ onActivated }: AuthScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Please enter the activation password.');
      return;
    }

    // Frontend validation first
    if (password !== ADMIN_PASSWORD) {
      setError('Incorrect password. Please contact the administrator.');
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }

    // Backend writes the activation flag
    setLoading(true);
    try {
      const result = await invokeIPC('app:activate', { password });
      if (result?.ok) {
        onActivated();
      } else {
        setError(result?.error || 'Activation failed. Please try again.');
        setShake(true);
        setTimeout(() => setShake(false), 600);
      }
    } catch (err: any) {
      setError('System error. Please restart the application.');
      console.error('Activation error:', err);
    } finally {
      setLoading(false);
    }
  }, [password, onActivated]);

  // Handle Enter key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleSubmit]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "var(--font-sans)",
    }}>
      {/* Auth Card */}
      <div style={{
        position: 'relative',
        width: 420, maxWidth: '90vw',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)',
        padding: '48px 40px',
        boxShadow: 'var(--shadow-lg)',
        animation: shake ? 'shake 0.5s ease-in-out' : 'fadeIn 0.4s ease-out',
        textAlign: 'center',
      }}>
        {/* Logo / Brand */}
        <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={omgIcon} alt="OMG Icon" style={{ 
            width: 72, height: 72, 
            borderRadius: '16px', 
            marginBottom: 20, 
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-subtle)'
          }} />
          <h1 style={{
            fontSize: 'var(--text-xl)', fontWeight: 700,
            color: 'var(--text-primary)', margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}>
            Product Activation
          </h1>
          <p style={{
            fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
            margin: 0, lineHeight: 1.5,
          }}>
            Enter the activation password to unlock this application on this computer.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative' }}>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Activation Password"
              autoFocus
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 'var(--text-base)',
                color: 'var(--text-primary)',
                background: 'var(--bg-primary)',
                border: error
                  ? '1.5px solid var(--accent-error)'
                  : '1.5px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
              }}
              onFocus={e => {
                if (!error) {
                  e.target.style.borderColor = 'var(--accent-primary)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(26, 26, 26, 0.1)';
                }
              }}
              onBlur={e => {
                e.target.style.borderColor = error ? 'var(--accent-error)' : 'var(--border-default)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: 'var(--accent-error)',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn--primary"
            style={{
              width: '100%',
              marginTop: 24,
              padding: '14px 0',
              fontWeight: 600,
              fontSize: 'var(--text-base)',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'wait' : 'pointer',
              border: 'none',
            }}
          >
            {loading ? 'Activating…' : 'Activate'}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          marginTop: 32, fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          This is a one-time activation per computer.<br />
          Contact your administrator if you don't have the password.
        </p>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
