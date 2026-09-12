import { useState, useMemo, useRef } from 'react';
import { useDbStorage } from '../../hooks/useDbStorage';
import CopyButton from '../../components/common/CopyButton';
import FillFromSample from './FillFromSample';

const ISP_COLS = [
  "Name","Mobile","Email","NationalId","Address","Zone","Conn.Type","Server","Prot.Type",
  "Profile","UserName","Password","R.Address","C.Type","Package","B.Status","M.Bill",
  "Bill.Month","Join.Date","Exp.Date","Assign2Emp.","DateOfBirth(Opt.)","FatherName(Opt.)",
  "MotherName(Opt.)","Occupation(Opt.)"
];
const LETTERS = ISP_COLS.map((_, i) => String.fromCharCode(65 + i));

const ALIASES = {
  Name: ["name","client name","customer name","full name","নাম","cus. name","cus name","customer","clnt name","subscriber"],
  Mobile: ["mobile","phone","cell","contact","number","মোবাইল","phone number","contact number","mob","telephone"],
  Email: ["email","mail","e-mail","ইমেইল","email address"],
  NationalId: ["nationalid","nid","national id","national_id","nid number"," birth","nid no"],
  Address: ["address","ঠিকানা","location","addr","full address","house","road","village"],
  Zone: ["zone","area","এলাকা","region","sector","thana","upazila","district"],
  "Conn.Type": ["conn.type","connection type","conn type","connection","conntype","conn. type","media","media type"],
  Server: ["server","isp server","server name","nas","bras","bras name"],
  "Prot.Type": ["prot.type","protocol","protocol type","prot type","prot. type","ip type","connection mode"],
  Profile: ["profile","speed profile","bandwidth profile","package","speed","bandwidth","rate"],
  UserName: ["username","user name","user","login","userid","user id","login name","id/ip","c.code","pppoe id"],
  Password: ["password","pass","পাসওয়ার্ড","passwd","secret"],
  "R.Address": ["r.address","remote address","ip","ip address","router ip","static ip","assigned ip","wan ip"],
  "C.Type": ["c.type","customer type","client type","cus. type","cus type","user type"],
  Package: ["package","plan","প্যাকেজ","subscription","service plan","tariff"],
  "B.Status": ["b.status","billing status","status","active/inactive","b. status","account status","state"],
  "M.Bill": ["m.bill","monthly bill","bill","amount","monthly amount","taka","charge","m. bill","fee","rental"],
  "Bill.Month": ["bill.month","billing month","month","bill month","period","for month"],
  "Join.Date": ["join.date","joining date","start date","registration date","join date","activation","act. date"],
  "Exp.Date": ["exp.date","expiry date","expiration","expire date","end date","expiry","ex.date","ex. date","due date"],
  "Assign2Emp.": ["assign2emp.","assigned to","employee","sales person","assign","assigned employee","marketing","ref."],
  "DateOfBirth(Opt.)": ["dateofbirth","date of birth","dob","birth date","birthday"],
  "FatherName(Opt.)": ["fathername","father name","father","পিতার নাম"],
  "MotherName(Opt.)": ["mothername","mother name","mother","মাতার নাম"],
  "Occupation(Opt.)": ["occupation","job","পেশা","profession","designation"]
};

const DEFAULT_RULES = {
  Name: "required", Mobile: "mobile", Email: "email", Password: "required", Profile: "required",
  Zone: "required", Server: "required",
  "Conn.Type": { type: "dropdown", values: ["Wireless","Optical Fiber","UTP","UTP Cable","Fiber Onu","Optical 420","Cat-6","Fibers","WiFi"] },
  "C.Type": { type: "dropdown", values: ["Home","Corporate","Local","New User","Shop user","NGO","Hostel","Irregular"] },
  "Prot.Type": { type: "dropdown", values: ["Static","Hotspot","PPPOE","DHCP"] },
  "B.Status": { type: "dropdown", values: ["Active","Inactive","Personal","Left","Free","Suspended"] },
  "M.Bill": "numeric", "NationalId": "numeric",
  "Join.Date": "date", "Exp.Date": "date_day", "DateOfBirth(Opt.)": "date", "Bill.Month": "month",
  "R.Address": "ip", "UserName": "username", "Address": "text",
};

const VALIDATORS = {
  required: v => v.trim() ? null : 'Required',
  email: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Invalid email',
  mobile: v => {
    if (!v) return null;
    const d = v.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('01')) return null;
    const m = d.match(/01\d{9}/);
    return m ? null : 'Invalid phone (01XXXXXXXXX)';
  },
  numeric: v => !v || /^\d+(\.\d+)?$/.test(v.trim()) ? null : 'Must be number',
  ip: v => !v || /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? null : 'Invalid IP',
  date: v => {
    if (!v) return null;
    const d = v.replace(/[/.]/g, '-').trim();
    return /^(\d{2})-(\d{2})-(\d{4})$/.test(d) ? null : 'DD-MM-YYYY';
  },
  date_day: v => !v || /^([1-9]|[12]\d|3[01])$/.test(v.toString().trim()) ? null : 'Day 1-31',
  month: v => {
    if (!v) return null;
    const d = v.replace(/[/.]/g, '-').trim();
    return /^(\d{2})-(\d{4})$/.test(d) ? null : 'MM-YYYY';
  },
  username: v => {
    if (!v) return null;
    if (v.length < 3) return 'Min 3 chars';
    return null;
  },
  text: () => null,
  dropdown: (v, rule) => {
    if (!v) return null;
    const m = rule.values?.find(x => x.toLowerCase() === v.toLowerCase().trim());
    return m ? null : 'Not in allowed list';
  },
};

export default function DataProcessor() {

  const [step, setStep] = useState('upload');
  const [uploadMode, setUploadMode] = useState('structured');
  const [apiKey, setApiKey] = useState('');
  const [rawData, setRawData] = useState([]);
  const [appData, setAppData] = useState([]);
  const [srcCols, setSrcCols] = useState([]);
  const [colMap, setColMap] = useState({});
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLogs, setAiLogs] = useState([]);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [selCell, setSelCell] = useState(null);
  const [selAddr, setSelAddr] = useState('');
  const [activeCol, setActiveCol] = useState('');
  const [modalCol, setModalCol] = useState(null);
  const [bulkFind, setBulkFind] = useState('');
  const [bulkRep, setBulkRep] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  const [savedTemplates, setSavedTemplates] = useDbStorage('templates', 'superapp-saved-templates', []);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateLib, setShowTemplateLib] = useState(false);

  const fbarRef = useRef(null);
  const fileInputRef = useRef(null);
  const aiFileRef = useRef(null);

  const addLog = (msg) => setAiLogs(prev => [...prev, '> ' + msg]);

  const errors = useMemo(() => {
    const e = {};
    appData.forEach((row, ri) => {
      ISP_COLS.forEach(col => {
        const v = row[col] || '';
        const rule = DEFAULT_RULES[col];
        if (!rule) return;
        let err = null;
        if (typeof rule === 'string') err = VALIDATORS[rule]?.(v);
        else if (rule.type === 'dropdown') err = VALIDATORS.dropdown(v, rule);
        else err = VALIDATORS[rule.type]?.(v);
        if (err) {
          if (!e[col]) e[col] = {};
          if (!e[col][ri]) e[col][ri] = [];
          e[col][ri].push(err);
        }
      });
    });
    return e;
  }, [appData]);

  const errCount = useMemo(() => {
    let c = 0;
    Object.values(errors).forEach(col => { Object.values(col).forEach(arr => { c += arr.length; }); });
    return c;
  }, [errors]);

  const validRows = useMemo(() => {
    const errRows = new Set();
    Object.values(errors).forEach(col => { Object.keys(col).forEach(ri => errRows.add(Number(ri))); });
    return appData.length - errRows.size;
  }, [errors, appData]);

  const hasErrors = (rowIdx) => {
    return Object.values(errors).some(col => col[rowIdx]?.length > 0);
  };

  const getErrors = (rowIdx, col) => {
    return errors[col]?.[rowIdx] || [];
  };

  const autoMap = (cols) => {
    const map = {};
    const used = new Set();
    ISP_COLS.forEach(tc => {
      const aliases = ALIASES[tc] || [];
      for (const sc of cols) {
        const n = sc.toLowerCase().replace(/[\s_\-.]/g, '');
        const found = aliases.some(a => {
          const an = a.replace(/[\s_\-.]/g, '');
          return n === an || n.includes(an) || an.includes(n);
        });
        if (found && !used.has(sc)) { map[tc] = sc; used.add(sc); break; }
      }
    });
    return map;
  };

  const processStructured = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { setLoading(false); return; }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"+|"+$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"+|"+$/g, ''));
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    });
    setRawData(rows);
    setSrcCols(headers);
    const map = autoMap(headers);
    setColMap(map);
    setAiLogs([]);
    setLoading(false);
    setStep('map');
  };

  const applyMapping = () => {
    const mapped = rawData.map((row, i) => {
      const r = {};
      ISP_COLS.forEach(c => {
        const src = colMap[c];
        r[c] = src && row[src] !== undefined ? row[src].toString().trim() : '';
      });
      return r;
    });
    setAppData(mapped);
    setStep('preview');
  };

  const aiLog = (msg) => {
    setAiLogs(prev => [...prev, '> ' + msg]);
  };

  const processAI = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setAiProcessing(true);
    setAiLogs([]);
    aiLog('Reading file: ' + file.name);

    const base64 = await new Promise(res => {
      const fr = new FileReader();
      fr.onload = e => res(e.target.result.split(',')[1]);
      fr.readAsDataURL(file);
    });

    const ext = file.name.split('.').pop().toLowerCase();
    const isPDF = ext === 'pdf';
    const isImage = ['png','jpg','jpeg','webp','gif'].includes(ext);
    const isExcel = ['xlsx','xls'].includes(ext);

    aiLog('Type: ' + (isPDF ? 'PDF' : isImage ? 'Image' : isExcel ? 'Excel' : ext));

    if (isExcel) {
      aiLog('Excel detected, switching to structured parser...');
      setAiProcessing(false);
      setUploadMode('structured');
      const blob = await fetch('data:application/octet-stream;base64,' + base64).then(r => r.blob());
      processStructured(new File([blob], file.name, { type: file.type }));
      return;
    }

    aiLog('Sending to AI for extraction...');
    addLog('Requesting Claude API...');

    let content = [];
    if (isPDF) {
      content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, {
        type: "text",
        text: `Extract all client/customer data from this document. Return ONLY a JSON array of objects with these exact keys: ${ISP_COLS.join(', ')}. Use empty string for missing fields. Format: [{"Name":"...","Mobile":"...",...}]`
      }];
    } else {
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      content = [{ type: "image", source: { type: "base64", media_type: mimeMap[ext] || 'image/jpeg', data: base64 } }, {
        type: "text",
        text: `Extract all client/customer data from this image. Return ONLY a JSON array: ${JSON.stringify(ISP_COLS.map(k => ({ [k]: "" }))).replace(/,""/g, '","').replace('[{"','[{"').replace('"}]','"}]')}`
      }];
    }

    try {
      const headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
      if (apiKey) headers["x-api-key"] = apiKey;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [{ role: "user", content }]
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'API error: ' + res.status);
      }

      const data = await res.json();
      aiLog('Response received, parsing...');

      const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('');
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in response');

      const parsed = JSON.parse(match[0]);
      aiLog(`${parsed.length} records extracted`);

      const mapped = parsed.map((row, i) => {
        const r = {};
        const fieldMap = {
          "ConnType": "Conn.Type", "ProtType": "Prot.Type", "RAddress": "R.Address",
          "CType": "C.Type", "BStatus": "B.Status", "MBill": "M.Bill",
          "BillMonth": "Bill.Month", "JoinDate": "Join.Date", "ExpDate": "Exp.Date",
          "Assign2Emp": "Assign2Emp.", "DateOfBirth": "DateOfBirth(Opt.)",
          "FatherName": "FatherName(Opt.)", "MotherName": "MotherName(Opt.)",
          "Occupation": "Occupation(Opt.)"
        };
        ISP_COLS.forEach(c => {
          const key = Object.keys(fieldMap).find(k => fieldMap[k] === c) || c;
          r[c] = row[key] !== undefined ? String(row[key]).trim() : '';
        });
        return r;
      });

      setAppData(mapped);
      setTimeout(() => {
        setAiProcessing(false);
        setStep('preview');
      }, 300);

    } catch (err) {
      aiLog('Error: ' + err.message);
      setAiProcessing(false);
    }
  };

  const handleCellEdit = (rowIdx, col, value) => {
    setAppData(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [col]: value };
      return next;
    });
  };

  const doBulkReplace = () => {
    if (!bulkFind || !activeCol) return;
    let count = 0;
    setAppData(prev => prev.map((r, i) => {
      if (r[activeCol] && r[activeCol].toLowerCase() === bulkFind.toLowerCase()) {
        count++;
        return { ...r, [activeCol]: bulkRep };
      }
      return r;
    }));
    setBulkMsg(count > 0 ? `${count} replaced ✓` : 'Not found');
    setTimeout(() => setBulkMsg(''), 3000);
  };

  const exportExcel = () => {
    if (!appData.length) return;
    const headers = ['#', ...ISP_COLS, 'Status'];
    const rows = appData.map((r, i) => {
      const status = hasErrors(i) ? 'INVALID' : 'VALID';
      return [i + 1, ...ISP_COLS.map(c => r[c] || ''), status];
    });
    let csv = '\uFEFF' + headers.join(',') + '\n';
    csv += rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(csv, fileName + '_Formatted.csv', 'text/csv;charset=utf-8');
  };

  const exportClipboard = async () => {
    if (!appData.length) return;
    let s = ISP_COLS.join('\t') + '\n';
    s += appData.map(r => ISP_COLS.map(c => (r[c] || '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')).join('\n');
    await navigator.clipboard.writeText(s);
  };

  const download = (content, fname, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    a.click(); URL.revokeObjectURL(url);
  };

  const saveTemplate = () => {
    if (!templateName.trim() || appData.length === 0) return;
    const entry = { name: templateName.trim(), fields: ISP_COLS, data: appData, colMap, savedAt: new Date().toISOString() };
    const exists = savedTemplates.findIndex(t => t.name === templateName.trim());
    setSavedTemplates(exists >= 0
      ? savedTemplates.map((t, i) => i === exists ? entry : t)
      : [entry, ...savedTemplates]);
    setTemplateName('');
  };

  const loadTemplate = (name) => {
    const tpl = savedTemplates.find(t => t.name === name);
    if (tpl) {
      setAppData(tpl.data || []);
      setColMap(tpl.colMap || {});
      setStep('preview');
    }
    setShowTemplateLib(false);
  };

  const getColRule = (col) => {
    const r = DEFAULT_RULES[col];
    if (!r) return { type: 'none', label: 'Any Text' };
    if (typeof r === 'string') {
      const labels = { required: 'Required', email: 'Email', mobile: '01XXXXXXXXX', numeric: 'Numbers', ip: 'IPv4', date: 'DD-MM-YYYY', date_day: 'Day 1-31', month: 'MM-YYYY', username: 'Username', text: 'Text', dropdown: 'Dropdown' };
      return { type: r, label: labels[r] || r };
    }
    return { type: r.type, label: r.type === 'dropdown' ? r.values?.slice(0, 3).join(', ') + '...' : r.type, values: r.values };
  };

  const steps = ['upload', 'map', 'preview', 'export'];
  const stepIcons = ['📂', '🔗', '✓', '⬇'];
  const stepLabels = ['Upload', 'Mapping', 'Validate', 'Export'];

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' };
  const sectionTitle = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' };

  return (
    <div>
      {/* Header */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>📄 ISP Data Processor</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{fileName || 'No file loaded'} <span className="badge badge-success">PostgreSQL</span></p>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => { if (s === 'upload' || appData.length || s === 'map' || s === 'export') setStep(s); }}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: step === s ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: step === s ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)', cursor: 'pointer',
                  opacity: (s === 'preview' || s === 'export') && !appData.length ? 0.5 : 1,
                }}>{stepIcons[i]} {stepLabels[i]}</button>
              {i < steps.length - 1 && <span style={{ color: 'var(--border-color)', fontSize: 10 }}>▸</span>}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: UPLOAD */}
      {step === 'upload' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className={uploadMode === 'structured' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setUploadMode('structured')}>📊 Excel / CSV</button>
            <button className={uploadMode === 'ai' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setUploadMode('ai')}>🤖 AI Extract (PDF/Image)</button>
            <button className={uploadMode === 'fill-sample' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setUploadMode('fill-sample')}>📋 Fill from Sample</button>
          </div>

          {uploadMode === 'ai' && (
            <div className="card" style={{ marginBottom: 12, padding: 16 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Anthropic API Key <span style={{ fontSize: 11 }}>(optional — for browser use)</span></label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace' }} placeholder="sk-ant-api03-..." />
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{
              border: `2px dashed ${uploadMode === 'ai' ? '#fb923c' : 'var(--accent)'}`,
              borderRadius: 'var(--radius-lg)', padding: '32px 20px', textAlign: 'center',
              background: 'var(--bg-secondary)', cursor: 'pointer',
            }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadMode === 'ai' ? processAI(f) : processStructured(f); }}
              onClick={() => (uploadMode === 'ai' ? aiFileRef : fileInputRef).current?.click()}
            >
              <p style={{ fontSize: 40 }}>{uploadMode === 'ai' ? '🤖' : '📂'}</p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>{uploadMode === 'ai' ? 'Any file — AI extracts data' : 'Drag & drop or browse'}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {uploadMode === 'ai' ? 'PDF, PNG, JPG, XLSX, CSV, TXT' : 'XLSX, XLS, CSV'}
              </p>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && processStructured(e.target.files[0])} />
            <input ref={aiFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.txt" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && processAI(e.target.files[0])} />
          </div>

          {aiLogs.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>AI Log</p>
              <div style={{ maxHeight: 120, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12, color: 'var(--success)' }}>
                {aiLogs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          )}

          {loading && <p style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>⏳ Processing...</p>}
          {aiProcessing && (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <p>AI extracting data...</p>
            </div>
          )}

          {uploadMode === 'fill-sample' && <FillFromSample />}
        </>
      )}

      {/* STEP 2: MAPPING */}
      {step === 'map' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={sectionTitle}>Column Mapping <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{Object.keys(colMap).length}/{ISP_COLS.length} mapped</span></h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary btn-sm" onClick={() => { const m = autoMap(srcCols); setColMap(m); }}>🔄 Auto-Detect</button>
              <button className="btn-primary btn-sm" onClick={applyMapping} disabled={!rawData.length}>Apply → Preview</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6 }}>
            {ISP_COLS.map(tc => {
              const mapped = colMap[tc];
              return (
                <div key={tc} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  background: 'var(--bg-secondary)', borderRadius: 'var(--radius)',
                  border: mapped ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 100, color: 'var(--text-primary)' }}>{tc}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>←</span>
                  <select value={mapped || ''} onChange={e => setColMap(prev => ({ ...prev, [tc]: e.target.value }))}
                    style={{ flex: 1, fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', padding: '3px 6px' }}>
                    <option value="">— blank —</option>
                    {srcCols.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: PREVIEW & VALIDATION */}
      {step === 'preview' && appData.length > 0 && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total Rows', value: appData.length, color: 'var(--accent)' },
              { label: 'Valid', value: validRows, color: 'var(--success)' },
              { label: 'Errors', value: errCount, color: errCount > 0 ? 'var(--danger)' : 'var(--success)' },
              { label: 'Columns', value: ISP_COLS.length, color: 'var(--warning)' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="card" style={{ marginBottom: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 10px', background: 'var(--bg-secondary)', borderRadius: 4,
              fontFamily: 'monospace', fontSize: 13, color: 'var(--accent)', minWidth: 50, textAlign: 'center',
            }} id="fbar-addr">{selAddr || 'A1'}</span>
            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>fx</span>
            <input ref={fbarRef} style={{ flex: 1, minWidth: 120, fontFamily: 'monospace', fontSize: 13 }}
              placeholder="Select a cell or edit here"
              value={selCell !== null ? (appData[selCell.row]?.[selCell.col] || '') : ''}
              onChange={e => { if (selCell) handleCellEdit(selCell.row, selCell.col, e.target.value); }} />
            {activeCol && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                Rule: {getColRule(activeCol).label}
              </span>
            )}
            <button className="btn-secondary btn-sm" onClick={() => { if (activeCol) setModalCol(activeCol); }} disabled={!activeCol}>⚙️ Rule</button>
          </div>

          {/* Bulk find/replace */}
          <div className="card" style={{ marginBottom: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>🔍 Bulk Replace{activeCol ? ` in "${activeCol}"` : ''}</span>
            <input placeholder="Find" value={bulkFind} onChange={e => setBulkFind(e.target.value)} style={{ width: 140, fontSize: 13 }} />
            <input placeholder="Replace with" value={bulkRep} onChange={e => setBulkRep(e.target.value)} style={{ width: 140, fontSize: 13 }} />
            <button className="btn-primary btn-sm" onClick={doBulkReplace} disabled={!bulkFind || !activeCol}>Replace All</button>
            {bulkMsg && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>{bulkMsg}</span>}
          </div>

          {/* Table */}
          <div className="card">
            <div style={{ overflow: 'auto', maxHeight: '50vh', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '6px 8px', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 11, position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 3, minWidth: 32 }}>#</th>
                    {ISP_COLS.map(c => (
                      <th key={c} style={{
                        padding: '7px 8px', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: activeCol === c ? 'rgba(67,97,238,0.15)' : 'var(--bg-card)',
                      }} onClick={() => setActiveCol(c)}>
                        {c} {activeCol === c && '▼'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appData.map((row, ri) => (
                    <tr key={ri} style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: hasErrors(ri) ? 'rgba(239,71,111,0.04)' : 'transparent',
                    }}>
                      <td style={{
                        padding: '3px 6px', borderRight: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)', fontSize: 11, textAlign: 'center',
                        position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 1,
                      }}>{ri + 1}</td>
                      {ISP_COLS.map((c, ci) => {
                        const cellErrors = getErrors(ri, c);
                        return (
                          <td key={c} contentEditable suppressContentEditableWarning
                            style={{
                              padding: '3px 6px', borderRight: '1px solid var(--border-color)',
                              outline: 'none', minWidth: 80,
                              background: cellErrors.length ? 'rgba(239,71,111,0.08)' : 'transparent',
                              color: cellErrors.length ? 'var(--danger)' : 'var(--text-primary)',
                              cursor: 'text',
                            }}
                            onClick={() => { setSelCell({ row: ri, col: c }); setSelAddr(`${LETTERS[ci]}${ri + 1}`); setActiveCol(c); }}
                            onBlur={e => handleCellEdit(ri, c, e.target.innerText)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                          >{row[c] || ''}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
              <span>Rows: <strong>{appData.length}</strong> | Cols: <strong>{ISP_COLS.length}</strong> | Errors: <strong style={{ color: 'var(--danger)' }}>{errCount}</strong></span>
              <div style={{ display: 'flex', gap: 12 }}>
                <span>✅ Valid: <strong style={{ color: 'var(--success)' }}>{validRows}</strong></span>
                <span>❌ Invalid: <strong style={{ color: 'var(--danger)' }}>{appData.length - validRows}</strong></span>
              </div>
            </div>
          </div>

          {/* AI Error Fix - INNOVATION */}
          {errCount > 0 && (
            <div className="card" style={{ marginTop: 16, padding: 16, border: '2px solid var(--warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
                  🤖 AI Error Fix
                  <span className="badge badge-warning">{errCount} errors</span>
                </h3>
                <button className="btn-primary" style={{ background: 'var(--warning)', color: '#000' }}
                  onClick={async () => {
                    const errRows = appData.filter((_, ri) => hasErrors(ri));
                    if (!errRows.length) return;
                    const errDetails = errRows.map((r, i) => {
                      const ri = appData.indexOf(r);
                      const fields = ISP_COLS.filter(c => getErrors(ri, c).length).map(c => ({
                        col: c, value: r[c], errors: getErrors(ri, c)
                      }));
                      return { row: ri + 1, fields };
                    });
                    setAiLogs([]);
                    aiLog(`Sending ${errDetails.length} error rows to AI...`);
                    try {
                      const headers = { "Content-Type": "application/json" };
                      const key = apiKey || prompt('Enter Anthropic API key for AI fix:');
                      if (!key) { aiLog('Cancelled — no API key'); return; }
                      headers["x-api-key"] = key;
                      headers["anthropic-version"] = "2023-06-01";
                      const res = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                          model: "claude-sonnet-4-20250514",
                          max_tokens: 4000,
                          messages: [{
                            role: "user",
                            content: `Fix the validation errors in this ISP client data. Return a JSON object where keys are row numbers (1-indexed) and values are objects with the corrected fields only.

Rules:
- Mobile: must be 11 digits starting with 01
- Email: must be valid email format
- M.Bill: must be a number
- R.Address: must be valid IPv4
- Join.Date: DD-MM-YYYY format
- Exp.Date: day number (1-31)
- Bill.Month: MM-YYYY format
- Name, Password, Profile, Zone, Server: required

Data to fix:
${JSON.stringify(errDetails, null, 2)}

Return ONLY a JSON object like: {"1":{"Mobile":"01712345678","Email":"fix@example.com"}}`
                          }]
                        })
                      });
                      if (!res.ok) throw new Error('API error: ' + res.status);
                      const data = await res.json();
                      const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('');
                      const match = text.match(/\{[\s\S]*\}/);
                      if (!match) throw new Error('No JSON found');
                      const fixes = JSON.parse(match[0]);
                      setAppData(prev => prev.map((r, i) => {
                        const fix = fixes[String(i + 1)];
                        return fix ? { ...r, ...fix } : r;
                      }));
                      aiLog(`✅ ${Object.keys(fixes).length} rows fixed by AI!`);
                    } catch (err) {
                      aiLog('AI Fix error: ' + err.message);
                    }
                  }}>
                  🤖 Auto-Fix All Errors with AI
                </button>
              </div>
              {aiLogs.length > 1 && (
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--success)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '8px 12px', maxHeight: 80, overflowY: 'auto', marginBottom: 8 }}>
                  {aiLogs.slice(1).map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Detected {errCount} errors across {appData.filter((_, ri) => hasErrors(ri)).length} rows.
                AI will intelligently correct invalid mobile numbers, emails, dates, and other fields.
              </p>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn-secondary" onClick={() => setStep('map')}>◀ Back to Mapping</button>
            <button className="btn-primary" onClick={() => setStep('export')}>Proceed to Export ▶</button>
          </div>
        </>
      )}

      {/* STEP 4: EXPORT */}
      {step === 'export' && appData.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={sectionTitle}>Export Data</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 4 }}>
            {appData.length} rows · {errCount} errors · {validRows} valid — from "{fileName}"
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={exportExcel}>📊 Export Excel (CSV)</button>
            <button className="btn-secondary" onClick={exportClipboard}>📋 Copy to Clipboard</button>
            <button className="btn-secondary" onClick={() => {
              const json = JSON.stringify(appData, null, 2);
              download(json, fileName + '.json', 'application/json');
            }}>📄 Export JSON</button>
            <button className="btn-secondary" onClick={() => setStep('preview')}>◀ Back to Edit</button>
          </div>
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)}
                style={{ width: 200, fontSize: 13 }} />
              <button className="btn-secondary btn-sm" onClick={saveTemplate} disabled={!templateName.trim()}>💾 Save as Template</button>
              <button className="btn-secondary btn-sm" onClick={() => setShowTemplateLib(!showTemplateLib)}>📚 Load Template</button>
            </div>
            {showTemplateLib && (
              <div style={{ marginTop: 8 }}>
                {savedTemplates.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No saved templates</p>
                ) : (
                  savedTemplates.map(t => (
                    <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                      <span>{t.name} <span style={{ color: 'var(--text-secondary)' }}>({t.data?.length || 0} rows)</span></span>
                      <button className="btn-primary btn-sm" onClick={() => loadTemplate(t.name)}>Load</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="info-bar" style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(6,214,160,0.08)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✓</span>
            <span>Colored header with Calibri-style format — ready for ISP software import</span>
          </div>
        </div>
      )}

      {/* Rule Modal */}
      {modalCol && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setModalCol(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 0 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontWeight: 600 }}>Rule: {modalCol}</h4>
              <button className="btn-secondary btn-sm" onClick={() => setModalCol(null)}>✕</button>
            </div>
            <div style={{ padding: 18 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Validation: <strong>{getColRule(modalCol).label}</strong></p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Errors in column: {Object.keys(errors[modalCol] || {}).length} cells
              </p>
              {DEFAULT_RULES[modalCol]?.type === 'dropdown' && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Allowed values:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {DEFAULT_RULES[modalCol].values.map(v => (
                      <span key={v} style={{ padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 12 }}>{v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => setModalCol(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
