import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Violations from './pages/Violations';
import LiveFeed from './pages/LiveFeed';
import Accidents from './pages/Accidents';
import Optimization from './pages/Optimization';
import ANPR from './pages/ANPR';
import Settings from './pages/Settings';
import Sidebar from './components/Navbar';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('access_token');
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main
        className="min-h-screen"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {/* Mobile header bar */}
        <div
          className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 lg:hidden border-b"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--text-2)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span
            className="font-display font-bold text-base tracking-tight"
            style={{ color: 'var(--text)' }}
          >
            TrafficIQ
          </span>
        </div>

        <div className="px-5 py-6 md:px-8">
          {children}
        </div>
      </main>

      {/* On mobile, disable margin */}
      <style>{`
        @media (max-width: 1023px) {
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/violations"   element={<ProtectedRoute><Violations /></ProtectedRoute>} />
        <Route path="/live-feed"    element={<ProtectedRoute><LiveFeed /></ProtectedRoute>} />
        <Route path="/accidents"    element={<ProtectedRoute><Accidents /></ProtectedRoute>} />
        <Route path="/optimization" element={<ProtectedRoute><Optimization /></ProtectedRoute>} />
        <Route path="/anpr"         element={<ProtectedRoute><ANPR /></ProtectedRoute>} />
        <Route path="/settings"     element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*"             element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
