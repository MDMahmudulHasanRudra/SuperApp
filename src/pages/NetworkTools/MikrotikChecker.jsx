import { useState } from 'react';
import { mikrotikTest } from '../../utils/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

const PHASES = [
  { key: 'ping', label: 'Ping Reachability', icon: '📶' },
  { key: 'port', label: 'API Port Check', icon: '🔌' },
  { key: 'auth', label: 'Authentication', icon: '🔑' },
  { key: 'info', label: 'System Info', icon: '🖥️' },
];

export default function MikrotikChecker() {
  const [form, setForm] = useState({ host: '', port: '8728', username: 'admin', password: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const testConnection = async () => {
    if (!form.host.trim() || !form.username.trim() || !form.password.trim()) return;
    setLoading(true); setError(''); setResult(null);

    try {
      const data = await mikrotikTest({
        host: form.host.trim(),
        port: parseInt(form.port) || 8728,
        username: form.username.trim(),
        password: form.password,
      });
      setResult(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Connection failed';
      if (err.code === 'ERR_NETWORK' || msg === 'Network Error') {
        setError('Cannot reach the backend server. Make sure the backend is running on port 3001 (cd backend && npm start)');
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  const bytesToGB = (bytes) => {
    const n = parseInt(bytes);
    if (isNaN(n)) return '—';
    return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const formatUptime = (uptime) => {
    if (!uptime) return '—';
    const parts = uptime.match(/(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?/);
    if (!parts) return uptime;
    return uptime;
  };

  const StatCard = ({ label, value }) => (
    <div style={{
      padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '1px solid var(--border-color)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{value || '—'}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>🔐 MikroTik API Checker</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>IP Address / Host</label>
            <input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && !loading && testConnection()}
              placeholder="192.168.88.1" style={{ width: '100%' }} />
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>API Port</label>
            <input value={form.port} onChange={e => setForm({ ...form, port: e.target.value })}
              placeholder="8728" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Username</label>
            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="admin" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Password</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && !loading && testConnection()}
              placeholder="••••••••" style={{ width: '100%' }} />
          </div>
          <button className="btn-primary" onClick={testConnection} disabled={loading}
            style={{ height: 40, alignSelf: 'flex-end' }}>
            {loading ? '⏳ Testing...' : '🚀 Test Connection'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          Tests ping reachability → API port status → RouterOS credentials → system info
        </p>
      </div>

      {error && <ErrorMessage message={error} />}

      {loading && <LoadingSpinner text="Testing MikroTik connection..." />}

      {result && !loading && (
        <>
          {/* Step-by-step diagnostics */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📋 Diagnostic Steps</h3>
            {PHASES.map(phase => {
              const diag = result.diagnostics?.find(d => d.phase === phase.key);
              const isPass = diag?.status === 'pass';
              // A warning (an unanswered ping, say) is not a failure — the check carries on.
              const isWarn = diag?.status === 'warn';
              const isPending = !diag;
              return (
                <div key={phase.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid var(--border-color)', opacity: isPending ? 0.4 : 1,
                }}>
                  <span style={{ fontSize: 18, marginTop: 1 }}>{isPending ? '⏳' : isPass ? '✅' : isWarn ? '⚠️' : '❌'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{phase.icon} {phase.label}</div>
                    {diag && (
                      <>
                        <div style={{ fontSize: 12, color: isPass ? 'var(--success)' : isWarn ? 'var(--warning)' : 'var(--danger)', marginTop: 2 }}>
                          {diag.message}
                        </div>
                        {diag.detail && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {diag.detail}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Success result */}
          {result.success && result.info ? (
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--success)' }}>
                ✅ {result.message}
              </div>

              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>🖥️ System Info</h4>
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <StatCard label="Identity" value={result.info.identity} />
                <StatCard label="RouterOS Version" value={result.info.version} />
                <StatCard label="Board" value={result.info.boardName} />
                <StatCard label="Architecture" value={result.info.architecture} />
                <StatCard label="CPU" value={`${result.info.cpu} (${result.info.cpuCount}x @ ${result.info.cpuFrequency})`} />
                <StatCard label="Memory" value={bytesToGB(result.info.totalMemory)} />
                <StatCard label="Storage" value={bytesToGB(result.info.totalHdd)} />
                <StatCard label="Routerboard" value={result.info.routerboard} />
                <StatCard label="Serial Number" value={result.info.serialNumber} />
                <StatCard label="Firmware" value={result.info.firmware} />
                <StatCard label="Uptime" value={formatUptime(result.info.uptime)} />
                <StatCard label="Date & Time" value={`${result.info.date} ${result.info.clock}`} />
                <StatCard label="Timezone" value={result.info.timezone} />
              </div>

              {result.info.services && (
                <>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>
                    🌐 Service Ports ({result.info.services.length})
                  </h4>
                  <div style={{
                    display: 'flex', gap: 6, marginBottom: 12,
                  }}>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--success)22', color: 'var(--success)', fontWeight: 600 }}>
                      {result.info.services.filter(s => s.enabled).length} Enabled
                    </span>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--danger)22', color: 'var(--danger)', fontWeight: 600 }}>
                      {result.info.services.filter(s => !s.enabled).length} Disabled
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {result.info.services.map((svc, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: svc.enabled ? 'rgba(0,200,100,0.06)' : 'rgba(100,100,100,0.05)',
                        border: '1px solid',
                        borderColor: svc.enabled ? 'var(--success)' : 'var(--border-color)',
                        opacity: svc.enabled ? 1 : 0.55,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{svc.name}</span>
                          <span style={{
                            fontSize: 12, padding: '1px 8px', borderRadius: 8,
                            background: svc.enabled ? 'var(--success)22' : 'var(--danger)22',
                            color: svc.enabled ? 'var(--success)' : 'var(--danger)',
                            fontWeight: 600,
                          }}>
                            {svc.enabled ? 'ENABLED' : 'DISABLED'}
                          </span>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: svc.enabled ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {svc.port}
                        </div>
                        {svc.comment && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{svc.comment}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {result.info.ports && (
                <>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>🔌 Physical Ports ({result.info.ports.physical.length})</h4>
                  <div style={{
                    display: 'flex', gap: 6, marginBottom: 12,
                  }}>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--success)22', color: 'var(--success)', fontWeight: 600 }}>
                      {result.info.ports.enabled} Enabled
                    </span>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--danger)22', color: 'var(--danger)', fontWeight: 600 }}>
                      {result.info.ports.disabled} Disabled
                    </span>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--accent)22', color: 'var(--accent)', fontWeight: 600 }}>
                      {result.info.ports.running} Link Up
                    </span>
                  </div>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    {result.info.ports.physical.map((port, i) => {
                      const isUp = port.running;
                      const isDisabled = !port.enabled;
                      return (
                        <div key={i} style={{
                          padding: '10px 14px',
                          borderBottom: i < result.info.ports.physical.length - 1 ? '1px solid var(--border-color)' : 'none',
                          background: isDisabled ? 'rgba(100,100,100,0.05)' : isUp ? 'rgba(0,200,100,0.03)' : 'rgba(255,100,100,0.04)',
                          opacity: isDisabled ? 0.55 : 1,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontSize: 18 }}>
                              {isDisabled ? '⭕' : isUp ? '🟢' : '🔴'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{port.name}</span>
                            <span style={{
                              fontSize: 11, padding: '1px 8px', borderRadius: 8,
                              background: isDisabled ? 'var(--text-secondary)22' : isUp ? 'var(--success)22' : 'var(--danger)22',
                              color: isDisabled ? 'var(--text-secondary)' : isUp ? 'var(--success)' : 'var(--danger)',
                              fontWeight: 600,
                            }}>
                              {isDisabled ? 'DISABLED' : isUp ? 'LINK-OK' : 'NO-LINK'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: 'var(--text-secondary)', marginLeft: 38 }}>
                            <span>⚡ {port.speed} {port.duplex !== '—' && `· ${port.duplex}`}</span>
                            <span>🔌 {port.poeOut !== '—' ? `PoE: ${port.poeOut}` : 'No PoE'}</span>
                            <span>📶 MTU: {port.mtu}</span>
                            <span>🔗 MAC: {port.mac}</span>
                            {port.sfpType !== '—' && <span>📡 SFP: {port.sfpType}</span>}
                            {port.comment && <span>📝 {port.comment}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {result.info.ports.virtual.length > 0 && (
                    <>
                      <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>
                        🧩 Virtual Interfaces ({result.info.ports.virtual.length})
                      </h4>
                      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        {result.info.ports.virtual.map((iface, i) => (
                          <div key={i} style={{
                            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12,
                            borderBottom: i < result.info.ports.virtual.length - 1 ? '1px solid var(--border-color)' : 'none',
                            background: iface.running ? 'transparent' : 'rgba(255,100,100,0.05)',
                            opacity: iface.disabled ? 0.5 : 1,
                          }}>
                            <span style={{ fontSize: 16 }}>{iface.running ? '🟢' : iface.disabled ? '⭕' : '🔴'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{iface.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {iface.type} · MTU: {iface.mtu} · MAC: {iface.mac}
                              </div>
                            </div>
                            {iface.comment && (
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{iface.comment}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : result.success && !result.info ? (
            <div className="card" style={{ marginBottom: 24 }}>
              <p style={{ color: 'var(--warning)' }}>⚠️ {result.message}</p>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 24, background: 'rgba(255,100,100,0.05)', border: '1px solid var(--danger)' }}>
              <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 15 }}>❌ {result.message}</p>
              {result.details && (
                <div style={{
                  marginTop: 8, padding: '10px 12px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.08)', fontSize: 13, lineHeight: 1.6,
                  color: 'var(--text-primary)',
                }}>
                  {result.details}
                </div>
              )}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 4 }}>
              <CopyButton text={JSON.stringify(result, null, 2)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
