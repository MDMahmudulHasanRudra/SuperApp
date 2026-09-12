import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout/Layout';
import DataProcessor from './pages/DataProcessor/DataProcessor';
import FillFromSample from './pages/DataProcessor/FillFromSample';
import SmartFill from './pages/DataProcessor/SmartFill';
import NetworkTools from './pages/NetworkTools';
import Utilities from './pages/Utilities';

function Home() {
  return (
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>⚡ SuperApp</h1>
      <p style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 600, margin: '0 auto 32px' }}>
        All-in-One React Utility Suite — Document Processing, Network Diagnostics & Developer Utilities
      </p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { path: '/data-processor', label: '📄 Data Processor', desc: 'Extract & validate document data' },
          { path: '/data-processor/fill-from-sample', label: '📋 Fill from Sample', desc: 'Map & fill data from Excel/CSV using a demo template' },
          { path: '/data-processor/smart-fill', label: '🔧 Smart Fill', desc: 'Template-preserving fill with column config (auto/demo/empty)' },
          { path: '/network-tools', label: '🌐 Network Tools', desc: 'Ping, DNS, WHOIS, Port Scan & more' },
          { path: '/utilities', label: '🧰 Utilities', desc: 'Base64, UUID, QR, Hasher, JSON & Color' },
        ].map(item => (
          <Link key={item.path} to={item.path} style={{
            textDecoration: 'none', color: 'inherit',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)', padding: '24px 32px', width: 280,
            boxShadow: 'var(--shadow)', transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
          >
            <p style={{ fontSize: 36, marginBottom: 12 }}>{item.icon}</p>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{item.label}</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/data-processor" element={<DataProcessor />} />
            <Route path="/data-processor/fill-from-sample" element={<FillFromSample />} />
            <Route path="/data-processor/smart-fill" element={<SmartFill />} />
            <Route path="/network-tools/*" element={<NetworkTools />} />
            <Route path="/utilities/*" element={<Utilities />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
