'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.user) {
      router.replace('/board');
    }
  }, [state.user, router]);

  if (state.user) {
    return (
      <div className="auth-container">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ maxWidth: 600, textAlign: 'center' }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', boxShadow: '0 8px 30px rgba(79,70,229,0.3)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>

          <h1 style={{
            fontSize: 48, fontWeight: 800, margin: '0 0 12px',
            background: 'linear-gradient(135deg, #fff, #94a3b8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            TaskFlow
          </h1>

          <p style={{ fontSize: 20, color: 'var(--text-secondary)', margin: '0 0 8px', fontWeight: 500 }}>
            Real-Time Task Board
          </p>

          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '0 0 40px', lineHeight: 1.6 }}>
            Collaborate in real-time. Drag tasks across stages. Stay in sync with your team — instantly.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/auth/login')}
              className="btn-primary"
              style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12 }}
            >
              Sign In
            </button>
            <button
              onClick={() => router.push('/auth/register')}
              className="btn-secondary"
              style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12 }}
            >
              Create Account
            </button>
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap' }}>
            {['Drag & Drop', 'Real-Time Sync', 'Conflict Resolution', 'Search & Filter'].map((f) => (
              <span key={f} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)',
              }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 13,
        borderTop: '1px solid var(--glass-border)',
      }}>
        Built for real-time collaboration
      </footer>
    </div>
  );
}
