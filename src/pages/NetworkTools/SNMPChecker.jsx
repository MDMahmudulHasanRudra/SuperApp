import { useState } from 'react';
import { snmpCheck, snmpQuery } from '../../utils/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

const OID_NAME_MAP = {
  '1.3.6.1.2.1.1': 'system', '1.3.6.1.2.1.1.1.0': 'sysDescr', '1.3.6.1.2.1.1.2.0': 'sysObjectID',
  '1.3.6.1.2.1.1.3.0': 'sysUpTime', '1.3.6.1.2.1.1.4.0': 'sysContact', '1.3.6.1.2.1.1.5.0': 'sysName',
  '1.3.6.1.2.1.1.6.0': 'sysLocation', '1.3.6.1.2.1.1.7.0': 'sysServices',
  '1.3.6.1.2.1.2': 'interfaces', '1.3.6.1.2.1.2.1.0': 'ifNumber',
  '1.3.6.1.2.1.2.2.1.1': 'ifIndex', '1.3.6.1.2.1.2.2.1.2': 'ifDescr',
  '1.3.6.1.2.1.2.2.1.3': 'ifType', '1.3.6.1.2.1.2.2.1.4': 'ifMTU',
  '1.3.6.1.2.1.2.2.1.5': 'ifSpeed', '1.3.6.1.2.1.2.2.1.6': 'ifPhysAddress',
  '1.3.6.1.2.1.2.2.1.7': 'ifAdminStatus', '1.3.6.1.2.1.2.2.1.8': 'ifOperStatus',
  '1.3.6.1.2.1.2.2.1.10': 'ifInOctets', '1.3.6.1.2.1.2.2.1.16': 'ifOutOctets',
  '1.3.6.1.2.1.4': 'ip', '1.3.6.1.2.1.4.20.1.1': 'ipAdEntAddr',
  '1.3.6.1.2.1.4.20.1.2': 'ipAdEntIfIndex', '1.3.6.1.2.1.4.20.1.3': 'ipAdEntNetMask',
  '1.3.6.1.2.1.4.21.1.1': 'ipForwarding', '1.3.6.1.2.1.4.21.1.2': 'ipDefaultTTL',
  '1.3.6.1.2.1.6': 'tcp', '1.3.6.1.2.1.6.13.1.3': 'tcpConnState',
  '1.3.6.1.2.1.6.13.1.4': 'tcpConnLocalAddress', '1.3.6.1.2.1.6.13.1.5': 'tcpConnLocalPort',
  '1.3.6.1.2.1.6.13.1.6': 'tcpConnRemAddress', '1.3.6.1.2.1.6.13.1.7': 'tcpConnRemPort',
  '1.3.6.1.2.1.7': 'udp', '1.3.6.1.2.1.7.5.1.1': 'udpLocalAddress', '1.3.6.1.2.1.7.5.1.2': 'udpLocalPort',
  '1.3.6.1.2.1.25': 'host', '1.3.6.1.2.1.25.3.2.1.3': 'hrProcessorFrwID',
  '1.3.6.1.2.1.25.2.3.1.4': 'hrStorageSize', '1.3.6.1.2.1.25.2.3.1.5': 'hrStorageUsed',
  '1.3.6.1.2.1.11.1.0': 'snmpInPkts', '1.3.6.1.2.1.11.2.0': 'snmpOutPkts',
  '1.3.6.1.2.1.11.3.0': 'snmpInBadVersions', '1.3.6.1.2.1.11.4.0': 'snmpInBadCommunityNames',
  '1.3.6.1.2.1.11.5.0': 'snmpInBadCommunityUses', '1.3.6.1.2.1.11.30.0': 'snmpEnableAuthTraps',
};

const OID_PRESETS = {
  'System (MIB-II)': {
    '1.3.6.1.2.1.1.1.0': 'sysDescr', '1.3.6.1.2.1.1.2.0': 'sysObjectID',
    '1.3.6.1.2.1.1.3.0': 'sysUpTime', '1.3.6.1.2.1.1.4.0': 'sysContact',
    '1.3.6.1.2.1.1.5.0': 'sysName', '1.3.6.1.2.1.1.6.0': 'sysLocation',
    '1.3.6.1.2.1.1.7.0': 'sysServices',
  },
  'Interfaces (ifTable)': {
    '1.3.6.1.2.1.2.1.0': 'ifNumber', '1.3.6.1.2.1.2.2.1.1': 'ifIndex',
    '1.3.6.1.2.1.2.2.1.2': 'ifDescr', '1.3.6.1.2.1.2.2.1.3': 'ifType',
    '1.3.6.1.2.1.2.2.1.4': 'ifMTU', '1.3.6.1.2.1.2.2.1.5': 'ifSpeed',
    '1.3.6.1.2.1.2.2.1.6': 'ifPhysAddress', '1.3.6.1.2.1.2.2.1.7': 'ifAdminStatus',
    '1.3.6.1.2.1.2.2.1.8': 'ifOperStatus', '1.3.6.1.2.1.2.2.1.10': 'ifInOctets',
    '1.3.6.1.2.1.2.2.1.16': 'ifOutOctets',
  },
  'IP': {
    '1.3.6.1.2.1.4.20.1.1': 'ipAdEntAddr', '1.3.6.1.2.1.4.20.1.3': 'ipAdEntNetMask',
    '1.3.6.1.2.1.4.21.1.1': 'ipForwarding', '1.3.6.1.2.1.4.21.1.2': 'ipDefaultTTL',
  },
  'TCP': {
    '1.3.6.1.2.1.6.13.1.3': 'tcpConnState', '1.3.6.1.2.1.6.13.1.4': 'tcpConnLocalAddr',
    '1.3.6.1.2.1.6.13.1.5': 'tcpConnLocalPort', '1.3.6.1.2.1.6.13.1.6': 'tcpConnRemAddr',
  },
  'UDP': {
    '1.3.6.1.2.1.7.5.1.1': 'udpLocalAddress', '1.3.6.1.2.1.7.5.1.2': 'udpLocalPort',
  },
  'SNMP Stats': {
    '1.3.6.1.2.1.11.1.0': 'snmpInPkts', '1.3.6.1.2.1.11.2.0': 'snmpOutPkts',
    '1.3.6.1.2.1.11.3.0': 'snmpInBadVersions', '1.3.6.1.2.1.11.4.0': 'snmpInBadCommunityNames',
  },
};

const OPERATIONS = [
  { key: 'get', label: 'GET', desc: 'Single OID' },
  { key: 'getnext', label: 'GETNEXT', desc: 'Next OID' },
  { key: 'walk', label: 'WALK', desc: 'Subtree' },
  { key: 'getbulk', label: 'GETBULK', desc: 'Bulk walk (v2c)' },
  { key: 'getmulti', label: 'GETMULTI', desc: 'Multiple OIDs' },
];

const TIMEOUTS = [3000, 5000, 8000, 15000, 30000];

const PHASES = [
  { key: 'ping', label: 'Host Reachability', icon: '🏓' },
  { key: 'snmp', label: 'SNMP Connection', icon: '📡' },
];

function formatUptime(sec) {
  const s = parseInt(sec) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatSpeed(bps) {
  const b = Number(bps) || 0;
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' Gbps';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' Mbps';
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' Kbps';
  return b + ' bps';
}

function getOidName(oid) {
  if (OID_NAME_MAP[oid]) return OID_NAME_MAP[oid];
  const parts = oid.split('.');
  for (let i = parts.length - 1; i > 3; i--) {
    const parent = parts.slice(0, i).join('.');
    if (OID_NAME_MAP[parent]) return OID_NAME_MAP[parent] + '.*';
  }
  return '—';
}

const S = {
  card: { background: 'rgba(13,15,23,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 16 },
  header: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 },
  body: { padding: '16px 20px' },
  input: { padding: '9px 12px', fontSize: 13, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { padding: '9px 12px', fontSize: 13, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  btn: { padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' },
  smallBtn: { padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' },
  tag: (color) => ({ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}30`, letterSpacing: '0.03em' }),
  tab: (active) => ({ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', background: active ? 'linear-gradient(135deg, #4361ee, #7c3aed)' : 'rgba(255,255,255,0.03)', color: active ? '#fff' : 'rgba(255,255,255,0.5)' }),
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  th: { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0' },
};

export default function SNMPChecker() {
  const [tab, setTab] = useState('scan');
  const [form, setForm] = useState({ host: '', community: 'public', port: '161', version: '2c', timeout: '8000' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [queryOid, setQueryOid] = useState('');
  const [queryOp, setQueryOp] = useState('get');
  const [queryResults, setQueryResults] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState([]);
  const [openPresetGroup, setOpenPresetGroup] = useState(null);

  const [ifaceSort, setIfaceSort] = useState({ key: 'index', asc: true });
  const [ifaceFilter, setIfaceFilter] = useState('');

  const validateForm = () => {
    if (!form.host.trim()) return 'Host is required';
    const hostRegex = /^[a-zA-Z0-9._-]+$/;
    if (!hostRegex.test(form.host.trim())) return 'Invalid host format';
    const port = parseInt(form.port);
    if (isNaN(port) || port < 1 || port > 65535) return 'Port must be 1-65535';
    return null;
  };

  const handleScan = async () => {
    const vErr = validateForm();
    if (vErr) { setError(vErr); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await snmpCheck({ host: form.host.trim(), community: form.community, port: parseInt(form.port), version: form.version });
      if (!data.success) { setError(data.message || 'SNMP scan failed'); }
      setResult(data);
    } catch (e) { setError(e.message || 'Connection failed'); }
    setLoading(false);
  };

  const handleQuery = async (oidOverride, opOverride) => {
    const oid = oidOverride || queryOid;
    const op = opOverride || queryOp;
    if (!oid.trim()) { setError('OID is required'); return; }
    if (op === 'getmulti' && oid.split(',').length > 10) { setError('GETMULTI supports up to 10 OIDs'); return; }
    setQueryLoading(true); setError(null); setQueryResults(null);
    try {
      const data = await snmpQuery({ host: form.host.trim(), community: form.community, port: parseInt(form.port), version: form.version, oid: oid.trim(), operation: op, timeout: parseInt(form.timeout) });
      setQueryResults(data);
      if (data.success) {
        setQueryHistory(prev => {
          const next = [{ oid: oid.trim(), op, time: new Date().toLocaleTimeString(), count: data.count, elapsed: data.elapsed }, ...prev];
          return next.slice(0, 10);
        });
      }
      if (!data.success && data.hint) setError(data.hint);
      else if (!data.success) setError(data.message || 'Query failed');
    } catch (e) { setError(e.message || 'Query failed'); }
    setQueryLoading(false);
  };

  const handlePresetClick = (oid) => {
    setQueryOid(oid);
    const isScalar = oid.endsWith('.0');
    const isTable = !isScalar && oid.split('.').length <= 5;
    setQueryOp(isScalar ? 'get' : isTable ? 'walk' : 'get');
  };

  const exportIfaceCSV = () => {
    if (!result?.interfaces?.length) return;
    const headers = ['Index', 'Name', 'Admin', 'Oper', 'Speed', 'MTU', 'MAC'];
    const rows = sortedIfaces.map(i => [i.index, i.name, i.admin, i.oper, formatSpeed(i.speed), i.mtu, i.mac || '']);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `snmp-ifaces-${form.host || 'device'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const sortedIfaces = (result?.interfaces || []).slice().sort((a, b) => {
    const av = a[ifaceSort.key], bv = b[ifaceSort.key];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av || 0) - (bv || 0);
    return ifaceSort.asc ? cmp : -cmp;
  }).filter(i => !ifaceFilter || i.name.toLowerCase().includes(ifaceFilter.toLowerCase()) || i.admin.includes(ifaceFilter.toLowerCase()) || i.oper.includes(ifaceFilter.toLowerCase()));

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: '#f1f5f9', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ ...S.card }}>
        <div style={S.header}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #4361ee, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>📡</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>SNMP & MIB Browser</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Device scan, custom OID queries, and interface monitoring</div>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ key: 'scan', label: '🔍 Device Scan' }, { key: 'browser', label: '📂 MIB Browser' }, { key: 'interfaces', label: '🔌 Interfaces' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={S.tab(tab === t.key)}>{t.label}</button>
          ))}
        </div>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <div style={S.field}>
            <div style={S.fieldLabel}>Host / IP *</div>
            <input style={S.input} value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="192.168.1.1" onKeyDown={e => e.key === 'Enter' && handleScan()} />
          </div>
          <div style={S.field}>
            <div style={S.fieldLabel}>Community</div>
            <input style={S.input} value={form.community} onChange={e => setForm(f => ({ ...f, community: e.target.value }))} placeholder="public" />
          </div>
          <div style={{ ...S.field, flex: '0 0 80px' }}>
            <div style={S.fieldLabel}>Port</div>
            <input style={S.input} value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="161" />
          </div>
          <div style={{ ...S.field, flex: '0 0 90px' }}>
            <div style={S.fieldLabel}>Version</div>
            <select style={{ ...S.select, width: '100%' }} value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}>
              <option value="1">SNMPv1</option>
              <option value="2c">SNMPv2c</option>
            </select>
          </div>
          <div style={{ ...S.field, flex: '0 0 100px' }}>
            <div style={S.fieldLabel}>Timeout</div>
            <select style={{ ...S.select, width: '100%' }} value={form.timeout} onChange={e => setForm(f => ({ ...f, timeout: e.target.value }))}>
              {TIMEOUTS.map(t => <option key={t} value={t}>{t / 1000}s</option>)}
            </select>
          </div>
          <div style={{ ...S.field, flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            {(tab === 'scan' || tab === 'interfaces') && (
              <button onClick={handleScan} disabled={loading} style={{ ...S.btn, background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #4361ee, #7c3aed)', color: '#fff', opacity: loading ? 0.5 : 1 }}>
                {loading ? '⏳' : '🔍'} Scan
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...S.card, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        </div>
      )}

      {loading && <div style={S.card}><div style={{ padding: 24 }}><LoadingSpinner text="Querying device..." /></div></div>}

      {/* ===== TAB: DEVICE SCAN ===== */}
      {tab === 'scan' && !loading && result && (
        <div>
          {result.diagnostics && (
            <div style={S.card}>
              <div style={S.header}><span style={{ fontSize: 13, fontWeight: 600 }}>Diagnostics</span></div>
              <div style={{ ...S.body, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PHASES.map(p => {
                  const d = result.diagnostics.find(x => x.phase === p.key);
                  const status = d?.status || 'pending';
                  // 'warn' (an unanswered ping) is not a failure — the check carries on.
                  const color = status === 'pass' ? '#34d399'
                    : status === 'warn' ? '#fbbf24'
                    : status === 'fail' ? '#f87171' : '#6b7280';
                  return (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}15` }}>
                      <span>{p.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, color }}>{d?.message || `${p.label} — pending`}</span>
                      <span style={S.tag(color)}>{status.toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.success && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <div style={S.card}>
                  <div style={S.header}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>System Information</span>
                    <div style={{ marginLeft: 'auto' }}>
                      {result.elapsed && <span style={S.tag(result.elapsed < 2000 ? '#34d399' : result.elapsed < 5000 ? '#fbbf24' : '#f87171')}>{result.elapsed}ms</span>}
                    </div>
                  </div>
                  <div style={S.body}>
                    {[
                      { label: 'Name', value: result.system?.name },
                      { label: 'Description', value: result.system?.description },
                      { label: 'Contact', value: result.system?.contact },
                      { label: 'Location', value: result.system?.location },
                      { label: 'Object ID', value: result.system?.objectId },
                      { label: 'Uptime', value: result.system?.uptime ? formatUptime(result.system.uptime) : null },
                      { label: 'Interfaces', value: result.system?.ifCount },
                    ].filter(f => f.value && f.value !== '—').map(f => (
                      <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{f.label}</span>
                        <span style={{ fontSize: 12, color: '#e2e8f0', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{String(f.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {result.interfaces?.length > 0 && (
                  <div style={S.card}>
                    <div style={S.header}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Interface Summary</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{result.interfaces.length} interfaces</span>
                    </div>
                    <div style={{ ...S.body, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Link Up', count: result.interfaces.filter(i => i.oper === 'up').length, color: '#34d399' },
                        { label: 'Link Down', count: result.interfaces.filter(i => i.oper === 'down').length, color: '#f87171' },
                        { label: 'Admin Down', count: result.interfaces.filter(i => i.admin === 'down').length, color: '#6b7280' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '12px 16px', borderRadius: 8, background: `${s.color}08`, border: `1px solid ${s.color}15`, textAlign: 'center', flex: 1, minWidth: 80 }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.count}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {result.interfaces?.length > 0 && (
                <div style={S.card}>
                  <div style={S.header}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Interfaces</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={exportIfaceCSV} style={S.smallBtn}>📄 CSV</button>
                      <button onClick={handleScan} style={S.smallBtn}>🔄 Refresh</button>
                    </div>
                  </div>
                  <div style={{ ...S.body, overflow: 'auto' }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          {[{ key: 'index', label: '#' }, { key: 'name', label: 'Name' }, { key: 'admin', label: 'Admin' }, { key: 'oper', label: 'Oper' }, { key: 'speed', label: 'Speed' }, { key: 'mtu', label: 'MTU' }, { key: 'mac', label: 'MAC' }].map(c => (
                            <th key={c.key} onClick={() => setIfaceSort(s => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))} style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }}>
                              {c.label} {ifaceSort.key === c.key ? (ifaceSort.asc ? '↑' : '↓') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.interfaces.map(i => (
                          <tr key={i.index} style={{ background: i.oper === 'down' ? 'rgba(239,68,68,0.03)' : undefined }}>
                            <td style={S.td}>{i.index}</td>
                            <td style={{ ...S.td, fontWeight: 500 }}>{i.name}</td>
                            <td style={S.td}><span style={S.tag(i.admin === 'up' ? '#34d399' : '#6b7280')}>{i.admin}</span></td>
                            <td style={S.td}><span style={S.tag(i.oper === 'up' ? '#34d399' : '#f87171')}>{i.oper}</span></td>
                            <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{formatSpeed(i.speed)}</td>
                            <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{i.mtu}</td>
                            <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.02em' }}>{i.mac || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <CopyButton text={JSON.stringify(result, null, 2)} label="Copy JSON" />
              </div>
            </>
          )}

          {!result.success && result.message && (
            <div style={{ ...S.card, padding: '20px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 6 }}>❌ {result.message}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                Common fixes: Check that the device is online, the community string is correct (default: "public"), and SNMP is enabled on the device.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: MIB BROWSER ===== */}
      {tab === 'browser' && (
        <div>
          <div style={S.card}>
            <div style={S.header}><span style={{ fontSize: 13, fontWeight: 600 }}>Custom OID Query</span></div>
            <div style={S.body}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={S.fieldLabel}>OID</div>
                  <input style={S.input} value={queryOid} onChange={e => setQueryOid(e.target.value)} placeholder="1.3.6.1.2.1.1.1.0" onKeyDown={e => e.key === 'Enter' && handleQuery()} list="oid-presets" />
                  <datalist id="oid-presets">
                    {Object.values(OID_PRESETS).flatMap(g => Object.keys(g)).map(oid => <option key={oid} value={oid}>{getOidName(oid)} ({oid})</option>)}
                  </datalist>
                </div>
                <div style={{ flex: '0 0 auto' }}>
                  <div style={S.fieldLabel}>Operation</div>
                  <select style={{ ...S.select, width: 'auto' }} value={queryOp} onChange={e => setQueryOp(e.target.value)}>
                    {OPERATIONS.map(o => <option key={o.key} value={o.key}>{o.label} — {o.desc}</option>)}
                  </select>
                </div>
                <button onClick={() => handleQuery()} disabled={queryLoading || !queryOid.trim()} style={{ ...S.btn, background: (!queryOid.trim() || queryLoading) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #4361ee, #7c3aed)', color: '#fff', opacity: (!queryOid.trim() || queryLoading) ? 0.4 : 1 }}>
                  {queryLoading ? '⏳ Querying...' : '🔍 Query'}
                </button>
              </div>

              {queryOp === 'getmulti' && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                  Enter comma-separated OIDs (up to 10): <code style={{ color: '#6c7bff' }}>1.3.6.1.2.1.1.1.0, 1.3.6.1.2.1.1.5.0</code>
                </div>
              )}
            </div>
          </div>

          {queryHistory.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>History:</span>
              {queryHistory.map((h, i) => (
                <button key={i} onClick={() => { setQueryOid(h.oid); setQueryOp(h.op); handleQuery(h.oid, h.op); }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>
                  {getOidName(h.oid)} ({h.op}) · {h.count} · {h.elapsed}ms
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
            {Object.entries(OID_PRESETS).map(([group, oids]) => (
              <div key={group} style={{ ...S.card, marginBottom: 0 }}>
                <button onClick={() => setOpenPresetGroup(g => g === group ? null : group)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: '#e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
                  <span>{group}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{openPresetGroup === group ? '▲' : '▼'}</span>
                </button>
                {openPresetGroup === group && (
                  <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {Object.entries(oids).map(([oid, name]) => (
                      <button key={oid} onClick={() => handlePresetClick(oid)} style={{ padding: '5px 8px', borderRadius: 5, fontSize: 11, border: 'none', background: queryOid === oid ? 'rgba(67,97,238,0.15)' : 'transparent', color: queryOid === oid ? '#6c7bff' : 'rgba(255,255,255,0.5)', cursor: 'pointer', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.15s' }}>
                        <span style={{ color: '#34d399', marginRight: 4 }}>{name}</span>
                        <span style={{ opacity: 0.5 }}>{oid}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {queryLoading && <div style={S.card}><div style={{ padding: 24 }}><LoadingSpinner text="Querying OIDs..." /></div></div>}

          {queryResults && !queryLoading && (
            <div style={S.card}>
              <div style={S.header}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Results</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{queryResults.count} result{queryResults.count !== 1 ? 's' : ''}</span>
                  {queryResults.elapsed && <span style={S.tag(queryResults.elapsed < 1000 ? '#34d399' : '#fbbf24')}>{queryResults.elapsed}ms</span>}
                  <CopyButton text={JSON.stringify(queryResults, null, 2)} label="JSON" />
                </div>
              </div>
              {queryResults.success && queryResults.results?.length > 0 ? (
                <div style={{ ...S.body, overflow: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>#</th>
                        <th style={S.th}>OID</th>
                        <th style={S.th}>Name</th>
                        <th style={S.th}>Type</th>
                        <th style={{ ...S.th, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.results.map((r, i) => (
                        <tr key={i} style={{ background: r.type === 'error' ? 'rgba(239,68,68,0.04)' : undefined }}>
                          <td style={S.td}>{i + 1}</td>
                          <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6c7bff' }}>{r.oid}</td>
                          <td style={{ ...S.td, fontWeight: 500 }}>{getOidName(r.oid)}</td>
                          <td style={S.td}><span style={S.tag(r.type === 'error' ? '#f87171' : r.type === 'String' ? '#34d399' : r.type === 'Integer' ? '#fbbf24' : '#a78bfa')}>{r.type}</span></td>
                          <td style={{ ...S.td, wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: r.type === 'error' ? '#f87171' : '#e2e8f0' }}>{String(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ ...S.body, textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 24, fontSize: 13 }}>
                  {queryResults.success ? 'No results returned. The OID may not exist on this device.' : queryResults.message || 'Query failed'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: INTERFACES ===== */}
      {tab === 'interfaces' && (
        <div>
          {result?.success && result.interfaces?.length > 0 ? (
            <div style={S.card}>
              <div style={S.header}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Interface Table — {form.host}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...S.input, width: 160, padding: '6px 10px', fontSize: 11 }} value={ifaceFilter} onChange={e => setIfaceFilter(e.target.value)} placeholder="🔍 Filter..." />
                  <button onClick={exportIfaceCSV} style={S.smallBtn}>📄 CSV</button>
                  <button onClick={handleScan} style={S.smallBtn}>🔄 Refresh</button>
                  <CopyButton text={JSON.stringify(result.interfaces, null, 2)} label="JSON" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11, flexWrap: 'wrap' }}>
                <span style={{ color: '#34d399' }}>▲ {result.interfaces.filter(i => i.oper === 'up').length} up</span>
                <span style={{ color: '#f87171' }}>▼ {result.interfaces.filter(i => i.oper === 'down').length} down</span>
                <span style={{ color: '#6b7280' }}>■ {result.interfaces.filter(i => i.admin === 'down').length} admin down</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{sortedIfaces.length} shown</span>
              </div>
              <div style={{ ...S.body, overflow: 'auto', maxHeight: '60vh' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {[{ key: 'index', label: '#' }, { key: 'name', label: 'Interface' }, { key: 'admin', label: 'Admin' }, { key: 'oper', label: 'Oper' }, { key: 'speed', label: 'Speed' }, { key: 'mtu', label: 'MTU' }, { key: 'mac', label: 'MAC Address' }].map(c => (
                        <th key={c.key} onClick={() => setIfaceSort(s => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))} style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }}>
                          {c.label} {ifaceSort.key === c.key ? (ifaceSort.asc ? '↑' : '↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedIfaces.map(i => (
                      <tr key={i.index} style={{ background: i.oper === 'down' ? 'rgba(239,68,68,0.04)' : undefined, transition: 'background 0.15s' }}>
                        <td style={S.td}>{i.index}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{i.name}</td>
                        <td style={S.td}><span style={S.tag(i.admin === 'up' ? '#34d399' : '#6b7280')}>{i.admin}</span></td>
                        <td style={S.td}><span style={S.tag(i.oper === 'up' ? '#34d399' : '#f87171')}>{i.oper}</span></td>
                        <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{formatSpeed(i.speed)}</td>
                        <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{i.mtu}</td>
                        <td style={{ ...S.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.03em' }}>{i.mac || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ ...S.card, ...S.body, textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.6)' }}>No Interface Data</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
                Run a Device Scan first to retrieve interface information from the target device.
              </div>
              <button onClick={() => { setTab('scan'); handleScan(); }} style={{ ...S.btn, background: 'linear-gradient(135deg, #4361ee, #7c3aed)', color: '#fff' }}>
                🔍 Run Device Scan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
