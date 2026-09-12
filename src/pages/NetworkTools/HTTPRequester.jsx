import { useState } from 'react';
import { sendHTTPRequest } from '../../utils/api';
import { useDbStorage } from '../../hooks/useDbStorage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export default function HTTPRequester() {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState([{ key: '', value: '' }]);
  const [bodyType, setBodyType] = useState('raw');
  const [body, setBody] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collections, setCollections] = useDbStorage('api_collections', 'superapp-api-collections', []);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [collectionName, setCollectionName] = useState('');

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
  const removeHeader = (i) => setHeaders(headers.filter((_, idx) => idx !== i));
  const updateHeader = (i, field, val) => {
    const h = [...headers];
    h[i][field] = val;
    setHeaders(h);
  };

  const send = async () => {
    if (!url.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const headerObj = {};
      headers.forEach(h => { if (h.key.trim()) headerObj[h.key.trim()] = h.value; });
      const data = await sendHTTPRequest({ method, url: url.trim(), headers: headerObj, body: method !== 'GET' ? body : undefined });
      if (data.error) { setError(data.error); return; }
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const saveToCollection = () => {
    const name = prompt('Request name:');
    if (!name) return;
    const headerObj = {};
    headers.forEach(h => { if (h.key.trim()) headerObj[h.key.trim()] = h.value; });
    const request = { id: Date.now().toString(), name, method, url, headers, body, bodyType, createdAt: new Date().toISOString() };

    let updated;
    if (selectedCollection && collectionName) {
      updated = collections.map(c => {
        if (c.name === collectionName) return { ...c, requests: [...(c.requests || []), request] };
        return c;
      });
    } else if (collectionName) {
      const col = { id: Date.now().toString() + 'c', name: collectionName, requests: [request], createdAt: new Date().toISOString() };
      updated = [col, ...collections];
      setSelectedCollection(col.name);
    } else {
      const colName = prompt('Collection name (or leave blank for "Unnamed"):') || 'Unnamed';
      const col = { id: Date.now().toString() + 'c', name: colName, requests: [request], createdAt: new Date().toISOString() };
      updated = [col, ...collections];
      setSelectedCollection(colName);
    }
    setCollections(updated.slice(0, 20));
  };

  const loadRequest = (req) => {
    setMethod(req.method);
    setUrl(req.url);
    setHeaders(req.headers || []);
    setBody(req.body || '');
    setBodyType(req.bodyType || 'raw');
  };

  const deleteRequest = (colName, reqId) => {
    const updated = collections.map(c => {
      if (c.name === colName) return { ...c, requests: (c.requests || []).filter(r => r.id !== reqId) };
      return c;
    }).filter(c => (c.requests || []).length > 0 || c.name === colName);
    setCollections(updated);
  };

  const deleteCollection = (colName) => {
    setCollections(collections.filter(c => c.name !== colName));
    if (selectedCollection === colName) { setSelectedCollection(''); setCollectionName(''); }
  };

  const runCollection = async () => {
    if (!selectedCollection) return;
    const col = collections.find(c => c.name === selectedCollection);
    if (!col?.requests?.length) return;

    setLoading(true); setError('');
    const results = [];
    for (const req of col.requests) {
      try {
        const headerObj = {};
        (req.headers || []).forEach(h => { if (h.key.trim()) headerObj[h.key.trim()] = h.value; });
        const data = await sendHTTPRequest({ method: req.method, url: req.url, headers: headerObj, body: req.method !== 'GET' ? req.body : undefined });
        results.push({ name: req.name, statusCode: data.statusCode, statusMessage: data.statusMessage, timing: data.timing, error: null });
      } catch (err) {
        results.push({ name: req.name, error: err.response?.data?.error || err.message });
      }
    }
    setResult({ collection: true, name: selectedCollection, results });
    setLoading(false);
  };

  const getStatusColor = (code) => {
    if (code >= 200 && code < 300) return 'var(--success)';
    if (code >= 300 && code < 400) return 'var(--warning)';
    if (code >= 400) return 'var(--danger)';
    return 'var(--text-secondary)';
  };

  const inputStyle = { width: '100%', fontFamily: 'monospace', fontSize: 13 };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>🌐 HTTP/HTTPS Request Tester</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={method} onChange={e => setMethod(e.target.value)}
            style={{ width: 110, ...inputStyle }}>
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div style={{ flex: 1, minWidth: 250 }}>
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="https://api.example.com/endpoint" style={{ width: '100%' }} />
          </div>
          <button className="btn-primary" onClick={send} disabled={loading} style={{ height: 40 }}>
            {loading ? '⏳' : '🚀 Send'}
          </button>
          <button className="btn-secondary" onClick={saveToCollection} style={{ height: 40 }}>💾 Save to Collection</button>
        </div>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Headers ({headers.filter(h => h.key).length})</summary>
          {headers.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input value={h.key} onChange={e => updateHeader(i, 'key', e.target.value)}
                placeholder="Header name" style={{ flex: 1, fontSize: 13 }} />
              <input value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)}
                placeholder="Value" style={{ flex: 2, fontSize: 13 }} />
              <button className="btn-secondary btn-sm" onClick={() => removeHeader(i)} style={{ color: 'var(--danger)' }}>✕</button>
            </div>
          ))}
          <button className="btn-secondary btn-sm" onClick={addHeader}>+ Add Header</button>
        </details>

        {method !== 'GET' && method !== 'HEAD' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {['raw', 'json', 'form'].map(t => (
                <button key={t} className={bodyType === t ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setBodyType(t)}>
                  {t === 'raw' ? 'Raw Text' : t === 'json' ? 'JSON' : 'Form Data'}
                </button>
              ))}
            </div>
            {bodyType === 'form' ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Send JSON or raw text body instead</div>
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)}
                placeholder={bodyType === 'json' ? '{"key": "value"}' : 'Raw request body...'}
                rows={4} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} />
            )}
          </div>
        )}
      </div>

      {collections.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>📚 API Collections ({collections.length})</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={selectedCollection} onChange={e => { setSelectedCollection(e.target.value); setCollectionName(e.target.value); }}
                style={{ fontSize: 13, padding: '6px 10px' }}>
                <option value="">Select collection...</option>
                {collections.map(c => (
                  <option key={c.id || c.name} value={c.name}>{c.name} ({(c.requests || []).length})</option>
                ))}
              </select>
              <button className="btn-secondary btn-sm" onClick={runCollection} disabled={!selectedCollection || loading}
                style={{ padding: '6px 12px' }}>▶ Run All</button>
            </div>
          </div>

          {selectedCollection && (() => {
            const col = collections.find(c => c.name === selectedCollection);
            if (!col) return null;
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{col.name} · {(col.requests || []).length} requests</span>
                  <button className="btn-sm" onClick={() => deleteCollection(col.name)}
                    style={{ background: 'transparent', color: 'var(--danger)', padding: '2px 8px', fontSize: 11 }}>Delete Collection</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(col.requests || []).map((req, ri) => (
                    <div key={req.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 10px', borderRadius: 'var(--radius)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontSize: 12,
                    }}>
                      <span className="badge" style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px' }}>{req.method}</span>
                      <span style={{ fontWeight: 600 }}>{req.name}</span>
                      <button className="btn-sm" onClick={() => loadRequest(req)}
                        style={{ padding: '2px 6px', background: 'var(--accent)', color: '#fff', borderRadius: 4, fontSize: 10 }}>Load</button>
                      <button className="btn-sm" onClick={() => deleteRequest(col.name, req.id)}
                        style={{ padding: '2px 6px', background: 'transparent', color: 'var(--danger)', borderRadius: 4, fontSize: 10 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {error && <ErrorMessage message={error} />}
      {loading && <LoadingSpinner text="Sending request..." />}

      {result && !loading && (
        <>
          {result.collection ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                📚 Collection: {result.name} ({result.results?.length || 0} requests)
              </h3>
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div style={{
                  display: 'flex', padding: '10px 14px', fontWeight: 600, fontSize: 13,
                  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)',
                }}>
                  <span style={{ flex: 2 }}>Request</span>
                  <span style={{ flex: 1 }}>Status</span>
                  <span style={{ flex: 1 }}>Timing</span>
                </div>
                {result.results.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', padding: '8px 14px', fontSize: 13, alignItems: 'center',
                    borderBottom: i < result.results.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}>
                    <span style={{ flex: 2, fontWeight: 600 }}>{r.name}</span>
                    <span style={{ flex: 1 }}>
                      {r.error ? (
                        <span className="badge badge-danger">{r.error}</span>
                      ) : (
                        <span style={{
                          padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: getStatusColor(r.statusCode) + '22',
                          color: getStatusColor(r.statusCode),
                        }}>{r.statusCode}</span>
                      )}
                    </span>
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                      {r.timing?.total ? `${r.timing.total}ms` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}><CopyButton text={JSON.stringify(result.results, null, 2)} /></div>
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span className="badge" style={{ background: 'var(--bg-secondary)', marginRight: 8 }}>{result.method}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{result.url}</span>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                    background: getStatusColor(result.statusCode) + '22',
                    color: getStatusColor(result.statusCode),
                    whiteSpace: 'nowrap',
                  }}>
                    {result.statusCode} {result.statusMessage}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>⏱ {result.timing?.total || result.timing?.ttfb || 0}ms total</span>
                  <span>🔗 {result.timing?.connect || 0}ms connect</span>
                </div>
              </div>

              {result.headers && Object.keys(result.headers).length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                    Response Headers ({Object.keys(result.headers).length})
                  </h4>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', maxHeight: 300, overflowY: 'auto' }}>
                    {Object.entries(result.headers).map(([key, val]) => (
                      <div key={key} style={{
                        padding: '6px 14px', display: 'flex',
                        borderBottom: '1px solid var(--border-color)', fontSize: 13,
                        wordBreak: 'break-all',
                      }}>
                        <span style={{ fontWeight: 600, minWidth: 200, color: 'var(--accent)' }}>{key}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.body && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                    Response Body ({result.body.length} chars)
                  </h4>
                  <pre style={{
                    background: 'var(--bg-secondary)', padding: 12, borderRadius: 8,
                    fontSize: 12, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all', border: '1px solid var(--border-color)',
                  }}>{result.body}</pre>
                </div>
              )}

              <CopyButton text={JSON.stringify(result, null, 2)} />
            </>
          )}
        </>
      )}
    </div>
  );
}
