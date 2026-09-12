import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDbStorage } from '../../hooks/useDbStorage';
import { pingTarget, checkHTTPHeaders, checkSSLCert } from '../../utils/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

const CHECK_TYPES = [
  { value: 'http', label: 'HTTP', icon: '🌐' },
  { value: 'ping', label: 'Ping', icon: '📶' },
  { value: 'ssl', label: 'SSL', icon: '🔒' },
];

const CMD_QUICK = [
  { cmd: 'ping', label: 'Ping', args: '8.8.8.8', icon: '📶' },
  { cmd: 'tracert', label: 'Tracert', args: 'google.com', icon: '🗺️' },
  { cmd: 'nslookup', label: 'DNS', args: 'google.com', icon: '🔍' },
  { cmd: 'netstat', label: 'Netstat', args: '', icon: '🔌' },
  { cmd: 'ipconfig', label: 'IPConfig', args: '', icon: '🖥️' },
  { cmd: 'arp -a', label: 'ARP', args: '', icon: '📋' },
  { cmd: 'echo', label: 'Echo', args: 'Hello %username%', icon: '🖊️' },
  { cmd: 'type', label: 'Readme', args: 'readme.txt', icon: '📄' },
  { cmd: 'set', label: 'Env Vars', args: '', icon: '📋' },
];

function simulateCheck(target, type) {
  const latency = 10 + Math.random() * 190;
  const up = Math.random() > 0.15;
  return {
    target, type,
    status: up ? 'up' : 'down',
    latency_ms: up ? latency : null,
    checked_at: new Date().toISOString(),
    simulated: true,
  };
}

async function runRealCheck(target, type) {
  try {
    if (type === 'http') {
      const data = await checkHTTPHeaders(target);
      return { target, type, status: data.statusCode < 500 ? 'up' : 'down', latency_ms: data.timing?.total || null, checked_at: new Date().toISOString(), simulated: false };
    }
    if (type === 'ping') {
      const data = await pingTarget(target, 2);
      const up = data.status === 'reachable' || data.received > 0;
      return { target, type, status: up ? 'up' : 'down', latency_ms: data.avg || null, checked_at: new Date().toISOString(), simulated: false };
    }
    if (type === 'ssl') {
      const data = await checkSSLCert(target);
      return { target, type, status: data.expired ? 'down' : 'up', latency_ms: null, checked_at: new Date().toISOString(), simulated: false };
    }
  } catch {
    return { target, type, status: 'down', latency_ms: null, checked_at: new Date().toISOString(), simulated: false };
  }
}

function cmdSimulatePing(host) {
  const ip = host.match(/^\d+\.\d+\.\d+\.\d+$/) ? host : `[${host}]`;
  let out = `\nPinging ${ip} with 32 bytes of data:\n\n`;
  let received = 0; const times = [];
  for (let i = 0; i < 4; i++) {
    const lost = Math.random() > 0.9;
    if (lost) { out += '  Request timed out.\n'; } else {
      const ms = (10 + Math.random() * 90).toFixed(1);
      const ttl = Math.floor(50 + Math.random() * 70);
      out += `  Reply from ${ip}: bytes=32 time=${ms}ms TTL=${ttl}\n`;
      received++; times.push(parseFloat(ms));
    }
  }
  const loss = ((4 - received) / 4 * 100).toFixed(0);
  out += `\n    Packets: Sent = 4, Received = ${received}, Lost = ${4 - received} (${loss}% loss),\n`;
  if (times.length) out += `    Min = ${Math.min(...times).toFixed(1)}ms, Max = ${Math.max(...times).toFixed(1)}ms, Avg = ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms\n`;
  return out;
}

function cmdSimulateTracert(host) {
  const hops = [
    { hop: 1, ip: '192.168.1.1', ms: '1ms', name: 'router.local' },
    { hop: 2, ip: '10.0.0.1', ms: '3ms', name: 'isp-gw-01.isp.net' },
    { hop: 3, ip: '72.14.204.1', ms: '8ms', name: '72.14.204.1' },
    { hop: 4, ip: '74.125.37.165', ms: '12ms', name: '209.85.252.1' },
    { hop: 5, ip: '216.58.194.94', ms: '15ms', name: 'lhr25s41-in-f94.1e100.net' },
    { hop: 6, ip: '142.250.80.46', ms: '16ms', name: 'lhr25s46-in-f14.1e100.net' },
    { hop: 7, ip: '142.250.80.46', ms: '16ms', name: host },
  ];
  let out = `\nTracing route to ${host} [${hops[hops.length - 1].ip}]\n`;
  hops.forEach(h => out += `  ${h.hop}.  ${h.ms}  ${h.ms}  ${h.ms}  ${h.name} [${h.ip}]\n`);
  out += '\n  Trace complete.\n';
  return out;
}

function cmdSimulateNSLookup(host) {
  return `\n  Server:  dns.google\n  Address:  8.8.8.8\n\n  Name:    ${host}\n  Address: ${[8, 8, 8, Math.floor(Math.random() * 254) + 1].join('.')}\n`;
}

function cmdSimulateNetstat() {
  return '\n  Proto  Local Address          Foreign Address        State\n  TCP    192.168.1.100:54321    142.250.80.46:443      ESTABLISHED\n  TCP    192.168.1.100:54322    104.16.132.229:443     ESTABLISHED\n  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING\n  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING\n  UDP    0.0.0.0:5353           *:*\n  UDP    0.0.0.0:1900           *:*\n';
}

function cmdSimulateIPConfig() {
  return '\n  Ethernet adapter Ethernet0:\n     IPv4 Address. . . . . . : 192.168.1.100\n     Subnet Mask . . . . . . : 255.255.255.0\n     Default Gateway . . . . : 192.168.1.1\n\n  Wireless LAN adapter Wi-Fi:\n     IPv4 Address. . . . . . : 192.168.1.101\n     Subnet Mask . . . . . . : 255.255.255.0\n     Default Gateway . . . . : 192.168.1.1\n';
}

function cmdSimulateARP() {
  return '\n  Internet Address      Physical Address      Type\n  192.168.1.1           00-14-22-01-23-45     dynamic\n  192.168.1.102         00-1a-2b-3c-4d-5e     dynamic\n  224.0.0.2             01-00-5e-00-00-02     static\n  239.255.255.250       01-00-5e-7f-ff-fa     static\n';
}

function getSid() {
  let sid = localStorage.getItem('superapp-session-id');
  if (!sid) { sid = crypto.randomUUID(); localStorage.setItem('superapp-session-id', sid); }
  return sid;
}

export default function NetworkDashboard() {
  const [targets, setTargets] = useDbStorage('dashboard_targets', 'superapp-dashboard-targets', []);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newType, setNewType] = useState('http');
  const [isSimulated, setIsSimulated] = useState(false);
  const intervalRef = useRef(null);

  const [cmdTarget, setCmdTarget] = useState('');
  const [cmdOutput, setCmdOutput] = useState('');
  const [cmdRunning, setCmdRunning] = useState('');
  const [cmdScrollLocked, setCmdScrollLocked] = useState(false);
  const cmdOutputRef = useRef(null);

  const cmdAtBottom = useRef(true);

  const cmdScrollToBottom = useCallback(() => {
    if (cmdOutputRef.current) {
      cmdOutputRef.current.scrollTop = cmdOutputRef.current.scrollHeight;
      cmdAtBottom.current = true;
    }
  }, []);

  useEffect(() => {
    if (!cmdScrollLocked && cmdAtBottom.current && cmdOutputRef.current) {
      cmdOutputRef.current.scrollTop = cmdOutputRef.current.scrollHeight;
    }
  }, [cmdOutput, cmdScrollLocked]);

  const addTarget = () => {
    if (!newTarget.trim()) return;
    const t = { id: Date.now().toString(), target: newTarget.trim(), type: newType, addedAt: new Date().toISOString() };
    setTargets([...targets, t]);
    setNewTarget('');
  };

  const removeTarget = (id) => {
    setTargets(targets.filter(t => t.id !== id));
  };

  const runAllChecks = useCallback(async () => {
    if (targets.length === 0) return;
    const results = [];
    for (const t of targets) {
      const result = isSimulated ? simulateCheck(t.target, t.type) : await runRealCheck(t.target, t.type);
      results.push(result);
    }
    setChecks(results);
    try {
      const sid = getSid();
      const rows = results.map(r => ({ target: r.target, type: r.type, status: r.status, latency_ms: r.latency_ms, checked_at: r.checked_at, session_id: sid }));
      await fetch('/api/db/network_checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
    } catch {}
  }, [targets, isSimulated]);

  const startPolling = () => { if (intervalRef.current) return; runAllChecks(); intervalRef.current = setInterval(runAllChecks, 30000); };
  const stopPolling = () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const getStatusBadge = (status) => {
    if (status === 'up') return <span className="badge badge-success">✅ Up</span>;
    if (status === 'down') return <span className="badge badge-danger">❌ Down</span>;
    return <span className="badge badge-warning">⏳ Pending</span>;
  };

  const getTypeIcon = (type) => { const t = CHECK_TYPES.find(c => c.value === type); return t ? t.icon : '🔍'; };

  const runCmd = (cmd, args) => {
    const host = cmdTarget || args;
    setCmdRunning(cmd);
    setCmdOutput('');
    setTimeout(() => {
      let output = '';
      if (cmd === 'ping') output = cmdSimulatePing(host);
      else if (cmd === 'tracert') output = cmdSimulateTracert(host);
      else if (cmd === 'nslookup') output = cmdSimulateNSLookup(host);
      else if (cmd === 'netstat') output = cmdSimulateNetstat();
      else if (cmd === 'ipconfig') output = cmdSimulateIPConfig();
      else if (cmd === 'arp -a') output = cmdSimulateARP();
      setCmdOutput(output);
      setCmdRunning('');
    }, 300 + Math.random() * 500);
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>📊 Network Status Dashboard</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Monitor multiple targets in real time. Checks run every 30s via {isSimulated ? 'simulation' : 'live backend'}.
        {isSimulated && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>⚠️ Simulated mode</span>}
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input value={newTarget} onChange={e => setNewTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTarget()}
              placeholder="example.com or https://..." style={{ width: '100%' }} />
          </div>
          <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width: 100 }}>
            {CHECK_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <button className="btn-primary" onClick={addTarget} style={{ height: 40, whiteSpace: 'nowrap' }}>+ Add Target</button>
          <button className="btn-secondary" onClick={() => setIsSimulated(!isSimulated)} style={{ height: 40 }}>
            {isSimulated ? '🔴 Simulated' : '🟢 Live'}
          </button>
        </div>
        {targets.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={startPolling} style={{ height: 36 }}>▶ Start Monitoring</button>
            <button className="btn-secondary" onClick={stopPolling} style={{ height: 36 }}>⏹ Stop</button>
            <button className="btn-secondary" onClick={runAllChecks} disabled={loading} style={{ height: 36 }}>{loading ? '⏳' : '🔄 Check Now'}</button>
          </div>
        )}
      </div>

      {error && <ErrorMessage message={error} onRetry={runAllChecks} />}

      {targets.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          Add targets above to start monitoring
        </div>
      )}

      {targets.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Monitored Targets ({targets.length})</h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{intervalRef.current ? '🟢 Active' : '⏸ Paused'}</span>
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', padding: '10px 14px', fontWeight: 600, fontSize: 13, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ flex: 0.5 }}>Type</span>
              <span style={{ flex: 2 }}>Target</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Latency</span>
              <span style={{ flex: 1.5 }}>Last Check</span>
              <span style={{ flex: 0.5 }} />
            </div>
            {targets.map(t => {
              const check = checks.find(c => c.target === t.target && c.type === t.type);
              return (
                <div key={t.id} style={{ display: 'flex', padding: '10px 14px', fontSize: 13, alignItems: 'center', borderBottom: '1px solid var(--border-color)', background: check?.status === 'down' ? 'rgba(239,71,111,0.05)' : 'transparent' }}>
                  <span style={{ flex: 0.5, fontSize: 18 }}>{getTypeIcon(t.type)}</span>
                  <span style={{ flex: 2, fontWeight: 600, wordBreak: 'break-all' }}>{t.target}</span>
                  <span style={{ flex: 1 }}>{check ? getStatusBadge(check.status) : <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>—</span>}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{check?.latency_ms ? `${Number(check.latency_ms).toFixed(1)} ms` : '—'}</span>
                  <span style={{ flex: 1.5, color: 'var(--text-secondary)', fontSize: 12 }}>{check?.checked_at ? new Date(check.checked_at).toLocaleTimeString() : '—'}</span>
                  <span style={{ flex: 0.5 }}>{check?.simulated && <span style={{ fontSize: 11, color: 'var(--warning)' }}>SIM</span>}</span>
                  <button className="btn-sm" onClick={() => removeTarget(t.id)} style={{ color: 'var(--danger)', background: 'transparent', padding: '4px 8px' }}>✕</button>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>✅ Up: {checks.filter(c => c.status === 'up').length}</span>
            <span>❌ Down: {checks.filter(c => c.status === 'down').length}</span>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>💻 CMD Quick Diagnostics</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={cmdTarget} onChange={e => setCmdTarget(e.target.value)}
              placeholder="Target (e.g. google.com)" style={{ width: 180, fontSize: 12, padding: '6px 10px' }} />
            <CopyButton text={cmdOutput} label="Copy" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {CMD_QUICK.map((qc, i) => (
            <button key={i} className="btn-secondary btn-sm" disabled={!!cmdRunning} onClick={() => runCmd(qc.cmd, qc.args || cmdTarget)}
              style={{ fontSize: 11, padding: '4px 10px' }}>
              {qc.icon} {qc.label}
            </button>
          ))}
        </div>
        {(cmdRunning || cmdOutput) && (
          <div style={{ position: 'relative' }}>
            <style>{`
              .cmd-dash-scroll::-webkit-scrollbar { width: 6px; }
              .cmd-dash-scroll::-webkit-scrollbar-track { background: #0c0c0c; }
              .cmd-dash-scroll::-webkit-scrollbar-thumb { background: #2d2d44; border-radius: 3px; }
            `}</style>
            <div style={{
              position: 'absolute', right: 8, top: 8, zIndex: 10, display: 'flex', gap: 4,
            }}>
              <button onClick={cmdScrollToBottom}
                style={{ background: 'rgba(45,45,68,0.9)', border: 'none', color: '#c0c0c0', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 10 }}>▼</button>
              <button onClick={() => setCmdScrollLocked(!cmdScrollLocked)}
                title={cmdScrollLocked ? 'Unlock auto-scroll' : 'Lock auto-scroll'}
                style={{
                  background: cmdScrollLocked ? 'rgba(239,71,111,0.3)' : 'rgba(45,45,68,0.9)',
                  border: 'none', color: cmdScrollLocked ? '#ef476f' : '#c0c0c0',
                  borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 10,
                }}>
                {cmdScrollLocked ? '🔒' : '🔓'}
              </button>
            </div>
            <div className="cmd-dash-scroll" ref={cmdOutputRef}
              onScroll={() => { cmdAtBottom.current = cmdOutputRef.current.scrollHeight - cmdOutputRef.current.scrollTop - cmdOutputRef.current.clientHeight < 30; }}
              style={{
                background: '#0c0c0c', color: '#c0c0c0', fontFamily: '"Consolas", "Courier New", monospace',
                fontSize: 12, lineHeight: 1.6, padding: '12px 16px', borderRadius: 8,
                maxHeight: 250, overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
              {cmdRunning && <div style={{ color: '#e6db74' }}>{cmdRunning} {cmdTarget}... <span style={{ color: '#888' }}>▌</span></div>}
              {cmdOutput && <div>{cmdOutput}</div>}
            </div>
          </div>
        )}
        {!cmdRunning && !cmdOutput && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>
            Click a quick command button above or type a target to run diagnostics on a specific host.
          </div>
        )}
      </div>
    </div>
  );
}
