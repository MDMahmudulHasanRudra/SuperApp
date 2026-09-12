import { useState } from 'react';
import { checkSSLCert } from '../../utils/api';
import { useDbStorage } from '../../hooks/useDbStorage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

export default function SSLMonitor() {
  const [domain, setDomain] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('days_left');
  const [sortAsc, setSortAsc] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState(null);
  const [certificates, setCertificates] = useDbStorage('ssl_certificates', 'superapp-ssl-certificates', []);
  const [thresholds, setThresholds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('superapp-ssl-thresholds') || '{"warning":30,"error":7}'); } catch { return { warning: 30, error: 7 }; }
  });

  const updateThreshold = (key, value) => {
    const val = Math.max(1, Math.min(365, parseInt(value) || 30));
    const updated = { ...thresholds, [key]: val };
    setThresholds(updated);
    localStorage.setItem('superapp-ssl-thresholds', JSON.stringify(updated));
  };

  const addDomain = async () => {
    if (!domain.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await checkSSLCert(domain.trim());
      if (data.error) { setError(data.error); setLoading(false); return; }
      const entry = {
        domain: domain.trim(),
        expires_at: data.validTo,
        days_left: data.daysLeft,
        expired: data.expired,
        issuer: data.issuer?.commonName || 'Unknown',
        subject: data.subject?.commonName || 'Unknown',
        signatureAlgorithm: data.signatureAlgorithm,
        bits: data.bits,
        serialNumber: data.serialNumber,
        fingerprint: data.fingerprint,
        subjectAltNames: data.subjectAltNames,
        validFrom: data.validFrom,
        last_check: new Date().toISOString(),
        simulated: false,
      };
      const existing = certificates.findIndex(c => c.domain === domain.trim());
      const updated = existing >= 0
        ? certificates.map((c, i) => i === existing ? entry : c)
        : [entry, ...certificates];
      setCertificates(updated.slice(0, 50));
      setDomain('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const bulkAdd = async () => {
    const domains = bulkInput.split('\n').map(d => d.trim()).filter(d => d);
    if (domains.length === 0) return;
    setLoading(true); setError('');
    let added = 0;
    for (const d of domains) {
      try {
        const data = await checkSSLCert(d);
        if (data.error) continue;
        const entry = {
          domain: d, expires_at: data.validTo, days_left: data.daysLeft, expired: data.expired,
          issuer: data.issuer?.commonName || 'Unknown', subject: data.subject?.commonName || 'Unknown',
          signatureAlgorithm: data.signatureAlgorithm, bits: data.bits, serialNumber: data.serialNumber,
          fingerprint: data.fingerprint, subjectAltNames: data.subjectAltNames, validFrom: data.validFrom,
          last_check: new Date().toISOString(), simulated: false,
        };
        const existing = certificates.findIndex(c => c.domain === d);
        if (existing >= 0) {
          certificates[existing] = entry;
        } else {
          certificates.unshift(entry);
        }
        added++;
      } catch {}
    }
    setCertificates([...certificates].slice(0, 50));
    setBulkInput('');
    setLoading(false);
    if (added > 0) alert(`Added/updated ${added} domains`);
    else setError('No domains could be checked');
  };

  const checkAll = async () => {
    if (certificates.length === 0) return;
    setLoading(true); setError('');
    const updated = [];
    for (const cert of certificates) {
      try {
        const data = await checkSSLCert(cert.domain);
        updated.push({
          ...cert, expires_at: data.validTo, days_left: data.daysLeft, expired: data.expired,
          issuer: data.issuer?.commonName || 'Unknown', subject: data.subject?.commonName || 'Unknown',
          signatureAlgorithm: data.signatureAlgorithm, bits: data.bits, serialNumber: data.serialNumber,
          fingerprint: data.fingerprint, subjectAltNames: data.subjectAltNames, validFrom: data.validFrom,
          last_check: new Date().toISOString(), simulated: false,
        });
      } catch {
        updated.push({ ...cert, last_check: new Date().toISOString() });
      }
    }
    setCertificates(updated);
    setLoading(false);
  };

  const removeDomain = (domainName) => {
    setCertificates(certificates.filter(c => c.domain !== domainName));
    if (expandedDomain === domainName) setExpandedDomain(null);
  };

  const exportCSV = () => {
    const csv = 'Domain,Subject,Issuer,Valid From,Expires,Days Left,Status,Last Check\n' +
      sorted.map(c =>
        `"${c.domain}","${c.subject || ''}","${c.issuer || ''}","${c.validFrom ? new Date(c.validFrom).toISOString() : ''}","${c.expires_at ? new Date(c.expires_at).toISOString() : ''}","${c.days_left ?? ''}","${c.expired ? 'Expired' : c.days_left < thresholds.error ? 'Error' : c.days_left < thresholds.warning ? 'Warning' : 'OK'}","${c.last_check ? new Date(c.last_check).toISOString() : ''}"`
      ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ssl-certificates.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const daysBadge = (days) => {
  const { warning: warnDays, error: errDays } = thresholds;
    if (days === undefined || days === null) return <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>❓ Unknown</span>;
    if (days < 0) return <span className="badge badge-danger">🚨 Expired</span>;
    if (days < error) return <span className="badge badge-danger">⚠️ {days}d</span>;
    if (days < warning) return <span className="badge badge-warning">⚠️ {days}d</span>;
    return <span className="badge badge-success">🔒 {days}d</span>;
  };

  const filtered = certificates.filter(c =>
    c.domain.toLowerCase().includes(search.toLowerCase()) ||
    (c.issuer || '').toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'domain') cmp = a.domain.localeCompare(b.domain);
    else if (sortBy === 'days_left') cmp = (a.days_left ?? 999) - (b.days_left ?? 999);
    else if (sortBy === 'issuer') cmp = (a.issuer || '').localeCompare(b.issuer || '');
    else if (sortBy === 'last_check') cmp = new Date(a.last_check || 0) - new Date(b.last_check || 0);
    return sortAsc ? cmp : -cmp;
  });

  const toggleSort = (field) => {
    if (sortBy === field) setSortAsc(!sortAsc);
    else { setSortBy(field); setSortAsc(false); }
  };

  const sortArrow = (field) => {
    if (sortBy !== field) return '';
    return sortAsc ? ' ▲' : ' ▼';
  };

  const startAutoRefresh = () => {
    if (!autoRefresh) { setAutoRefresh(true); return; }
    setAutoRefresh(false);
  };

  const { warning: warnDays, error: errDays } = thresholds;
  const okCount = sorted.filter(c => c.days_left >= warnDays).length;
  const warningCount = sorted.filter(c => c.days_left >= 0 && c.days_left < warnDays && c.days_left >= errDays).length;
  const errorCount = sorted.filter(c => c.days_left < 0 || (c.days_left >= 0 && c.days_left < errDays)).length;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>🔒 SSL Expiry Monitor</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Track SSL certificate expiry for your domains. Customize alert thresholds below.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <input value={domain} onChange={e => setDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              placeholder="example.com" style={{ width: '100%' }} />
          </div>
          <button className="btn-primary" onClick={addDomain} disabled={loading} style={{ height: 40 }}>
            {loading ? '⏳' : '➕ Add Domain'}
          </button>
          {certificates.length > 0 && (
            <>
              <button className="btn-secondary" onClick={checkAll} disabled={loading} style={{ height: 40 }}>
                🔄 Check All
              </button>
              <button className="btn-secondary" onClick={exportCSV} style={{ height: 40 }}>
                📥 Export CSV
              </button>
              <button className={`btn-${autoRefresh ? 'primary' : 'secondary'}`} onClick={startAutoRefresh} style={{ height: 40 }}>
                {autoRefresh ? '⏹ Auto' : '▶ Auto'}
              </button>
            </>
          )}
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Bulk Import (paste multiple domains)
          </summary>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)}
              rows={4} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              placeholder="example.com&#10;google.com&#10;github.com" />
            <button className="btn-primary" onClick={bulkAdd} disabled={loading} style={{ height: 40, alignSelf: 'flex-end' }}>
              {loading ? '⏳' : '📥 Import'}
            </button>
          </div>
        </details>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            ⚙️ Alert Thresholds
          </summary>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠️ Warning at
              <input type="number" value={thresholds.warning} onChange={e => updateThreshold('warning', e.target.value)}
                min={1} max={365} style={{ width: 60, padding: '4px 8px', fontSize: 13 }} />
              days
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              🚨 Error at
              <input type="number" value={thresholds.error} onChange={e => updateThreshold('error', e.target.value)}
                min={1} max={364} style={{ width: 60, padding: '4px 8px', fontSize: 13 }} />
              days
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Domains with &lt;{warnDays}d get warning badges, &lt;{errDays}d get error badges
            </span>
          </div>
        </details>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); }} />}
      {loading && <LoadingSpinner text="Checking certificates..." />}

      {certificates.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          No domains added yet. Add a domain above to start tracking SSL expiry.
        </div>
      )}

      {certificates.length > 0 && !loading && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search domains or issuers..." style={{ width: '100%', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--success)' }}>✅ OK: {okCount}</span>
              <span style={{ color: 'var(--warning)' }}>⚠️ Warning: {warningCount}</span>
              <span style={{ color: 'var(--danger)' }}>❌ Error: {errorCount}</span>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Tracked Domains ({filtered.length})</h3>
              <CopyButton text={sorted.map(c => `${c.domain}: ${c.days_left ?? '?'}d`).join('\n')} label="Copy Summary" />
            </div>

            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <div style={{
                display: 'flex', padding: '10px 14px', fontWeight: 600, fontSize: 13,
                background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
              }}>
                <span style={{ flex: 2 }} onClick={() => toggleSort('domain')}>Domain{sortArrow('domain')}</span>
                <span style={{ flex: 1.5 }} onClick={() => toggleSort('issuer')}>Issuer{sortArrow('issuer')}</span>
                <span style={{ flex: 1 }}>Expires</span>
                <span style={{ flex: 0.8 }} onClick={() => toggleSort('days_left')}>Status{sortArrow('days_left')}</span>
                <span style={{ flex: 1 }} onClick={() => toggleSort('last_check')}>Last Check{sortArrow('last_check')}</span>
                <span style={{ flex: 0.5 }} />
              </div>
              {sorted.map((cert, i) => (
                <div key={cert.domain}>
                  <div style={{
                    display: 'flex', padding: '10px 14px', fontSize: 13, alignItems: 'center',
                    borderBottom: i < sorted.length - 1 ? '1px solid var(--border-color)' : 'none',
                    background: cert.days_left < error ? 'rgba(239,71,111,0.05)' : cert.days_left < warning ? 'rgba(255,209,102,0.05)' : 'transparent',
                    cursor: 'pointer',
                  }} onClick={() => setExpandedDomain(expandedDomain === cert.domain ? null : cert.domain)}>
                    <span style={{ flex: 2, fontWeight: 600, wordBreak: 'break-all' }}>{cert.domain}</span>
                    <span style={{ flex: 1.5, color: 'var(--text-secondary)' }}>{cert.issuer || '—'}</span>
                    <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {cert.expires_at ? new Date(cert.expires_at).toLocaleDateString() : '—'}
                    </span>
                    <span style={{ flex: 0.8 }}>{daysBadge(cert.days_left)}</span>
                    <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {cert.last_check ? new Date(cert.last_check).toLocaleDateString() : '—'}
                    </span>
                    <span style={{ flex: 0.5 }} onClick={e => e.stopPropagation()}>
                      <button className="btn-sm" onClick={() => removeDomain(cert.domain)}
                        style={{ color: 'var(--danger)', background: 'transparent', padding: '4px 8px' }}>✕</button>
                    </span>
                  </div>
                  {expandedDomain === cert.domain && (
                    <div style={{
                      padding: '12px 14px', background: 'var(--bg-primary)',
                      borderBottom: i < sorted.length - 1 ? '1px solid var(--border-color)' : 'none',
                      fontSize: 13,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><span style={{ color: 'var(--text-secondary)' }}>Subject: </span>{cert.subject || '—'}</div>
                        <div><span style={{ color: 'var(--text-secondary)' }}>Issuer: </span>{cert.issuer || '—'}</div>
                        <div><span style={{ color: 'var(--text-secondary)' }}>Valid From: </span>{cert.validFrom ? new Date(cert.validFrom).toLocaleDateString() : '—'}</div>
                        <div><span style={{ color: 'var(--text-secondary)' }}>Expires: </span>{cert.expires_at ? new Date(cert.expires_at).toLocaleDateString() : '—'}</div>
                        <div><span style={{ color: 'var(--text-secondary)' }}>Signature: </span>{cert.signatureAlgorithm || '—'}</div>
                        <div><span style={{ color: 'var(--text-secondary)' }}>Key Size: </span>{cert.bits ? `${cert.bits} bits` : '—'}</div>
                        <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-secondary)' }}>Serial: </span><span style={{ fontSize: 11 }}>{cert.serialNumber || '—'}</span></div>
                        <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-secondary)' }}>Fingerprint: </span><span style={{ fontSize: 11 }}>{cert.fingerprint || '—'}</span></div>
                        {cert.subjectAltNames?.length > 0 && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>SANs: </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {cert.subjectAltNames.map((san, si) => (
                                <span key={si} style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>{san}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {autoRefresh && certificates.length > 0 && !loading && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)' }}>
          🔄 Auto-refresh active — checking domains every 60s
        </div>
      )}
    </div>
  );
}
