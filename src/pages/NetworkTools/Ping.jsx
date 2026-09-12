import { useState, useRef } from 'react';
import { useDbStorage } from '../../hooks/useDbStorage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';
import { pingTarget } from '../../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function Ping() {
  const [target, setTarget] = useState('');
  const [count, setCount] = useState(4);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [continuous, setContinuous] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [history, setHistory] = useDbStorage('ping_history', 'superapp-ping-history', []);
  const continuousRef = useRef(null);

  const addPingResult = (target, res, sum) => {
    setHistory([{ target, results: res, summary: sum, timestamp: new Date().toISOString() }, ...history].slice(0, 50));
  };

  const runPing = async () => {
    if (!target.trim()) return;
    setLoading(true); setError(''); setResults([]); setSummary(null);
    try {
      const data = await pingTarget(target.trim(), count);
      if (data.error) { setError(data.error); setLoading(false); return; }
      const pings = (data.packets || []).map((p, i) => ({
        seq: p.seq || i + 1,
        time: p.time,
        status: p.status || (p.time ? 'Success' : 'Lost'),
        timestamp: new Date().toLocaleTimeString(),
      }));
      if (pings.length === 0 && data.times?.length > 0) {
        data.times.forEach((t, i) => pings.push({ seq: i + 1, time: t, status: 'Success', timestamp: new Date().toLocaleTimeString() }));
      }
      const successful = pings.filter(p => p.status === 'Success');
      const times = successful.map(p => p.time);
      const sum = {
        sent: data.sent || count, received: data.received || successful.length,
        loss: data.loss || ((count - successful.length) / count * 100).toFixed(1) + '%',
        min: data.min != null ? data.min.toFixed(1) : '—',
        max: data.max != null ? data.max.toFixed(1) : '—',
        avg: data.avg != null ? data.avg.toFixed(1) : '—',
        target: data.target || target,
        raw: data.raw || '',
      };
      setResults(pings);
      setSummary(sum);
      addPingResult(target, pings, sum);
    } catch (err) {
      setError(err?.message || 'Ping request failed');
    }
    setLoading(false);
  };

  const startContinuous = async () => {
    if (!target.trim() || continuous) return;
    setContinuous(true); setError(''); setResults([]); setSummary(null);
    const pings = [];
    let seqOffset = 0;
    continuousRef.current = true;
    const runOne = async () => {
      if (!continuousRef.current) return;
      try {
        const data = await pingTarget(target.trim(), 1);
        const pkts = (data.packets || []).map(p => ({
          seq: (p.seq || 1) + seqOffset,
          time: p.time,
          status: p.status || (p.time ? 'Success' : 'Lost'),
          timestamp: new Date().toLocaleTimeString(),
        }));
        if (pkts.length === 0) pkts.push({ seq: seqOffset + 1, time: data.times?.[0] || null, status: data.times?.length > 0 ? 'Success' : 'Lost', timestamp: new Date().toLocaleTimeString() });
        seqOffset += pkts.length;
        pkts.forEach(p => pings.push(p));
        while (pings.length > 50) pings.shift();
        setResults([...pings]);
        const successful = pings.filter(p => p.status === 'Success');
        const times = successful.map(p => p.time);
        setSummary({
          sent: pings.length, received: successful.length,
          loss: ((pings.length - successful.length) / pings.length * 100).toFixed(1) + '%',
          min: times.length ? Math.min(...times).toFixed(1) : '—',
          max: times.length ? Math.max(...times).toFixed(1) : '—',
          avg: times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : '—',
          target,
          raw: data.raw || '',
        });
      } catch {}
      setTimeout(runOne, 1000);
    };
    runOne();
  };

  const stopContinuous = () => {
    continuousRef.current = false;
    setContinuous(false);
  };

  const chartData = results.filter(r => r.time).map(r => ({
    name: `#${r.seq}`, ms: Number(r.time.toFixed(1)),
  }));

  const cardStyle = { padding: 16, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', textAlign: 'center' };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>📶 Ping</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input value={target} onChange={e => setTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !continuous && runPing()}
              placeholder="e.g. 8.8.8.8 or google.com" style={{ width: '100%' }} />
          </div>
          <div style={{ width: 100 }}>
            <input type="number" min={1} max={20} value={count} onChange={e => setCount(Number(e.target.value))}
              disabled={continuous} style={{ width: '100%' }} />
          </div>
              <button className="btn-primary" onClick={runPing} disabled={loading || continuous} style={{ height: 40 }}>
            {loading ? '⏳' : '🚀 Ping'}
          </button>
          <button className={continuous ? 'btn-danger' : 'btn-secondary'}
            onClick={continuous ? stopContinuous : startContinuous}
            style={{ height: 40, background: continuous ? 'var(--danger)' : undefined, color: continuous ? '#fff' : undefined }}>
            {continuous ? '⏹ Stop' : '▶ Continuous'}
          </button>
          <button className="btn-secondary" onClick={() => setShowHistory(!showHistory)} style={{ height: 40 }}>
            📜 History ({history.length})
          </button>
        </div>
      </div>

      {showHistory && history.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recent Pings</h3>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {history.map((h, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: '1px solid var(--border-color)', fontSize: 13, cursor: 'pointer',
              }} onClick={() => { setTarget(h.target); setShowHistory(false); }}>
                <span style={{ fontWeight: 600 }}>{h.target}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {h.summary?.loss || '—'} loss · {h.summary?.avg || '—'} avg
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {new Date(h.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <ErrorMessage message={error} />}
      {loading && <LoadingSpinner text="Pinging..." />}

      {summary && (
        <div className="grid-3" style={{ marginBottom: 24 }}>
          {[
            { label: 'Target', value: summary.target, color: 'var(--text-primary)' },
            { label: 'Packets', value: `${summary.received}/${summary.sent}` },
            { label: 'Loss', value: summary.loss, color: Number(summary.loss) > 0 ? 'var(--danger)' : 'var(--success)' },
            { label: 'Min', value: summary.min !== '—' ? `${summary.min} ms` : '—' },
            { label: 'Avg', value: summary.avg !== '—' ? `${summary.avg} ms` : '—' },
            { label: 'Max', value: summary.max !== '—' ? `${summary.max} ms` : '—' },
          ].map((item, i) => (
            <div key={i} className="card" style={cardStyle}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: item.color || 'var(--text-primary)' }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Latency Chart</h3>
          <ResponsiveContainer width="100%" height={200}>
            {chartData.length > 5 ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip />
                <Line type="monotone" dataKey="ms" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip />
                <Bar dataKey="ms" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {summary?.raw && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>📋 Ping Trace Log</h3>
            <button className="btn-secondary btn-sm" onClick={() => setShowRaw(!showRaw)} style={{ height: 30 }}>
              {showRaw ? 'Hide' : 'Show'} Raw
            </button>
          </div>
          {showRaw && (
            <pre style={{
              background: '#0c0c0c', color: '#c0c0c0', padding: 12, borderRadius: 6,
              fontSize: 12, fontFamily: 'monospace', maxHeight: 300, overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{summary.raw}</pre>
          )}
          <div style={{ marginTop: 8 }}><CopyButton text={summary.raw} label="Copy Raw Output" /></div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>📶 Packet Log</h3>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: '1px solid var(--border-color)', fontSize: 14,
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{r.timestamp}</span>
                <span>seq={r.seq}</span>
                <span style={{ color: r.status === 'Success' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  {r.status === 'Success' ? `${r.time.toFixed(1)} ms` : '✕ Lost'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}><CopyButton text={JSON.stringify(results, null, 2)} /></div>
        </div>
      )}
    </div>
  );
}
