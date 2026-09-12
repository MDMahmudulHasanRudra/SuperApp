import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const STEPS = [
  { key: 'upload-demo', num: 1, label: 'Upload Demo', icon: '📋' },
  { key: 'upload-source', num: 2, label: 'Upload Source', icon: '📦' },
  { key: 'mapping', num: 3, label: 'Column Map', icon: '🔗' },
  { key: 'processing', num: 4, label: 'Process', icon: '⚙️' },
  { key: 'preview', num: 5, label: 'Preview & Edit', icon: '✏️' },
  { key: 'export', num: 6, label: 'Export', icon: '⬇' },
];

const VALIDATION_RULES = [
  { key: 'none', label: 'None' },
  { key: 'required', label: 'Required' },
  { key: 'numeric', label: 'Numeric' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'url', label: 'URL' },
  { key: 'date', label: 'Date' },
];

const BULK_PATTERNS = [
  { key: 'same', label: 'Same Value' },
  { key: 'sequential', label: 'Sequential (1,2,3...)' },
  { key: 'prefix-seq', label: 'Prefix + Sequence' },
  { key: 'formula', label: 'Formula (A1+1)' },
];

function getSid() {
  let sid = localStorage.getItem('superapp-session-id');
  if (!sid) { sid = crypto.randomUUID(); localStorage.setItem('superapp-session-id', sid); }
  return sid;
}

export default function FillFromSample() {
  const sessionIdRef = useRef(null);
  const configured = true;

  const [_sessions, setSessions] = useLocalStorage('superapp-data-sessions', {});
  const [currentSession, setCurrentSession] = useState(null);
  const [step, setStep] = useState('upload-demo');
  const [loading, setLoading] = useState(false);
  const [dragOverDemo, setDragOverDemo] = useState(false);
  const [dragOverSource, setDragOverSource] = useState(false);
  const [notification, setNotification] = useState(null);
  const [processingLog, setProcessingLog] = useState([]);
  const [dbStatus, setDbStatus] = useState({ demo: false, source: false });

  // New state for upgrades
  const [searchQuery, setSearchQuery] = useState('');
  const [searchColumn, setSearchColumn] = useState('all');
  const [showStats, setShowStats] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showBulkFill, setShowBulkFill] = useState(false);
  const [bulkFillTarget, setBulkFillTarget] = useState('');
  const [bulkFillPattern, setBulkFillPattern] = useState('same');
  const [bulkFillValue, setBulkFillValue] = useState('');
  const [bulkFillPrefix, setBulkFillPrefix] = useState('');
  const [bulkFillStart, setBulkFillStart] = useState(1);
  const [validationRules, setValidationRules] = useState({});
  const [duplicateCheckCol, setDuplicateCheckCol] = useState('');
  const [duplicateResults, setDuplicateResults] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sameFileMode, setSameFileMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [viewMode, setViewMode] = useState('table');

  const demoInputRef = useRef(null);
  const sourceInputRef = useRef(null);
  const searchInputRef = useRef(null);

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const addLog = (msg) => setProcessingLog(p => [...p, msg]);

  const saveSession = useCallback(async (updates) => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    setSessions(prev => {
      const existing = prev[sid] || {};
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      return { ...prev, [sid]: updated };
    });

    setCurrentSession(prev => ({ ...prev, ...updates }));

    if (configured) {
      try {
        const res = await fetch('/api/db/data_sessions/upsert', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sid,
            data: { session_id: sid, ...updates, updated_at: new Date().toISOString() },
          }),
        });
        if (!res.ok) throw new Error(res.statusText);
      } catch (err) {
        console.error('DB save error:', err);
      }
    }
  }, [configured, setSessions]);

  const startNewSession = () => {
    const sid = crypto.randomUUID();
    sessionIdRef.current = sid;
    const sess = {
      id: sid,
      step: 'upload-demo',
      demoFileName: '',
      demoHeaders: [],
      demoRows: [],
      sourceFileName: '',
      sourceHeaders: [],
      sourceRows: [],
      colMap: {},
      filledData: [],
      rules: { clientCodeUnique: true, mobileFallback: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSessions(prev => ({ ...prev, [sid]: sess }));
    setCurrentSession(sess);
    setStep('upload-demo');
    setDbStatus({ demo: false, source: false });
    setProcessingLog([]);
    setSearchQuery('');
    setSearchColumn('all');
    setShowStats(false);
    setShowValidation(false);
    setShowBulkFill(false);
    setValidationRules({});
    setDuplicateResults(null);
    setDuplicateCheckCol('');
    setSelectedRows(new Set());
    setSameFileMode(false);
  };

  useEffect(() => {
    if (!sessionIdRef.current) {
      const sid = crypto.randomUUID();
      sessionIdRef.current = sid;
      const sess = {
        id: sid,
        step: 'upload-demo',
        demoFileName: '',
        demoHeaders: [],
        demoRows: [],
        sourceFileName: '',
        sourceHeaders: [],
        sourceRows: [],
        colMap: {},
        filledData: [],
        rules: { clientCodeUnique: true, mobileFallback: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSessions(prev => ({ ...prev, [sid]: sess }));
      setCurrentSession(sess);
    }
  }, []);

  const readFile = async (file) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const names = wb.SheetNames;
    setSheetNames(names);
    const ws = wb.Sheets[names[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!json.length) throw new Error('No data found in file');
    return { headers: Object.keys(json[0]), rows: json, wb, sheetNames: names };
  };

  const readFileWithSheet = async (file, sheetName) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!json.length) throw new Error('No data found in sheet');
    return { headers: Object.keys(json[0]), rows: json, wb };
  };

  const handleDemoUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const { headers, rows } = await readFile(file);
      await saveSession({
        step: 'upload-demo',
        demoFileName: file.name,
        demoHeaders: headers,
        demoRows: rows,
      });
      setStep('upload-source');
      setDbStatus(p => ({ ...p, demo: true }));
      showNotif(`Demo file "${file.name}" — ${headers.length} cols, ${rows.length} rows`);
    } catch (err) {
      showNotif('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const handleSourceUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const isSameFile = currentSession?.demoFileName === file.name;
      setSameFileMode(isSameFile);

      const { headers, rows, sheetNames: sheets } = await readFile(file);
      setSheetNames(sheets);

      if (sheets.length > 1 && !selectedSheet) {
        setSelectedSheet(sheets[0]);
      }

      const autoMap = {};
      const used = new Set();
      const demoHeaders = currentSession?.demoHeaders || [];
      demoHeaders.forEach(sh => {
        const sn = sh.toLowerCase().replace(/[\s_\-.]/g, '');
        for (const src of headers) {
          const srcn = src.toLowerCase().replace(/[\s_\-.]/g, '');
          if ((sn === srcn || srcn.includes(sn) || sn.includes(srcn)) && !used.has(src)) {
            autoMap[sh] = src;
            used.add(src);
            break;
          }
        }
      });

      await saveSession({
        step: 'upload-source',
        sourceFileName: file.name,
        sourceHeaders: headers,
        sourceRows: rows,
        colMap: autoMap,
        allSheets: sheets,
      });
      setDbStatus(p => ({ ...p, source: true }));
      showNotif(`Source file "${file.name}" — ${headers.length} cols, ${rows.length} rows${isSameFile ? ' (Same file mode — preserving format)' : ''}`);
      setStep('mapping');
    } catch (err) {
      showNotif('Error: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const processFill = async () => {
    setLoading(true);
    setProcessingLog([]);
    const sess = currentSession;
    if (!sess) return;

    const { demoHeaders, demoRows, sourceRows, colMap } = sess;
    const demoFirstRow = demoRows.length > 0 ? demoRows[0] : {};
    const mobileCol = Object.entries(colMap).find(([demo]) =>
      /mobile|phone|cell|contact|মোবাইল/i.test(demo)
    );
    const clientCodeCol = Object.entries(colMap).find(([demo]) =>
      /username|user.?name|login|client.?code|c.?code|user.?id/i.test(demo)
    );

    addLog(`Demo columns: ${demoHeaders.length}`);
    addLog(`Source rows: ${sourceRows.length}`);
    addLog(`Mapped columns: ${Object.keys(colMap).length}`);
    if (clientCodeCol) addLog(`Client code: ${clientCodeCol[0]} ← ${clientCodeCol[1]}`);
    if (mobileCol) addLog(`Mobile: ${mobileCol[0]} ← ${mobileCol[1]}`);
    if (sameFileMode) addLog('Same-file mode: preserving header row + first row');

    const dataStartIndex = sameFileMode ? 1 : 0;
    const sourceData = sameFileMode ? sourceRows.slice(dataStartIndex) : sourceRows;

    let filled = sourceData.map((srcRow) => {
      const r = {};
      demoHeaders.forEach(h => {
        const mapped = colMap[h];
        if (mapped && srcRow[mapped] !== undefined && String(srcRow[mapped]).trim() !== '') {
          r[h] = String(srcRow[mapped]).trim();
        } else {
          r[h] = '';
        }
      });
      return r;
    });

    addLog(`Filling ${filled.length} rows...`);
    let fillCount = 0;
    filled.forEach(row => {
      demoHeaders.forEach(h => {
        if (!row[h] || row[h] === '') {
          const demoVal = demoFirstRow[h];
          if (demoVal !== undefined && String(demoVal).trim() !== '') {
            row[h] = String(demoVal).trim();
            fillCount++;
          }
        }
      });
    });
    addLog(`Filled ${fillCount} empty cells from demo`);

    if (clientCodeCol) {
      addLog('Enforcing unique client codes...');
      const demoCol = clientCodeCol[0];
      const seen = {};
      let dupFixed = 0;
      filled.forEach((row, i) => {
        let code = row[demoCol] || '';
        if (!code || code === '') {
          code = `CLT${String(i + 1).padStart(4, '0')}`;
          row[demoCol] = code;
          dupFixed++;
        }
        if (seen[code] !== undefined) {
          let suffix = 1;
          let newCode;
          do {
            newCode = `${code}_${suffix}`;
            suffix++;
          } while (seen[newCode] !== undefined);
          row[demoCol] = newCode;
          seen[newCode] = true;
          dupFixed++;
        } else {
          seen[code] = true;
        }
      });
      addLog(`Fixed ${dupFixed} client code issues`);
    }

    if (mobileCol) {
      addLog('Checking mobile numbers...');
      const demoCol = mobileCol[0];
      let emptyMobile = 0;
      filled.forEach(row => {
        if (!row[demoCol] || row[demoCol] === '') {
          row[demoCol] = '01XXXXXXXXX';
          emptyMobile++;
        }
      });
      if (emptyMobile > 0) addLog(`Placed demo number for ${emptyMobile} empty mobiles`);
      else addLog('All mobile numbers present');
    }

    addLog('Completing unmapped columns...');
    let unmappedFill = 0;
    filled.forEach(row => {
      demoHeaders.forEach(h => {
        if (row[h] === undefined || row[h] === '') {
          const demoVal = demoFirstRow[h];
          row[h] = demoVal !== undefined && String(demoVal).trim() !== ''
            ? String(demoVal).trim()
            : '';
          if (row[h]) unmappedFill++;
        }
      });
    });
    if (unmappedFill > 0) addLog(`Filled ${unmappedFill} unmapped cells`);

    addLog(`Complete — ${filled.length} rows ready`);

    await saveSession({
      step: 'preview',
      filledData: filled,
      processingLog: processingLog.concat(['Complete']),
    });
    setLoading(false);
    setStep('preview');
  };

  const handleCellEdit = (rowIdx, col, value) => {
    setCurrentSession(prev => {
      const next = { ...prev };
      next.filledData = [...(next.filledData || [])];
      next.filledData[rowIdx] = { ...next.filledData[rowIdx], [col]: value };
      return next;
    });
  };

  const handleInsertRow = (afterIdx) => {
    setCurrentSession(prev => {
      const next = { ...prev };
      next.filledData = [...(next.filledData || [])];
      const empty = {};
      (next.demoHeaders || []).forEach(h => { empty[h] = ''; });
      next.filledData.splice(afterIdx + 1, 0, empty);
      return next;
    });
    showNotif(`Row inserted at position ${afterIdx + 2}`);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.size === 0) return;
    setCurrentSession(prev => {
      const next = { ...prev };
      next.filledData = (next.filledData || []).filter((_, i) => !selectedRows.has(i));
      return next;
    });
    showNotif(`Deleted ${selectedRows.size} row(s)`);
    setSelectedRows(new Set());
  };

  const handleDuplicateRow = (rowIdx) => {
    setCurrentSession(prev => {
      const next = { ...prev };
      next.filledData = [...(next.filledData || [])];
      next.filledData.splice(rowIdx + 1, 0, { ...next.filledData[rowIdx] });
      return next;
    });
    showNotif(`Duplicated row ${rowIdx + 1}`);
  };

  const handleMoveRow = (rowIdx, direction) => {
    const target = rowIdx + direction;
    if (target < 0 || target >= (currentSession?.filledData?.length || 0)) return;
    setCurrentSession(prev => {
      const next = { ...prev };
      next.filledData = [...(next.filledData || [])];
      const temp = next.filledData[rowIdx];
      next.filledData[rowIdx] = next.filledData[target];
      next.filledData[target] = temp;
      return next;
    });
  };

  const handleBulkFillApply = () => {
    if (!bulkFillTarget || selectedRows.size === 0) return;
    setCurrentSession(prev => {
      const next = { ...prev };
      next.filledData = [...(next.filledData || [])];
      let seq = bulkFillStart;
      [...selectedRows].sort().forEach((rowIdx, i) => {
        if (bulkFillPattern === 'same') {
          next.filledData[rowIdx][bulkFillTarget] = bulkFillValue;
        } else if (bulkFillPattern === 'sequential') {
          next.filledData[rowIdx][bulkFillTarget] = String(seq + i);
        } else if (bulkFillPattern === 'prefix-seq') {
          next.filledData[rowIdx][bulkFillTarget] = `${bulkFillPrefix}${String(seq + i).padStart(3, '0')}`;
        } else if (bulkFillPattern === 'formula') {
          const baseVal = parseFloat(bulkFillValue) || 0;
          next.filledData[rowIdx][bulkFillTarget] = String(baseVal + i);
        }
      });
      return next;
    });
    showNotif(`Filled ${selectedRows.size} row(s) in column "${bulkFillTarget}"`);
    setShowBulkFill(false);
  };

  const detectDuplicates = (col) => {
    if (!col || !currentSession?.filledData) return;
    const values = {};
    const dups = [];
    currentSession.filledData.forEach((row, i) => {
      const val = row[col];
      if (val !== undefined && val !== '') {
        if (values[val] !== undefined) {
          dups.push({ row: i, value: val, firstRow: values[val] });
        } else {
          values[val] = i;
        }
      }
    });
    setDuplicateResults({ col, duplicates: dups, count: dups.length });
    setDuplicateCheckCol(col);
    if (dups.length === 0) showNotif(`No duplicates found in "${col}"`);
    else showNotif(`Found ${dups.length} duplicate(s) in "${col}"`, 'warning');
  };

  const calculateStats = () => {
    const data = currentSession?.filledData || [];
    const headers = currentSession?.demoHeaders || [];
    const stats = {};
    headers.forEach(h => {
      const vals = data.map(r => r[h]).filter(v => v !== undefined && v !== '');
      const nums = vals.map(Number).filter(n => !isNaN(n));
      stats[h] = {
        total: data.length,
        filled: vals.length,
        empty: data.length - vals.length,
        unique: new Set(vals).size,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
        avg: nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : null,
      };
    });
    return stats;
  };

  const stats = useMemo(() => calculateStats(), [currentSession?.filledData]);

  const validateData = () => {
    const data = currentSession?.filledData || [];
    const headers = currentSession?.demoHeaders || [];
    const errors = {};
    let totalErrors = 0;

    headers.forEach(h => {
      const rule = validationRules[h];
      if (!rule || rule === 'none') return;
      const colErrors = [];
      data.forEach((row, i) => {
        const val = row[h] || '';
        if (rule === 'required' && val.trim() === '') {
          colErrors.push({ row: i, msg: 'Required field empty' });
        } else if (rule === 'numeric' && val && isNaN(Number(val))) {
          colErrors.push({ row: i, msg: 'Not a number' });
        } else if (rule === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          colErrors.push({ row: i, msg: 'Invalid email' });
        } else if (rule === 'phone' && val && !/^\+?[\d\s\-()]{7,15}$/.test(val)) {
          colErrors.push({ row: i, msg: 'Invalid phone' });
        } else if (rule === 'url' && val && !/^https?:\/\/.+/.test(val)) {
          colErrors.push({ row: i, msg: 'Invalid URL' });
        } else if (rule === 'date' && val && isNaN(Date.parse(val))) {
          colErrors.push({ row: i, msg: 'Invalid date' });
        }
      });
      if (colErrors.length) {
        errors[h] = colErrors;
        totalErrors += colErrors.length;
      }
    });

    return { errors, total: totalErrors };
  };

  const validationResults = useMemo(() => validateData(), [currentSession?.filledData, validationRules]);

  const filtData = useMemo(() => {
    const data = currentSession?.filledData || [];
    if (!searchQuery) return data;
    return data.filter(row => {
      const cols = searchColumn === 'all'
        ? Object.keys(row)
        : [searchColumn];
      return cols.some(c =>
        String(row[c] || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [currentSession?.filledData, searchQuery, searchColumn]);

  const isDuplicateRow = (rowIdx) => {
    if (!duplicateResults || duplicateResults.col !== duplicateCheckCol) return false;
    return duplicateResults.duplicates.some(d => d.row === rowIdx);
  };

  const getRowErrors = (rowIdx) => {
    const errs = [];
    Object.entries(validationResults.errors).forEach(([col, colErrs]) => {
      colErrs.forEach(e => {
        if (e.row === rowIdx) errs.push({ col, msg: e.msg });
      });
    });
    return errs;
  };

  const exportExcel = async () => {
    const data = currentSession?.filledData;
    const headers = currentSession?.demoHeaders;
    if (!data?.length || !headers?.length) return;

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ c, r: 0 });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: '000000' } },
          font: { color: { rgb: 'FFFFFF' }, bold: true, name: 'Calibri', sz: 11 },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
    }

    for (let R = 1; R <= data.length; R++) {
      for (let C = 0; C < headers.length; C++) {
        const ref = XLSX.utils.encode_cell({ c: C, r: R });
        const val = data[R - 1]?.[headers[C]];
        if (ws[ref]) {
          ws[ref].s = {
            font: { name: 'Calibri', sz: 11 },
            alignment: {
              horizontal: isNaN(Number(val)) ? 'left' : 'right',
            },
          };
        }
      }
    }

    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length * 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FilledData');
    const name = (currentSession?.demoFileName || 'export').replace(/\.[^.]+$/, '') + '_Filled.xlsx';
    XLSX.writeFile(wb, name);
    await clearSession();
    showNotif(`"${name}" downloaded — database cleared`);
  };

  const exportCSV = () => {
    const data = currentSession?.filledData;
    const headers = currentSession?.demoHeaders;
    if (!data?.length || !headers?.length) return;
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const name = (currentSession?.demoFileName || 'export').replace(/\.[^.]+$/, '') + '_Filled.csv';
    XLSX.writeFile(wb, name);
    clearSession();
    showNotif(`"${name}" downloaded — database cleared`);
  };

  const exportJSON = () => {
    const data = currentSession?.filledData;
    if (!data?.length) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentSession?.demoFileName || 'export').replace(/\.[^.]+$/, '') + '_Filled.json';
    a.click();
    URL.revokeObjectURL(url);
    clearSession();
    showNotif('JSON file downloaded — database cleared');
  };

  const clearSession = async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    setSessions(prev => {
      const { [sid]: _, ...rest } = prev;
      return rest;
    });

    if (configured) {
      try {
        await fetch(`/api/db/data_sessions?session_id=${encodeURIComponent(sid)}`, {
          method: 'DELETE',
        });
      } catch { }
    }

    sessionIdRef.current = null;
    setCurrentSession(null);
    setProcessingLog([]);
    setDbStatus({ demo: false, source: false });
    setSelectedRows(new Set());
    setDuplicateResults(null);
    startNewSession();
  };

  const sess = currentSession;
  const mappedCount = sess ? Object.keys(sess.colMap || {}).length : 0;
  const demoHeaders = sess?.demoHeaders || [];
  const filledData = sess?.filledData || [];
  const missingCols = demoHeaders.filter(h => !sess?.colMap?.[h]);

  const isStepEnabled = (s) => {
    if (s === 'upload-demo') return true;
    if (s === 'upload-source') return currentSession?.demoHeaders?.length > 0;
    if (s === 'mapping') return currentSession?.sourceHeaders?.length > 0;
    if (s === 'processing') return mappedCount > 0;
    if (s === 'preview') return filledData.length > 0;
    if (s === 'export') return filledData.length > 0;
    return false;
  };

  const btnStyle = (enabled, active) => ({
    padding: '8px 16px',
    borderRadius: 24,
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: enabled ? 'pointer' : 'default',
    background: active ? '#107c41' : enabled ? '#1e2535' : '#111827',
    color: active ? '#fff' : enabled ? '#9ca3af' : '#374151',
    opacity: enabled ? 1 : 0.4,
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  });

  const dzBase = {
    border: '2px dashed #2d3748',
    borderRadius: 12,
    padding: '36px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: '#0f1117',
    position: 'relative',
  };

  const panelSection = {
    background: '#161b27',
    border: '1px solid #1e2535',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  };

  const panelHeader = {
    padding: '14px 20px',
    borderBottom: '1px solid #1e2535',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  };

  const stepBadge = {
    width: 28, height: 28, borderRadius: 6,
    background: '#0d3d22', color: '#34d399',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700,
  };

  const toolBtn = (color = '#9ca3af') => ({
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid #2d3748',
    cursor: 'pointer',
    background: '#1e2535',
    color,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  });

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {notification && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          fontSize: 13, fontWeight: 500,
          background: notification.type === 'error' ? '#1a0a0a' : '#0a1f12',
          border: `1px solid ${notification.type === 'error' ? '#450a0a' : '#064e2e'}`,
          color: notification.type === 'error' ? '#f87171' : '#6ee7b7',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>{notification.type === 'error' ? '❌' : '✅'}</span>
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Step Navigator */}
      <div style={{
        background: '#161b27', border: '1px solid #1e2535',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg,#107c41,#0e5c30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#fff',
            }}>M2</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                Fill from Sample — Mark II
              </div>
              <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>
                {currentSession?.demoFileName ?
                  `Demo: ${currentSession.demoFileName} | Source: ${currentSession?.sourceFileName || '—'}` :
                  'No file loaded'
                }
                {sameFileMode && <span style={{ color: '#fbbf24', marginLeft: 8 }}>◆ Same-File Mode</span>}
                {dbStatus.demo && <span style={{ color: '#34d399', marginLeft: 8 }}>● DB</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={clearSession} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid #2d3748', cursor: 'pointer',
              background: 'transparent', color: '#6b7280', fontFamily: 'inherit',
            }}>🔄 New Session</button>
            <button onClick={async () => {
              if (!confirm('Clear all database sessions for this user?')) return;
              if (configured) {
                try {
                  const sid = getSid();
                  await fetch(`/api/db/data_sessions?session_id=${encodeURIComponent(sid)}`, {
                    method: 'DELETE',
                  });
                  showNotif('Database cleared', 'success');
                } catch { showNotif('Failed', 'error'); }
              } else {
                showNotif('Database not configured', 'error');
              }
            }} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid #450a0a', cursor: 'pointer',
              background: 'transparent', color: '#f87171', fontFamily: 'inherit',
            }}>🗑️ Clear DB</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <button
                onClick={() => isStepEnabled(s.key) && setStep(s.key)}
                style={{
                  ...btnStyle(isStepEnabled(s.key), step === s.key),
                  padding: '6px 14px',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: step === s.key ? '#fff' : isStepEnabled(s.key) ? '#107c41' : '#374151',
                  color: step === s.key ? '#107c41' : '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 4,
                }}>{s.num}</span>
                {s.icon} {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <span style={{ color: '#1e2535', fontSize: 10, margin: '0 2px' }}>◀</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== STEP 1: UPLOAD DEMO ===== */}
      {step === 'upload-demo' && (
        <div style={panelSection}>
          <div style={panelHeader}>
            <span style={stepBadge}>1</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Upload Demo / Template File</span>
            {currentSession?.demoHeaders?.length > 0 && (
              <span style={{ fontSize: 11, color: '#34d399', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>●</span> Saved to DB
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              This file defines the <strong style={{ color: '#9ca3af' }}>output structure</strong> —
              columns and first row of data become the template.
              <strong style={{ color: '#fb923c', marginLeft: 8 }}>Same-file mode:</strong> if you upload the same file as source, the format is preserved exactly.
            </p>

            <div
              style={{
                ...dzBase,
                borderColor: dragOverDemo ? '#107c41' : '#2d3748',
                background: dragOverDemo ? '#0a1f12' : '#0f1117',
              }}
              onDragOver={e => { e.preventDefault(); setDragOverDemo(true); }}
              onDragLeave={() => setDragOverDemo(false)}
              onDrop={e => { e.preventDefault(); setDragOverDemo(false); handleDemoUpload(e.dataTransfer.files[0]); }}
              onClick={() => demoInputRef.current?.click()}
            >
              <input ref={demoInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                onChange={e => handleDemoUpload(e.target.files[0])} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>
                Drop demo file here or click to browse
              </div>
              <div style={{ fontSize: 13, color: '#4a5568' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#0d3d22', color: '#34d399', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>XLSX</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#2d1b69', color: '#a78bfa', borderRadius: 4, fontSize: 11, fontWeight: 600, marginLeft: 4 }}>XLS</span>
              </div>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{
                  width: 32, height: 32, border: '2px solid #1e2535', borderTopColor: '#34d399',
                  borderRadius: '50%', animation: 'spin2 0.6s linear infinite', margin: '0 auto 8px',
                }} />
                <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>
                <span style={{ fontSize: 13, color: '#6b7280' }}>Reading file...</span>
              </div>
            )}

            {currentSession?.demoHeaders?.length > 0 && (
              <div style={{
                marginTop: 16, padding: 12, borderRadius: 8,
                background: '#0a1f12', border: '1px solid #064e2e',
                fontSize: 13, color: '#6ee7b7',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✅</span>
                <span>
                  <strong>{currentSession.demoFileName}</strong> — {currentSession.demoHeaders.length} cols, {currentSession.demoRows.length} sample rows
                  <span style={{ color: '#34d399', marginLeft: 8 }}>● DB Stored</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== STEP 2: UPLOAD SOURCE ===== */}
      {step === 'upload-source' && (
        <div style={panelSection}>
          <div style={panelHeader}>
            <span style={stepBadge}>2</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Upload Source Data File</span>
            {currentSession?.sourceHeaders?.length > 0 && (
              <span style={{ fontSize: 11, color: '#34d399', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>●</span> Saved to DB
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              This file contains the <strong style={{ color: '#9ca3af' }}>data</strong> to fill into the template.
              {sheetNames.length > 1 && <span style={{ color: '#fb923c', marginLeft: 8 }}>Multi-sheet detected — will auto-use first sheet.</span>}
              {sameFileMode && <span style={{ color: '#fbbf24', marginLeft: 8 }}>Same file detected — preserving header row.</span>}
            </p>

            <div style={{
              marginBottom: 16, padding: 12, borderRadius: 8,
              background: '#111827', border: '1px solid #1e2535', fontSize: 13,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: '#9ca3af' }}>
                📋 Demo template: <strong style={{ color: '#e2e8f0' }}>{currentSession?.demoFileName}</strong>
                <span style={{ color: '#4a5568', marginLeft: 8 }}>({currentSession?.demoHeaders?.length || 0} cols)</span>
              </span>
              <button onClick={() => setStep('upload-demo')} style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid #2d3748', cursor: 'pointer',
                background: 'transparent', color: '#9ca3af', fontFamily: 'inherit',
              }}>Change Demo</button>
            </div>

            <div
              style={{
                ...dzBase,
                borderColor: dragOverSource ? '#107c41' : '#2d3748',
                background: dragOverSource ? '#0a1f12' : '#0f1117',
              }}
              onDragOver={e => { e.preventDefault(); setDragOverSource(true); }}
              onDragLeave={() => setDragOverSource(false)}
              onDrop={e => { e.preventDefault(); setDragOverSource(false); handleSourceUpload(e.dataTransfer.files[0]); }}
              onClick={() => sourceInputRef.current?.click()}
            >
              <input ref={sourceInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => handleSourceUpload(e.target.files[0])} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>
                Drop source data file here
              </div>
              <div style={{ fontSize: 13, color: '#4a5568' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#0d3d22', color: '#34d399', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>XLSX</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#2d1b69', color: '#a78bfa', borderRadius: 4, fontSize: 11, fontWeight: 600, marginLeft: 4 }}>CSV</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#0d3d22', color: '#34d399', borderRadius: 4, fontSize: 11, fontWeight: 600, marginLeft: 4 }}>XLS</span>
              </div>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{
                  width: 32, height: 32, border: '2px solid #1e2535', borderTopColor: '#34d399',
                  borderRadius: '50%', animation: 'spin2 0.6s linear infinite', margin: '0 auto 8px',
                }} />
                <span style={{ fontSize: 13, color: '#6b7280' }}>Reading file...</span>
              </div>
            )}

            {currentSession?.sourceHeaders?.length > 0 && (
              <div style={{
                marginTop: 16, padding: 12, borderRadius: 8,
                background: '#0a1f12', border: '1px solid #064e2e',
                fontSize: 13, color: '#6ee7b7',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✅</span>
                <span>
                  <strong>{currentSession.sourceFileName}</strong> — {currentSession.sourceHeaders.length} cols, {currentSession.sourceRows.length} data rows
                  {sameFileMode && <span style={{ color: '#fbbf24', marginLeft: 8 }}>◆ Same-file: row 1 preserved as demo</span>}
                  <span style={{ color: '#34d399', marginLeft: 8 }}>● DB Stored</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== STEP 3: MAPPING ===== */}
      {step === 'mapping' && (
        <div style={panelSection}>
          <div style={{
            ...panelHeader, justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={stepBadge}>3</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Column Mapping</span>
              <span style={{
                padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: mappedCount > 0 ? '#0d3d22' : '#1e2535',
                color: mappedCount > 0 ? '#34d399' : '#4a5568',
              }}>{mappedCount}/{demoHeaders.length} mapped</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                if (!currentSession) return;
                const { demoHeaders: dh, sourceHeaders: sh } = currentSession;
                const map = {};
                const used = new Set();
                dh.forEach(h => {
                  const sn = h.toLowerCase().replace(/[\s_\-.]/g, '');
                  for (const src of sh) {
                    const srcn = src.toLowerCase().replace(/[\s_\-.]/g, '');
                    if ((sn === srcn || srcn.includes(sn) || sn.includes(srcn)) && !used.has(src)) {
                      map[h] = src;
                      used.add(src);
                      break;
                    }
                  }
                });
                saveSession({ colMap: map });
              }} style={toolBtn()}>🔄 Auto-Detect</button>
              <button onClick={() => {
                const map = {};
                demoHeaders.forEach((h, i) => {
                  const src = currentSession?.sourceHeaders?.[i];
                  if (src) map[h] = src;
                });
                saveSession({ colMap: map });
              }} style={toolBtn()}>↔️ Sequential</button>
              <button onClick={() => setStep('processing')} disabled={mappedCount === 0} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: mappedCount > 0 ? 'pointer' : 'default',
                background: mappedCount > 0 ? '#107c41' : '#1e2535',
                color: mappedCount > 0 ? '#fff' : '#4a5568',
                opacity: mappedCount > 0 ? 1 : 0.5, fontFamily: 'inherit',
              }}>⚙️ Process →</button>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{
              marginBottom: 16, padding: 12, borderRadius: 8,
              background: '#111827', border: '1px solid #1e2535', fontSize: 12, color: '#6b7280',
            }}>
              <span style={{ color: '#9ca3af' }}>← Map source columns (right dropdown)</span> to <strong style={{ color: '#34d399' }}>demo columns (left)</strong>
              {missingCols.length > 0 && (
                <span style={{ marginLeft: 12, color: '#fb923c' }}>
                  ⚠️ {missingCols.length} unmapped — will use demo data
                </span>
              )}
              {sameFileMode && (
                <span style={{ marginLeft: 12, color: '#fbbf24' }}>
                  ◆ Same-file: first row preserved
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 6 }}>
              {demoHeaders.map(h => {
                const mapped = currentSession?.colMap?.[h];
                return (
                  <div key={h} style={{
                    display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 6,
                    alignItems: 'center', padding: '8px 10px',
                    background: '#0f1117', borderRadius: 8,
                    border: mapped ? '1px solid #064e2e' : '1px solid #1e2535',
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: '#e2e8f0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={h}>{h}</div>
                    <div style={{ color: '#374151', textAlign: 'center', fontSize: 12 }}>←</div>
                    <select
                      value={mapped || ''}
                      onChange={e => {
                        const newMap = { ...currentSession?.colMap, [h]: e.target.value };
                        saveSession({ colMap: newMap });
                      }}
                      style={{
                        width: '100%', fontSize: 11, padding: '4px 6px',
                        background: '#161b27', border: '1px solid #2d3748',
                        borderRadius: 5, color: '#e2e8f0', fontFamily: 'inherit',
                      }}
                    >
                      <option value="">— use demo data —</option>
                      {(currentSession?.sourceHeaders || []).map(src => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Source data preview */}
            {currentSession?.sourceHeaders?.length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ fontSize: 12, color: '#6b7280', cursor: 'pointer', padding: 8 }}>
                  👁️ Preview source data ({currentSession.sourceRows.length} rows)
                </summary>
                <div style={{ overflow: 'auto', maxHeight: 200, marginTop: 8, border: '1px solid #1e2535', borderRadius: 6 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#000', position: 'sticky', top: 0 }}>
                        {currentSession.sourceHeaders.map(h => (
                          <th key={h} style={{ padding: '4px 8px', border: '1px solid #1e2535', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentSession.sourceRows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {currentSession.sourceHeaders.map(h => (
                            <td key={h} style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#d1d5db' }}>{row[h] || ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* ===== STEP 4: PROCESSING ===== */}
      {step === 'processing' && (
        <div style={panelSection}>
          <div style={panelHeader}>
            <span style={stepBadge}>4</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Processing Data</span>
          </div>
          <div style={{ padding: 20, textAlign: 'center' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
                <div style={{
                  width: 48, height: 48, border: '3px solid #1e2535', borderTopColor: '#34d399',
                  borderRadius: '50%', animation: 'spin3 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin3{to{transform:rotate(360deg)}}`}</style>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>Processing data...</div>
                <div style={{
                  background: '#0f1117', border: '1px solid #1e2535', borderRadius: 8,
                  padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, color: '#4ade80', maxHeight: 150, overflowY: 'auto',
                  width: '100%', maxWidth: 500, textAlign: 'left',
                }}>
                  {processingLog.map((l, i) => (
                    <div key={i}>{'>'} {l}</div>
                  ))}
                  <div style={{ opacity: 0.6 }}>{'>'} Working...</div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
                  {sameFileMode
                    ? 'Same-file mode: preserving header row + first row data. Data rows start from row 2.'
                    : 'Mapped source data will be filled into the demo template structure.'}
                </p>
                <button onClick={processFill} style={{
                  marginTop: 16, padding: '12px 32px', borderRadius: 8,
                  fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: '#107c41', color: '#fff', fontFamily: 'inherit',
                  boxShadow: '0 4px 12px rgba(16,124,65,.3)',
                }}>⚙️ Start Processing</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== STEP 5: PREVIEW & EDIT ===== */}
      {step === 'preview' && filledData.length > 0 && (
        <div style={panelSection}>
          {/* Header */}
          <div style={{
            ...panelHeader, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={stepBadge}>5</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Preview & Edit</span>
              <span style={{ fontSize: 12, color: '#4a5568' }}>{filledData.length} rows · {demoHeaders.length} cols</span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: validationResults.total > 0 ? '#450a0a' : '#0a1f12',
                color: validationResults.total > 0 ? '#f87171' : '#6ee7b7',
              }}>
                {validationResults.total > 0 ? `⚠ ${validationResults.total} issues` : '✅ No issues'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setShowStats(!showStats)} style={toolBtn(showStats ? '#34d399' : '#9ca3af')}>
                📊 Stats
              </button>
              <button onClick={() => setShowValidation(!showValidation)} style={toolBtn(showValidation ? '#34d399' : '#9ca3af')}>
                ✅ Validate
              </button>
              <button onClick={() => setShowBulkFill(!showBulkFill)} style={toolBtn(showBulkFill ? '#34d399' : '#9ca3af')}>
                📝 Bulk Fill
              </button>
              <button onClick={() => setStep('mapping')} style={toolBtn()}>◀ Mapping</button>
              <button onClick={() => setStep('export')} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: '#107c41', color: '#fff', fontFamily: 'inherit',
              }}>Export →</button>
            </div>
          </div>

          {/* Stats Panel */}
          {showStats && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2535', background: '#0f1117' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>📊 Column Statistics</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', minWidth: 600 }}>
                  <thead>
                    <tr style={{ color: '#4a5568' }}>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535', textAlign: 'left' }}>Column</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Total</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Filled</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Empty</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Unique</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Min</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Max</th>
                      <th style={{ padding: '4px 8px', border: '1px solid #1e2535' }}>Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoHeaders.map(h => {
                      const s = stats[h];
                      return (
                        <tr key={h}>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#e2e8f0', fontWeight: 600 }}>{h}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#9ca3af', textAlign: 'center' }}>{s?.total || 0}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#34d399', textAlign: 'center' }}>{s?.filled || 0}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: s?.empty > 0 ? '#fb923c' : '#4a5568', textAlign: 'center' }}>{s?.empty || 0}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#a78bfa', textAlign: 'center' }}>{s?.unique || 0}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#60a5fa', textAlign: 'center' }}>{s?.min !== null ? s.min : '—'}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#60a5fa', textAlign: 'center' }}>{s?.max !== null ? s.max : '—'}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #1e2535', color: '#60a5fa', textAlign: 'center' }}>{s?.avg !== null ? s.avg : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Validation Panel */}
          {showValidation && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2535', background: '#0f1117' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                ✅ Validation Rules
                <span style={{ fontSize: 11, color: validationResults.total > 0 ? '#f87171' : '#34d399' }}>
                  {validationResults.total > 0 ? `${validationResults.total} issue(s)` : 'All clear'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {demoHeaders.map(h => (
                  <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <span style={{ color: '#9ca3af' }}>{h}:</span>
                    <select
                      value={validationRules[h] || 'none'}
                      onChange={e => setValidationRules(prev => ({ ...prev, [h]: e.target.value }))}
                      style={{
                        padding: '2px 4px', fontSize: 10, borderRadius: 3,
                        background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0',
                        fontFamily: 'inherit',
                      }}
                    >
                      {VALIDATION_RULES.map(r => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                    {validationResults.errors[h] && (
                      <span style={{ color: '#f87171' }}>⚠{validationResults.errors[h].length}</span>
                    )}
                  </div>
                ))}
              </div>
              {validationResults.total > 0 && (
                <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 11 }}>
                  {Object.entries(validationResults.errors).map(([col, errs]) => (
                    <div key={col} style={{ marginBottom: 4 }}>
                      <span style={{ color: '#fb923c', fontWeight: 600 }}>{col}:</span>
                      {errs.slice(0, 5).map((e, i) => (
                        <span key={i} style={{ color: '#f87171', marginLeft: 8 }}>Row {e.row + 1}: {e.msg}</span>
                      ))}
                      {errs.length > 5 && <span style={{ color: '#4a5568', marginLeft: 4 }}>+{errs.length - 5} more</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bulk Fill Panel */}
          {showBulkFill && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2535', background: '#0f1117' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
                📝 Bulk Fill — applies to selected rows ({selectedRows.size} selected)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>Target Column</div>
                  <select
                    value={bulkFillTarget}
                    onChange={e => setBulkFillTarget(e.target.value)}
                    style={{
                      padding: '4px 8px', fontSize: 11, borderRadius: 4,
                      background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="">— select column —</option>
                    {demoHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>Pattern</div>
                  <select
                    value={bulkFillPattern}
                    onChange={e => setBulkFillPattern(e.target.value)}
                    style={{
                      padding: '4px 8px', fontSize: 11, borderRadius: 4,
                      background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0',
                      fontFamily: 'inherit',
                    }}
                  >
                    {BULK_PATTERNS.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
                {bulkFillPattern === 'same' && (
                  <div>
                    <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>Value</div>
                    <input value={bulkFillValue} onChange={e => setBulkFillValue(e.target.value)}
                      placeholder="Enter value"
                      style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, width: 140, background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0', fontFamily: 'inherit' }} />
                  </div>
                )}
                {bulkFillPattern === 'prefix-seq' && (
                  <>
                    <div>
                      <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>Prefix</div>
                      <input value={bulkFillPrefix} onChange={e => setBulkFillPrefix(e.target.value)}
                        placeholder="e.g. INV-"
                        style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, width: 80, background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0', fontFamily: 'inherit' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>Start</div>
                      <input type="number" value={bulkFillStart} onChange={e => setBulkFillStart(Number(e.target.value))}
                        style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, width: 60, background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0', fontFamily: 'inherit' }} />
                    </div>
                  </>
                )}
                {(bulkFillPattern === 'sequential' || bulkFillPattern === 'formula') && (
                  <div>
                    <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 2 }}>Start</div>
                    <input type="number" value={bulkFillStart} onChange={e => setBulkFillStart(Number(e.target.value))}
                      style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, width: 60, background: '#161b27', border: '1px solid #2d3748', color: '#e2e8f0', fontFamily: 'inherit' }} />
                  </div>
                )}
                <button onClick={handleBulkFillApply} disabled={!bulkFillTarget || selectedRows.size === 0} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: bulkFillTarget && selectedRows.size > 0 ? 'pointer' : 'default',
                  background: bulkFillTarget && selectedRows.size > 0 ? '#107c41' : '#1e2535',
                  color: '#fff', opacity: bulkFillTarget && selectedRows.size > 0 ? 1 : 0.5, fontFamily: 'inherit',
                }}>Apply</button>
              </div>
              {selectedRows.size === 0 && (
                <div style={{ fontSize: 10, color: '#fb923c', marginTop: 6 }}>Select rows in the table using checkboxes</div>
              )}
            </div>
          )}

          {/* Search + Duplicate + Row toolbar */}
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid #1e2535',
            background: '#111827', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Search across all columns..."
              style={{
                flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 12, borderRadius: 6,
                background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0',
                fontFamily: 'inherit',
              }}
            />
            <select
              value={searchColumn}
              onChange={e => setSearchColumn(e.target.value)}
              style={{
                padding: '6px 8px', fontSize: 11, borderRadius: 6,
                background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0',
                fontFamily: 'inherit',
              }}
            >
              <option value="all">All columns</option>
              {demoHeaders.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>

            <div style={{ width: 1, height: 24, background: '#1e2535' }} />

            <select
              value={duplicateCheckCol}
              onChange={e => setDuplicateCheckCol(e.target.value)}
              style={{
                padding: '6px 8px', fontSize: 11, borderRadius: 6,
                background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0',
                fontFamily: 'inherit',
              }}
            >
              <option value="">— check dupes —</option>
              {demoHeaders.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <button onClick={() => detectDuplicates(duplicateCheckCol)} disabled={!duplicateCheckCol} style={{
              ...toolBtn('#f87171'), fontSize: 11, padding: '6px 10px',
              opacity: duplicateCheckCol ? 1 : 0.4,
            }}>🔍 Find Duplicates</button>

            <div style={{ width: 1, height: 24, background: '#1e2535' }} />

            <button onClick={handleDeleteSelected} disabled={selectedRows.size === 0} style={{
              ...toolBtn('#f87171'), fontSize: 11, padding: '6px 10px',
              opacity: selectedRows.size > 0 ? 1 : 0.4,
            }}>🗑️ Delete ({selectedRows.size})</button>
            <button onClick={() => {
              const all = new Set(filtData.map((_, i) => i));
              setSelectedRows(prev => prev.size === all.size ? new Set() : all);
            }} style={{ ...toolBtn(), fontSize: 11, padding: '6px 10px' }}>
              {selectedRows.size === filtData.length ? '☐ Deselect All' : '☑ Select All'}
            </button>

            {searchQuery && (
              <span style={{ fontSize: 11, color: '#4a5568' }}>
                {filtData.length} / {filledData.length} shown
              </span>
            )}
          </div>

          {/* Duplicate results bar */}
          {duplicateResults && duplicateResults.count > 0 && (
            <div style={{
              padding: '8px 16px', borderBottom: '1px solid #1e2535',
              background: '#1a0a0a', fontSize: 12, color: '#f87171',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠️ Found {duplicateResults.count} duplicate(s) in "{duplicateResults.col}"</span>
              <button onClick={() => { setDuplicateResults(null); setDuplicateCheckCol(''); }} style={{
                ...toolBtn(), fontSize: 10, padding: '3px 8px',
              }}>Dismiss</button>
            </div>
          )}

          {/* Info bar */}
          <div style={{ padding: '6px 16px', borderBottom: '1px solid #1e2535', background: '#0a0d14', fontSize: 11, color: '#4a5568', display: 'flex', gap: 16 }}>
            <span style={{ color: '#34d399' }}>✅ Mapped: {mappedCount}</span>
            <span style={{ color: '#fb923c' }}>📋 From Demo: {missingCols.length}</span>
            <span style={{ color: '#60a5fa' }}>📊 Rows: {filledData.length}</span>
            <span style={{ color: '#a78bfa' }}>📏 Filtered: {filtData.length}</span>
            <span style={{ color: '#34d399' }}>✏️ Click cells to edit · Enter to save</span>
          </div>

          {/* Data Table */}
          <div style={{
            overflow: 'auto', maxHeight: '55vh',
            border: '1px solid #1e2535', borderRadius: 8, margin: 12,
          }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', fontFamily: "'JetBrains Mono', monospace" }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: '#000' }}>
                  <th style={{
                    padding: '6px 4px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a',
                    color: '#374151', fontWeight: 400, fontSize: 11,
                    position: 'sticky', left: 0, background: '#000', zIndex: 3, minWidth: 28,
                  }}>
                    <input type="checkbox" onChange={() => {
                      const all = new Set(filtData.map((_, i) => i));
                      setSelectedRows(prev => prev.size === all.size ? new Set() : all);
                    }} checked={selectedRows.size === filtData.length && filtData.length > 0}
                      style={{ accentColor: '#107c41', cursor: 'pointer' }} />
                  </th>
                  <th style={{
                    padding: '6px 4px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a',
                    color: '#374151', fontWeight: 400, fontSize: 11,
                    position: 'sticky', left: 28, background: '#000', zIndex: 3, minWidth: 28,
                  }}>#</th>
                  {demoHeaders.map(h => {
                    const isMapped = sess?.colMap?.[h];
                    const hasRule = validationRules[h] && validationRules[h] !== 'none';
                    const hasErrors = validationResults.errors[h];
                    return (
                      <th key={h} style={{
                        padding: '7px 8px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a',
                        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                        color: hasErrors ? '#f87171' : isMapped ? '#fff' : '#fb923c',
                        background: hasErrors ? 'rgba(248,113,113,0.06)' : isMapped ? 'transparent' : 'rgba(251,146,60,0.06)',
                      }} title={isMapped ? `From: ${sess.colMap[h]}` : 'Filled from demo'}>
                        {h} {!isMapped && '📋'}{hasRule && ' ✓'}
                      </th>
                    );
                  })}
                  <th style={{
                    padding: '7px 4px', borderBottom: '1px solid #1a1a1a',
                    fontSize: 11, color: '#374151', fontWeight: 400, minWidth: 80,
                  }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtData.map((row, ri) => {
                  const actualIdx = currentSession?.filledData?.indexOf(row);
                  const isDup = isDuplicateRow(actualIdx);
                  const rowErrs = getRowErrors(actualIdx);
                  return (
                    <tr key={ri} style={{
                      borderBottom: '1px solid #1e2535',
                      background: isDup ? 'rgba(248,113,113,0.04)' : rowErrs.length > 0 ? 'rgba(251,146,60,0.03)' : selectedRows.has(actualIdx) ? 'rgba(16,124,65,0.06)' : 'transparent',
                    }}>
                      <td style={{
                        padding: '3px 4px', borderRight: '1px solid #1e2535',
                        position: 'sticky', left: 0, background: isDup ? 'rgba(248,113,113,0.04)' : selectedRows.has(actualIdx) ? 'rgba(16,124,65,0.06)' : '#111827', zIndex: 1,
                      }}>
                        <input type="checkbox" checked={selectedRows.has(actualIdx)}
                          onChange={() => {
                            const next = new Set(selectedRows);
                            if (next.has(actualIdx)) next.delete(actualIdx);
                            else next.add(actualIdx);
                            setSelectedRows(next);
                          }}
                          style={{ accentColor: '#107c41', cursor: 'pointer' }} />
                      </td>
                      <td style={{
                        padding: '3px 4px', borderRight: '1px solid #1e2535',
                        color: '#374151', fontSize: 11, textAlign: 'center',
                        position: 'sticky', left: 28, background: isDup ? 'rgba(248,113,113,0.04)' : selectedRows.has(actualIdx) ? 'rgba(16,124,65,0.06)' : '#111827', zIndex: 1,
                      }}>
                        {actualIdx !== undefined ? actualIdx + 1 : ri + 1}
                        {isDup && <span style={{ color: '#f87171', marginLeft: 4 }}>⚠</span>}
                        {rowErrs.length > 0 && <span style={{ color: '#fb923c', marginLeft: 2 }}>!</span>}
                      </td>
                      {demoHeaders.map(h => {
                        const cellVal = row[h] !== undefined && row[h] !== '' ? row[h] : '';
                        const isEmpty = cellVal === '';
                        return (
                          <td
                            key={h}
                            contentEditable
                            suppressContentEditableWarning
                            style={{
                              padding: '3px 6px', borderRight: '1px solid #1e2535',
                              minWidth: 90, outline: 'none', cursor: 'text',
                              color: isEmpty ? '#4a5568' : '#d1d5db',
                              background: isEmpty ? 'rgba(251,146,60,0.04)' : isDup ? 'rgba(248,113,113,0.04)' : 'transparent',
                              fontStyle: isEmpty ? 'italic' : 'normal',
                            }}
                            onBlur={e => handleCellEdit(actualIdx, h, e.target.innerText)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                const next = e.target.closest('td').nextElementSibling;
                                if (next) next.focus();
                              }
                            }}
                          >{cellVal || '(empty)'}</td>
                        );
                      })}
                      <td style={{ padding: '2px 4px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => handleInsertRow(actualIdx)} style={{ ...toolBtn(), fontSize: 9, padding: '2px 5px' }} title="Insert row below">➕</button>
                        <button onClick={() => handleDuplicateRow(actualIdx)} style={{ ...toolBtn(), fontSize: 9, padding: '2px 5px' }} title="Duplicate row">📋</button>
                        <button onClick={() => handleMoveRow(actualIdx, -1)} style={{ ...toolBtn(), fontSize: 9, padding: '2px 5px' }} title="Move up">↑</button>
                        <button onClick={() => handleMoveRow(actualIdx, 1)} style={{ ...toolBtn(), fontSize: 9, padding: '2px 5px' }} title="Move down">↓</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{
            padding: '8px 16px', borderTop: '1px solid #1e2535',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, color: '#4a5568',
          }}>
            <span>
              {searchQuery ? `Showing ${filtData.length} of ${filledData.length} rows` : `${filledData.length} rows`}
              {selectedRows.size > 0 && ` · ${selectedRows.size} selected`}
              {duplicateResults?.count > 0 && ` · ${duplicateResults.count} duplicates`}
            </span>
            <span style={{ color: '#6b7280' }}>Enter to save · Tab to navigate · Select rows for bulk ops</span>
          </div>
        </div>
      )}

      {/* ===== STEP 6: EXPORT ===== */}
      {step === 'export' && filledData.length > 0 && (
        <div style={panelSection}>
          <div style={panelHeader}>
            <span style={stepBadge}>6</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>Export & Clear Database</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{
              marginBottom: 20, padding: 16, borderRadius: 8,
              background: '#0f1117', border: '1px solid #1e2535',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: 'Total Rows', value: filledData.length, color: '#60a5fa' },
                  { label: 'Columns', value: demoHeaders.length, color: '#34d399' },
                  { label: 'DB Status', value: 'Active', color: '#fbbf24' },
                  { label: 'Mode', value: sameFileMode ? 'Same-File' : 'Standard', color: '#a78bfa' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: 10 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#4a5568', marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              padding: 14, borderRadius: 8, marginBottom: 20,
              background: '#0a1f12', border: '1px solid #064e2e',
              fontSize: 13, color: '#6ee7b7',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>ℹ️</span>
              <span>Download will <strong style={{ color: '#fb923c' }}>auto-clear the database</strong> for this session.</span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={exportExcel} style={{
                padding: '12px 28px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#107c41,#0e5c30)',
                color: '#fff', fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(16,124,65,.3)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                📊 Download Excel & Clear DB
              </button>
              <button onClick={exportCSV} style={{
                padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                border: '1px solid #2d3748', cursor: 'pointer',
                background: '#1e2535', color: '#e2e8f0', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                📄 Download CSV & Clear DB
              </button>
              <button onClick={exportJSON} style={{
                padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                border: '1px solid #2d3748', cursor: 'pointer',
                background: '#1e2535', color: '#e2e8f0', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                📋 Download JSON & Clear DB
              </button>
              <button onClick={() => setStep('preview')} style={{
                padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                border: '1px solid #2d3748', cursor: 'pointer',
                background: 'transparent', color: '#9ca3af', fontFamily: 'inherit',
              }}>◀ Back to Edit</button>
            </div>

            <div style={{
              marginTop: 20, padding: 12, borderRadius: 8,
              background: '#111827', border: '1px solid #1e2535', fontSize: 12, color: '#4a5568',
            }}>
              <strong style={{ color: '#9ca3af' }}>Process Summary:</strong>
              <div style={{ marginTop: 4, lineHeight: 1.8 }}>
                <div>📋 Demo: {currentSession?.demoFileName}</div>
                <div>📦 Source: {currentSession?.sourceFileName}</div>
                <div>🔗 Mapped: {mappedCount}/{demoHeaders.length}</div>
                <div>📋 From Demo: {missingCols.length} cols</div>
                <div>🆔 Unique Codes: {sess?.rules?.clientCodeUnique ? 'Yes' : 'No'}</div>
                <div>✅ Validation: {validationResults.total > 0 ? `${validationResults.total} issues` : 'All clear'}</div>
                {duplicateResults && <div>⚠️ Duplicates: {duplicateResults.count} in "{duplicateResults.col}"</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
