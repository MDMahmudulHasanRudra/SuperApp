import { useState } from 'react';
import { useDbStorage } from '../../hooks/useDbStorage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';
import { scanPorts } from '../../utils/api';

const SERVICE_DB = {
  20: 'FTP-data', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  69: 'TFTP', 80: 'HTTP', 110: 'POP3', 123: 'NTP', 135: 'RPC', 137: 'NetBIOS',
  139: 'SMB', 143: 'IMAP', 161: 'SNMP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB',
  465: 'SMTPS', 514: 'Syslog', 587: 'SMTP', 636: 'LDAPS', 993: 'IMAPS',
  995: 'POP3S', 1080: 'SOCKS', 1194: 'OpenVPN', 1433: 'MSSQL', 1521: 'Oracle',
  2049: 'NFS', 2082: 'cPanel', 2083: 'cPanel SSL', 3306: 'MySQL', 3389: 'RDP',
  3690: 'SVN', 4333: 'mSQL', 5432: 'PostgreSQL', 5900: 'VNC', 5901: 'VNC',
  5984: 'CouchDB', 6379: 'Redis', 6443: 'HTTPS-Alt', 8080: 'HTTP-Alt',
  8443: 'HTTPS-Alt', 9000: 'SonarQube', 9090: 'HTTP-Alt', 9200: 'Elasticsearch',
  9300: 'Elasticsearch', 11211: 'Memcached', 27017: 'MongoDB', 28017: 'MongoDB',
  50070: 'HDFS', 50075: 'HDFS',
};

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 6379, 8080, 8443, 27017];

export default function PortScanner() {
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState('common');
  const [portRange, setPortRange] = useState('1-1024');
  const [customPorts, setCustomPorts] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [savedScans, setSavedScans] = useDbStorage('port_scans', 'superapp-port-scans', []);
  const [showSaved, setShowSaved] = useState(false);

  const getPortsToScan = () => {
    if (mode === 'common') return [...COMMON_PORTS];
    if (mode === 'range') {
      const [start, end] = portRange.split('-').map(Number);
      const ports = [];
      for (let i = start; i <= Math.min(end || start, 65535); i++) ports.push(i);
      return ports;
    }
    return customPorts.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0 && n <= 65535);
  };

  const scan = async () => {
    if (!target.trim()) return;
    setLoading(true); setError(''); setResults([]); setProgress(5);
    const ports = getPortsToScan();
    if (ports.length > 500) {
      setError(`Scanning ${ports.length} ports may take several minutes. Consider a smaller range.`);
    }
    try {
      const data = await scanPorts(target.trim(), ports);
      const scanResults = (data.results || []).map(r => ({
        port: r.port,
        status: r.status,
        service: SERVICE_DB[r.port] || 'Unknown',
        protocol: 'tcp',
      }));
      setResults(scanResults);
      setProgress(100);
      const open = scanResults.filter(r => r.status === 'open').length;
      const closed = scanResults.filter(r => r.status === 'closed').length;
      const filtered = scanResults.filter(r => r.status === 'filtered').length;
      setSavedScans([{ target: data.target, ports: scanResults, open, closed, filtered, timestamp: new Date().toISOString() }, ...savedScans].slice(0, 20));
    } catch (err) {
      setError(err?.message || 'Port scan request failed');
    }
    setLoading(false);
  };

  const loadSavedScan = (scan) => {
    setTarget(scan.target);
    setResults(scan.ports);
    setShowSaved(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'var(--success)';
      case 'closed': return 'var(--danger)';
      case 'filtered': return 'var(--warning)';
      default: return 'var(--text-secondary)';
    }
  };

  const openCount = results.filter(r => r.status === 'open').length;
  const closedCount = results.filter(r => r.status === 'closed').length;
  const filteredCount = results.filter(r => r.status === 'filtered').length;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>🔌 Port Scanner</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input value={target} onChange={e => setTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && scan()}
              placeholder="IP or hostname" style={{ width: '100%' }} />
          </div>
          <div>
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="common">Common (20 ports)</option>
              <option value="range">Port Range</option>
              <option value="custom">Custom List</option>
            </select>
          </div>
          {mode === 'range' && (
            <div style={{ width: 140 }}>
              <input value={portRange} onChange={e => setPortRange(e.target.value)} placeholder="1-1024" />
            </div>
          )}
          {mode === 'custom' && (
            <div style={{ flex: 1, minWidth: 200 }}>
              <input value={customPorts} onChange={e => setCustomPorts(e.target.value)}
                placeholder="22,80,443,3389" style={{ width: '100%' }} />
            </div>
          )}
          <button className="btn-primary" onClick={scan} disabled={loading} style={{ height: 40 }}>
            {loading ? `⏳ Scanning ${progress}%` : '🔍 Scan'}
          </button>
          <button className="btn-secondary" onClick={() => setShowSaved(!showSaved)} style={{ height: 40 }}>
            📂 Saved ({savedScans.length})
          </button>
        </div>
      </div>

      {showSaved && savedScans.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Saved Scans</h3>
          {savedScans.map((s, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '6px 0',
              borderBottom: '1px solid var(--border-color)', fontSize: 13, cursor: 'pointer',
            }} onClick={() => loadSavedScan(s)}>
              <span style={{ fontWeight: 600 }}>{s.target}</span>
              <span>{s.open} open · {s.closed} closed{s.filtered != null ? ` · ${s.filtered} filtered` : ''}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{new Date(s.timestamp).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {error && <ErrorMessage message={error} />}

      {loading && (
        <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      )}

      {results.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>
              Results for {target}
            </h3>
            <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
              <span><span style={{ color: 'var(--success)', fontWeight: 600 }}>{openCount}</span> open</span>
              <span><span style={{ color: 'var(--danger)', fontWeight: 600 }}>{closedCount}</span> closed</span>
              <span><span style={{ color: 'var(--warning)', fontWeight: 600 }}>{filteredCount}</span> filtered</span>
            </div>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Port</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Protocol</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Service</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Copy</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.port}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{r.protocol}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{r.service}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                        background: getStatusColor(r.status) + '22',
                        color: getStatusColor(r.status),
                        fontWeight: 600, fontSize: 13, textTransform: 'uppercase',
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <CopyButton text={`${r.port}/${r.protocol}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
