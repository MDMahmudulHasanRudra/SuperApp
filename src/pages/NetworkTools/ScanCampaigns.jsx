import { useState } from 'react';
import { discoverSubdomains, scanPorts } from '../../utils/api';
import { useDbStorage } from '../../hooks/useDbStorage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 1433, 1521, 2049, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 9090, 27017];

export default function ScanCampaigns() {
  const [form, setForm] = useState({ domain: '', ports: COMMON_PORTS.join(',') });
  const [campaigns, setCampaigns] = useDbStorage('scan_campaigns', 'superapp-scan-campaigns', []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [resultSearch, setResultSearch] = useState('');
  const [tags, setTags] = useState({});

  const createCampaign = async () => {
    if (!form.domain.trim()) return;
    setLoading(true); setError(''); setProgress('Starting campaign...'); setProgressPct(0);

    const campaign = {
      id: Date.now().toString(),
      target_domain: form.domain.trim(),
      status: 'running',
      created_at: new Date().toISOString(),
      ports: form.ports.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p)),
      results: [],
    };

    setActiveCampaign(campaign);
    setProgress('Discovering subdomains...');
    setProgressPct(5);

    try {
      const subData = await discoverSubdomains(campaign.target_domain);
      const subdomains = subData.subdomains || [];
      setProgressPct(15);

      setProgress(`Found ${subdomains.length} subdomains. Scanning ports...`);

      const allResults = [];
      for (let i = 0; i < subdomains.length; i++) {
        const sub = subdomains[i];
        const pct = 15 + Math.round(((i + 1) / subdomains.length) * 80);
        setProgressPct(Math.min(pct, 95));
        setProgress(`Scanning ${sub.subdomain} (${i + 1}/${subdomains.length})...`);

        let openPorts = [];
        try {
          const ips = sub.ips || [];
          const target = ips[0] || sub.subdomain;
          const portData = await scanPorts(target, campaign.ports);
          openPorts = (portData.results || []).filter(r => r.status === 'open').map(r => r.port);
        } catch {}

        allResults.push({
          subdomain: sub.subdomain,
          ips: sub.ips || [],
          source: sub.source || 'discovered',
          open_ports: openPorts,
        });
      }

      campaign.status = 'completed';
      campaign.results = allResults;
      setProgressPct(100);

      const updated = [campaign, ...campaigns].slice(0, 20);
      setCampaigns(updated);
      setActiveCampaign(campaign);
      setProgress(`Completed — ${allResults.length} subdomains scanned, ${allResults.reduce((s, r) => s + r.open_ports.length, 0)} open ports found`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      campaign.status = 'failed';
      setActiveCampaign(campaign);
      setProgressPct(0);
      setProgress('Campaign failed');
    }
    setLoading(false);
  };

  const loadCampaign = (c) => {
    setActiveCampaign(c);
    setForm({ ...form, domain: c.target_domain });
    setResultSearch('');
  };

  const deleteCampaign = (id) => {
    setCampaigns(campaigns.filter(c => c.id !== id));
    if (activeCampaign?.id === id) setActiveCampaign(null);
  };

  const exportCSV = () => {
    if (!activeCampaign?.results) return;
    const csv = 'Subdomain,IPs,Source,Open Ports,Notes\n' +
      activeCampaign.results.map(r =>
        `"${r.subdomain}","${(r.ips || []).join('; ')}","${r.source || 'discovered'}","${(r.open_ports || []).join('; ')}","${tags[r.subdomain] || ''}"`
      ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${activeCampaign.target_domain}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!activeCampaign?.results) return;
    const blob = new Blob([JSON.stringify({ campaign: activeCampaign, notes: tags }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${activeCampaign.target_domain}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateTag = (subdomain, value) => {
    setTags({ ...tags, [subdomain]: value });
  };

  const results = activeCampaign?.results || [];
  const filteredResults = resultSearch
    ? results.filter(r =>
        r.subdomain.toLowerCase().includes(resultSearch.toLowerCase()) ||
        (r.ips || []).some(ip => ip.includes(resultSearch)) ||
        (r.open_ports || []).some(p => p.toString().includes(resultSearch))
      )
    : results;

  const openPortsTotal = results.reduce((s, r) => s + r.open_ports.length, 0);
  const portCounts = {};
  results.forEach(r => r.open_ports?.forEach(p => { portCounts[p] = (portCounts[p] || 0) + 1; }));
  const topPorts = Object.entries(portCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>🎯 Subdomain & Port Scan Campaigns</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Run multi-step recon: discover subdomains then scan for open ports on each. Results persist to PostgreSQL.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && !loading && createCampaign()}
              placeholder="example.com" style={{ width: '100%' }} />
          </div>
          <button className="btn-primary" onClick={createCampaign} disabled={loading} style={{ height: 40, whiteSpace: 'nowrap' }}>
            {loading ? '⏳ Running...' : '🚀 Start Campaign'}
          </button>
          {results.length > 0 && (
            <>
              <button className="btn-secondary" onClick={exportCSV} style={{ height: 40 }}>📥 Export CSV</button>
              <button className="btn-secondary" onClick={exportJSON} style={{ height: 40 }}>📥 Export JSON</button>
            </>
          )}
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Port list ({form.ports.split(',').length} ports)
          </summary>
          <textarea value={form.ports} onChange={e => setForm({ ...form, ports: e.target.value })}
            rows={3} style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
            placeholder="Comma-separated port numbers" />
        </details>
      </div>

      {loading && (
        <div className="card" style={{ marginBottom: 16 }}>
          <LoadingSpinner text={progress} />
          <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {!loading && progress && (
        <div className="card" style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          ✅ {progress}
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={createCampaign} />}

      {campaigns.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📜 Campaign History</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {campaigns.map((c, i) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 'var(--radius)', background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)', fontSize: 13,
              }}>
                <span style={{ fontWeight: 600 }}>{c.target_domain}</span>
                <span className={`badge ${c.status === 'completed' ? 'badge-success' : c.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                  {c.status === 'completed' ? '✅ Complete' : c.status === 'failed' ? '❌ Failed' : c.status === 'running' ? '⏳ Running' : '⏸ Pending'}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  {c.results?.length || 0} subs · {c.results?.reduce((s, r) => s + r.open_ports.length, 0) || 0} ports
                </span>
                <button className="btn-sm" onClick={() => loadCampaign(c)}
                  style={{ padding: '2px 8px', background: 'var(--accent)', color: '#fff', borderRadius: 4, fontSize: 11 }}>View</button>
                <button className="btn-sm" onClick={() => deleteCampaign(c.id)}
                  style={{ padding: '2px 8px', background: 'transparent', color: 'var(--danger)', borderRadius: 4, fontSize: 11 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          {topPorts.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>📊 Top Open Ports</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {topPorts.map(([port, count]) => (
                  <span key={port} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    Port {port}: <strong>{count}</strong> hosts
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>
                  Results for {activeCampaign.target_domain}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {results.length} subdomains · {openPortsTotal} open ports · {results.filter(r => r.open_ports.length > 0).length} hosts with open ports
                </div>
              </div>
              <input value={resultSearch} onChange={e => setResultSearch(e.target.value)}
                placeholder="🔍 Filter results..." style={{ width: 200, fontSize: 13, padding: '6px 10px' }} />
            </div>

            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <div style={{
                display: 'flex', padding: '10px 14px', fontWeight: 600, fontSize: 13,
                background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)',
              }}>
                <span style={{ flex: 2 }}>Subdomain</span>
                <span style={{ flex: 1.5 }}>IPs</span>
                <span style={{ flex: 1 }}>Open Ports</span>
                <span style={{ flex: 0.5 }}>Source</span>
                <span style={{ flex: 1 }}>Notes</span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {filteredResults.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                    No results match "{resultSearch}"
                  </div>
                ) : (
                  filteredResults.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', padding: '8px 14px', fontSize: 13, alignItems: 'center',
                      borderBottom: i < filteredResults.length - 1 ? '1px solid var(--border-color)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                    }}>
                      <span style={{ flex: 2, fontWeight: 600, wordBreak: 'break-all' }}>{r.subdomain}</span>
                      <span style={{ flex: 1.5, color: 'var(--text-secondary)', fontSize: 12 }}>{(r.ips || []).join(', ') || '—'}</span>
                      <span style={{ flex: 1 }}>
                        {r.open_ports?.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {r.open_ports.map(p => (
                              <span key={p} className="badge badge-success" style={{ fontSize: 11, padding: '2px 6px' }}>{p}</span>
                            ))}
                          </div>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </span>
                      <span style={{ flex: 0.5, fontSize: 11, color: 'var(--text-secondary)' }}>{r.source}</span>
                      <span style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
                        <input value={tags[r.subdomain] || ''} onChange={e => updateTag(r.subdomain, e.target.value)}
                          placeholder="Note..." style={{ width: '90%', fontSize: 11, padding: '2px 6px' }} />
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <CopyButton text={JSON.stringify(activeCampaign.results, null, 2)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
