// src/renderer/components/splash/SplashScreen.tsx — 7-8s Loader
import React, { useEffect, useState } from 'react';
import SpiralAnimation from './SpiralAnimation';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const duration = 4000; // 4 seconds
    const interval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      setProgress(Math.min(100, (elapsed / duration) * 100));
      if (elapsed >= duration) {
        clearInterval(timer);
        setFadeOut(true);
        setTimeout(onFinish, 800); // fade-out transition
      }
    }, interval);
    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.8s ease-out',
    }}>
      {/* Animation */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <SpiralAnimation />
      </div>

      {/* Brand + Progress */}
      <div style={{
        position: 'relative', zIndex: 10, textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        <h1 style={{
          fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 48,
          color: 'white', letterSpacing: '-0.02em',
          textShadow: '0 0 60px rgba(255,255,255,0.3)',
        }}>
          OMG
        </h1>
        <p style={{
          fontFamily: "'Poppins', sans-serif", fontWeight: 400, fontSize: 14,
          color: 'rgba(255,255,255,0.9)', letterSpacing: '0.15em', textTransform: 'uppercase',
        }}>
          Professional Label Design Studio
        </p>

        {/* Loading Phase */}
        <span style={{
          fontFamily: "'Poppins', sans-serif", fontSize: 12, fontWeight: 500,
          color: 'rgba(255,255,255,0.85)', letterSpacing: '0.1em', marginTop: 16
        }}>
          {progress < 30 ? 'Initializing engine...' : progress < 60 ? 'Loading components...' : progress < 90 ? 'Preparing workspace...' : 'Ready'}
        </span>
      </div>
    </div>
  );
}
