import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import axios from 'axios';

function getSid() {
  let sid = localStorage.getItem('superapp-session-id');
  if (!sid) { sid = crypto.randomUUID(); localStorage.setItem('superapp-session-id', sid); }
  return sid;
}

// Same-origin: vite proxies /api in dev, Express serves it in production.
const API_BASE = '';

const ADMIN_COLUMNS = [
  'Name', 'Mobile', 'Email', 'NationalId', 'Address', 'Zone', 'Conn.Type',
  'Server', 'Prot.Type', 'Profile', 'UserName', 'Password', 'R.Address',
  'C.Type', 'Package', 'B.Status', 'M.Bill', 'Bill.Month', 'Join.Date',
  'Exp.Date', 'Assign2Emp.', 'DateOfBirth(Opt.)', 'FatherName(Opt.)',
  'MotherName(Opt.)', 'Occupation(Opt.)',
];

const MAC_COLUMNS = [
  'Name', 'Mobile', 'Email', 'NationalId', 'Address', 'Zone', 'Conn.Type',
  'Server', 'Prot.Type', 'Profile', 'UserName', 'Password', 'R.Address',
  'C.Type', 'Package', 'V.ToDate', 'B.Status', 'M.Bill', 'Bill.Month',
  'Join.Date', 'Exp.Date',
];

const FROZEN_COLS = 4;

export default function IspExcelValidator() {
  const historyEnabled = true;

  const [file, setFile] = useState(null);
  const [templateType, setTemplateType] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState(null);
  const [focusCell, setFocusCell] = useState(null);
  const [editedData, setEditedData] = useState(null);
  const getErrMsg = (err) => {
    const val = err?.response?.data?.error || err?.response?.data?.details || err?.message || err?.statusText || '';
    return typeof val === 'string' ? val : val?.message || JSON.stringify(val);
  };

  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState('');
  const [timelineStep, setTimelineStep] = useState(0);
  const [autoFixReport, setAutoFixReport] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [focusedRow, setFocusedRow] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [validationRecordId, setValidationRecordId] = useState(null);

  const fileRef = useRef(null);
  const inputRefs = useRef({});
  const tableRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const sid = getSid();
    fetch(`/api/db/isp_validations?session_id=${encodeURIComponent(sid)}`)
      .then(r => r.json())
      .then(({ rows }) => {
        if (rows) setHistory(rows.map(r => ({
          id: r.id, template_type: r.template_type, file_name: r.file_name,
          total_rows: r.total_rows, error_count: r.error_count, warning_count: r.warning_count,
          valid_count: r.valid_count, auto_fix_count: r.auto_fix_count, created_at: r.created_at,
        })));
      })
      .catch(() => {});
  }, []);

  const columns = templateType === 'admin' ? ADMIN_COLUMNS : MAC_COLUMNS;
  const currentData = editedData || validation?.data || [];
  const allColumns = columns;

  const rowErrorMap = useMemo(() => {
    const map = {};
    if (!validation) return map;
    validation.errors.forEach(e => {
      if (!map[e.row]) map[e.row] = {};
      if (!map[e.row][e.column]) map[e.row][e.column] = [];
      map[e.row][e.column].push({ msg: e.message, type: 'error' });
    });
    validation.warnings.forEach(w => {
      if (!map[w.row]) map[w.row] = {};
      if (!map[w.row][w.column]) map[w.row][w.column] = [];
      map[w.row][w.column].push({ msg: w.message, type: 'warning' });
    });
    return map;
  }, [validation]);

  const fixedCounts = useMemo(() => {
    if (!validation || !editedData) return null;
    const original = validation.data;
    const counts = { phone: 0, date: 0, billMonth: 0, status: 0, bill: 0, other: 0 };
    editedData.forEach((row, i) => {
      const orig = original[i];
      if (!orig) return;
      Object.keys(row).forEach(col => {
        if (row[col] !== orig[col]) {
          if (col === 'Mobile') counts.phone++;
          else if (['Join.Date', 'Exp.Date', 'DateOfBirth(Opt.)', 'V.ToDate'].includes(col)) counts.date++;
          else if (col === 'Bill.Month') counts.billMonth++;
          else if (col === 'B.Status') counts.status++;
          else if (col === 'M.Bill') counts.bill++;
          else counts.other++;
        }
      });
    });
    return counts;
  }, [validation, editedData]);

  function getCellIssues(rowIdx, col) {
    return rowErrorMap[rowIdx]?.[col] || [];
  }

  function getRowIssues(rowIdx) {
    const a = rowIdx;
    const errs = validation?.errors?.filter(e => e.row === a) || [];
    const warns = validation?.warnings?.filter(w => w.row === a) || [];
    return { errors: errs, warnings: warns };
  }

  function getRowStatus(rowIdx) {
    const issues = getRowIssues(rowIdx);
    if (issues.errors.length > 0) return 'error';
    if (issues.warnings.length > 0) return 'warning';
    return 'valid';
  }

  const rowStatusCounts = useMemo(() => {
    if (!validation) return {};
    const c = { valid: 0, warning: 0, error: 0 };
    validation.data.forEach((_, i) => { c[getRowStatus(i + 2)]++; });
    return c;
  }, [validation]);

  const filteredRows = useMemo(() => {
    if (!currentData.length) return [];
    let rows = currentData.map((row, i) => ({ row, idx: i + 2 }));
    if (activeTab !== 'all') rows = rows.filter(({ idx }) => getRowStatus(idx) === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(({ row }) =>
        Object.values(row).some(v => String(v).toLowerCase().includes(q))
      );
    }
    return rows;
  }, [currentData, activeTab, search, validation]);

  const successRate = validation
    ? ((rowStatusCounts.valid || 0) / validation.data.length * 100).toFixed(1)
    : 0;

  const autoFixedRows = editedData && validation
    ? editedData.filter((row, i) => {
        const orig = validation.data[i];
        return orig && Object.keys(row).some(k => row[k] !== orig[k]);
      }).length
    : 0;

  async function handleValidate() {
    if (!file) { setError('Please select a file.'); return; }
    setError('');
    setLoading(true);
    setEditedData(null);
    setFocusCell(null);
    setTimelineStep(1);
    setValidationRecordId(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('templateType', templateType);
      const { data: validationResult } = await axios.post(`${API_BASE}/api/isp/validate`, formData);

      setValidation(validationResult);
      setTimelineStep(2);

      // Save to history
      const validCount = validationResult.data ? validationResult.data.length - validationResult.errors.filter(e => e.row).length : 0;
      try {
        const sid = getSid();
        const res = await fetch('/api/db/isp_validations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sid,
            template_type: templateType,
            file_name: file.name,
            file_url: '',
            total_rows: validationResult.data?.length || 0,
            error_count: validationResult.errors?.length || 0,
            warning_count: validationResult.warnings?.length || 0,
            valid_count: validCount,
            data: validationResult.data || [],
            errors: validationResult.errors || [],
            warnings: validationResult.warnings || [],
          }),
        });
        const savedRecord = await res.json();
        if (savedRecord?.id) setValidationRecordId(savedRecord.id);

        // Refresh history
        const histRes = await fetch(`/api/db/isp_validations?session_id=${encodeURIComponent(sid)}`);
        const { rows } = await histRes.json();
        if (rows) setHistory(rows.map(r => ({
          id: r.id, template_type: r.template_type, file_name: r.file_name,
          total_rows: r.total_rows, error_count: r.error_count, warning_count: r.warning_count,
          valid_count: r.valid_count, auto_fix_count: r.auto_fix_count, created_at: r.created_at,
        })));
      } catch {}
    } catch (err) {
      setError(getErrMsg(err));
      setValidation(null);
      setTimelineStep(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoFix() {
    if (!validation || !validation.data) return;
    setLoading(true);
    setAutoFixReport(null);

    try {
      const { data } = await axios.post(`${API_BASE}/api/isp/autofix`, {
        data: currentData, templateType,
      });
      setEditedData(data.fixedData);

      const beforeCount = (validation?.errors?.length || 0) + (validation?.warnings?.length || 0);
      const afterCount = data.remainingErrors.length + data.remainingWarnings.length;
      const fixed = beforeCount - afterCount;

      setAutoFixReport({
        fixed,
        remaining: afterCount,
        fixedData: data.fixedData,
        errors: data.remainingErrors,
        warnings: data.remainingWarnings,
        ...countFixes(data.fixedData, currentData),
      });

      setValidation(prev => ({
        ...prev,
        errors: data.remainingErrors,
        warnings: data.remainingWarnings,
        data: data.fixedData,
      }));

      setTimelineStep(3);
      setShowSuccess(true);
      setSuccessMsg(`✨ Fixed ${fixed} issue${fixed !== 1 ? 's' : ''}`);
      setTimeout(() => setShowSuccess(false), 2000);

      // Update DB record with auto-fix counts
      if (validationRecordId) {
        try {
          const fixCounts = countFixes(data.fixedData, currentData);
          const totalFixed = fixCounts.phone + fixCounts.date + fixCounts.billMonth + fixCounts.status + fixCounts.bill + fixCounts.other;
          await fetch(`/api/db/isp_validations/${validationRecordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: {
                auto_fix_count: totalFixed,
                data: data.fixedData,
                errors: data.remainingErrors,
                warnings: data.remainingWarnings,
                error_count: data.remainingErrors.length,
                warning_count: data.remainingWarnings.length,
              },
            }),
          });
          // Refresh history
          const sid = getSid();
          const histRes = await fetch(`/api/db/isp_validations?session_id=${encodeURIComponent(sid)}`);
          const { rows } = await histRes.json();
          if (rows) setHistory(rows.map(r => ({
            id: r.id, template_type: r.template_type, file_name: r.file_name,
            total_rows: r.total_rows, error_count: r.error_count, warning_count: r.warning_count,
            valid_count: r.valid_count, auto_fix_count: r.auto_fix_count, created_at: r.created_at,
          })));
        } catch {}
      }
    } catch (err) {
      setError(getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  function countFixes(newData, oldData) {
    const counts = { phone: 0, date: 0, billMonth: 0, status: 0, bill: 0, other: 0 };
    newData.forEach((row, i) => {
      const orig = oldData[i];
      if (!orig) return;
      Object.keys(row).forEach(col => {
        if (row[col] !== orig[col]) {
          if (col === 'Mobile') counts.phone++;
          else if (['Join.Date', 'Exp.Date', 'DateOfBirth(Opt.)', 'V.ToDate'].includes(col)) counts.date++;
          else if (col === 'Bill.Month') counts.billMonth++;
          else if (col === 'B.Status') counts.status++;
          else if (col === 'M.Bill') counts.bill++;
          else counts.other++;
        }
      });
    });
    return counts;
  }

  async function handleDownload() {
    if (!currentData.length) return;
    setLoading(true);
    try {
      const { data: blobData } = await axios.post(`${API_BASE}/api/isp/download`, {
        data: currentData, templateType,
      }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([blobData]));
      const a = document.createElement('a');
      a.href = url; a.download = `fixed-clients-${templateType}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      setTimelineStep(5);
    } catch (err) {
      setError(getErrMsg(err));
    } finally { setLoading(false); }
  }

  function goToCell(rowIdx, col) {
    setFocusedRow(rowIdx);
    setEditingCell({ row: rowIdx, col });
    setTimeout(() => {
      const key = `${rowIdx}-${col}`;
      const el = inputRefs.current[key];
      if (el) { el.focus(); el.select(); }
      const rowEl = document.getElementById(`row-${rowIdx}`);
      if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setFocusedRow(null), 3000);
  }

  function commitEdit(rowIdx, col, value) {
    setEditingCell(null);
    const dataArr = editedData
      ? [...editedData]
      : (validation?.data ? validation.data.map(r => ({ ...r })) : []);
    const ri = dataArr.findIndex((_, i) => i + 2 === rowIdx);
    if (ri === -1) return;
    dataArr[ri] = { ...dataArr[ri], [col]: value };
    setEditedData(dataArr);
    setTimelineStep(4);
  }

  function handleCellKeyDown(e, rowIdx, col) {
    const colIndex = allColumns.indexOf(col);
    const rowIndex = filteredRows.findIndex(r => r.idx === rowIdx);

    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(rowIdx, col, e.target.value);
      const nextRow = filteredRows[rowIndex + 1];
      if (nextRow) goToCell(nextRow.idx, col);
      return;
    }
    if (e.key === 'Escape') { setEditingCell(null); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let nextCol = colIndex + dir;
      if (nextCol < 0 || nextCol >= allColumns.length) {
        const nextRow = filteredRows[rowIndex + (e.shiftKey ? -1 : 1)];
        if (nextRow) goToCell(nextRow.idx, e.shiftKey ? allColumns[allColumns.length - 1] : allColumns[0]);
        return;
      }
      goToCell(rowIdx, allColumns[nextCol]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = filteredRows[rowIndex + 1];
      if (nextRow) goToCell(nextRow.idx, col);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = filteredRows[rowIndex - 1];
      if (prevRow) goToCell(prevRow.idx, col);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (colIndex > 0) goToCell(rowIdx, allColumns[colIndex - 1]);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (colIndex < allColumns.length - 1) goToCell(rowIdx, allColumns[colIndex + 1]);
    }
  }

  function isEditing(rowIdx, col) {
    return editingCell?.row === rowIdx && editingCell?.col === col;
  }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      setFile(f); setValidation(null); setEditedData(null); setError(''); setTimelineStep(0);
    } else setError('Please drop a valid .xlsx file.');
  }

  const groupedErrors = useMemo(() => {
    if (!validation) return [];
    const groups = {};
    validation.errors.forEach(e => {
      const k = `${e.row}`;
      if (!groups[k]) groups[k] = { row: e.row, errors: [], warnings: [] };
      groups[k].errors.push(e);
    });
    validation.warnings.forEach(w => {
      const k = `${w.row}`;
      if (!groups[k]) groups[k] = { row: w.row, errors: [], warnings: [] };
      groups[k].warnings.push(w);
    });
    return Object.values(groups).sort((a, b) => a.row - b.row);
  }, [validation]);

  function handleTableKeyDown(e) {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }

  function handleCellBlur(rowIdx, col, value) {
    setTimeout(() => {
      if (!editingCell || (editingCell.row === rowIdx && editingCell.col === col)) {
        commitEdit(rowIdx, col, value);
      }
    }, 150);
  }

  const stats = validation ? [
    { label: 'Total Rows', count: validation.data.length.toLocaleString(), color: 'var(--text-primary)', icon: '📋' },
    { label: 'Imported', count: (rowStatusCounts.valid || 0).toLocaleString(), color: '#16a34a', icon: '✅' },
    { label: 'Auto Fixed', count: autoFixedRows.toLocaleString(), color: '#2563eb', icon: '⚡' },
    { label: 'Need Fix', count: (rowStatusCounts.error || 0).toLocaleString(), color: '#dc2626', icon: '🔧' },
    { label: 'Success', count: `${successRate}%`, color: successRate > 90 ? '#16a34a' : successRate > 70 ? '#d97706' : '#dc2626', icon: '🎯' },
  ] : [];

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto' }} onKeyDown={handleTableKeyDown}>
      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        @keyframes popIn { 0% { transform: scale(0.8); opacity: 0; } 70% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeSlideIn { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes checkmark { 0% { stroke-dashoffset: 50; } 100% { stroke-dashoffset: 0; } }
        tr.row-focused { outline: 2px solid var(--accent); outline-offset: -2px; }
        td.cell-error { box-shadow: inset 2px 0 0 #dc2626; }
        td.cell-warning { box-shadow: inset 2px 0 0 #d97706; }
        td.cell-edited { background: rgba(37,99,235,0.06) !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #999; }
        .success-toast { animation: popIn 0.3s ease-out; }
        .report-enter { animation: fadeSlideIn 0.3s ease-out; }
        tr:hover td { background: rgba(128,128,128,0.03) !important; }
        input.cell-input:focus { box-shadow: 0 0 0 3px rgba(170,59,255,0.25); outline: none; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
          ISP Excel Validator
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Upload, validate, auto-fix, and download ISP client data with precision.
        </p>
      </div>

      {/* Timeline Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        {[
          { step: 0, label: 'Upload', icon: '📤' },
          { step: 1, label: 'Validate', icon: '🔍' },
          { step: 2, label: 'Auto-Fix', icon: '⚡' },
          { step: 3, label: 'Review', icon: '✏️' },
          { step: 4, label: 'Download', icon: '⬇' },
        ].map((s, i) => {
          const isDone = timelineStep > s.step;
          const isCurrent = timelineStep === s.step;
          return (
            <div key={s.step} style={{
              flex: 1, padding: '12px 8px', textAlign: 'center',
              borderRight: i < 4 ? '1px solid var(--border-color)' : 'none',
              background: isDone ? 'rgba(22,163,74,0.08)' : isCurrent ? 'var(--accent-bg)' : 'transparent',
              borderBottom: isCurrent ? `2px solid var(--accent)` : isDone ? '2px solid #16a34a' : '2px solid transparent',
              transition: 'all 0.3s',
            }}>
              <span style={{ fontSize: 18, display: 'block', marginBottom: 2 }}>
                {isDone ? '✅' : s.icon}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: isDone ? '#16a34a' : isCurrent ? 'var(--accent)' : 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.3px',
              }}>
                {isDone ? 'Done' : s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="success-toast" style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: '#16a34a', color: '#fff', padding: '14px 32px', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(22,163,74,0.3)', fontWeight: 600, fontSize: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" fill="none" />
            <path d="M7 12l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 50, strokeDashoffset: 0, animation: 'checkmark 0.4s ease-out' }} />
          </svg>
          {successMsg}
        </div>
      )}

      {/* Upload Card */}
      <div className="card" style={{
        padding: 0, marginBottom: 20, overflow: 'hidden',
        border: dragging ? '2px dashed var(--accent)' : '1px solid var(--border-color)',
        transition: 'border 0.2s',
      }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div style={{ padding: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Excel File (.xlsx)
            </label>
            <div style={{
              border: '2px dashed var(--border-color)', borderRadius: 'var(--radius)',
              padding: '12px 16px', cursor: 'pointer',
              background: dragging ? 'var(--accent-bg)' : 'var(--bg)',
              borderColor: dragging ? 'var(--accent)' : 'var(--border-color)',
              transition: 'all 0.2s',
            }} onClick={() => fileRef.current?.click()}>
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                    <p style={{ fontSize: 11, margin: 0, color: 'var(--text-secondary)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setFile(null); setValidation(null); setEditedData(null); setTimelineStep(0); }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>✕</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 22, display: 'block', marginBottom: 2 }}>📂</span>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{dragging ? 'Drop file here' : 'Drop .xlsx or click to browse'}</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".xlsx"
                onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); setValidation(null); setEditedData(null); setError(''); setTimelineStep(0); } }}
                style={{ display: 'none' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Template
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['admin', 'mac'].map(t => (
                <button key={t} onClick={() => { setTemplateType(t); setValidation(null); setEditedData(null); setError(''); setTimelineStep(0); }}
                  style={{
                    padding: '9px 16px', borderRadius: 'var(--radius)', border: `2px solid ${templateType === t ? 'var(--accent)' : 'var(--border-color)'}`,
                    background: templateType === t ? 'var(--accent-bg)' : 'transparent',
                    color: templateType === t ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  {t === 'admin' ? '👤 Admin' : '🖥️ Mac'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={handleValidate} disabled={loading || !file}
              style={{
                padding: '9px 22px', borderRadius: 'var(--radius)', border: 'none',
                background: loading ? 'var(--text-secondary)' : 'var(--accent)',
                color: '#fff', fontWeight: 600, fontSize: 12, cursor: loading || !file ? 'not-allowed' : 'pointer',
                opacity: (!file || loading) ? 0.6 : 1, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
              {loading ? '⏳' : '🔍'} {loading ? 'Processing...' : 'Validate'}
            </button>
            {validation && (
              <button onClick={handleAutoFix} disabled={loading}
                style={{
                  padding: '9px 22px', borderRadius: 'var(--radius)', border: 'none',
                  background: loading ? 'var(--text-secondary)' : '#16a34a',
                  color: '#fff', fontWeight: 600, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                ⚡ Auto-Fix
              </button>
            )}
            {currentData.length > 0 && (
              <button onClick={handleDownload} disabled={loading}
                style={{
                  padding: '9px 22px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 12,
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                ⬇ Download
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div style={{ height: 3, background: 'var(--border-color)' }}>
            <div style={{ height: '100%', width: '45%', background: 'linear-gradient(90deg, var(--accent), #16a34a)', borderRadius: 2, animation: 'shimmer 1.2s infinite' }} />
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="card" style={{
          padding: '12px 18px', marginBottom: 16,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
          borderRadius: 'var(--radius)',
        }}>
          <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>❌</span> {error}
          </p>
        </div>
      )}

      {/* Stats Cards */}
      {validation && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {stats.map(stat => (
            <div key={stat.label} className="card" style={{
              padding: '12px 18px', flex: '1 1 130px', minWidth: 110,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>{stat.icon}</span>
              <div>
                <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: stat.color }}>{stat.count}</p>
                <p style={{ fontSize: 11, margin: 0, color: 'var(--text-secondary)', fontWeight: 500 }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search + Filter Bar */}
      {validation && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.5 }}>🔍</span>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search any column..." style={{
                width: '100%', padding: '8px 14px 8px 32px', borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
              }} />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)', padding: 0,
              }}>✕</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: `All (${validation.data.length})`, color: 'var(--text-primary)' },
              { key: 'valid', label: `✅ ${rowStatusCounts.valid || 0}`, color: '#16a34a' },
              { key: 'warning', label: `🟡 ${rowStatusCounts.warning || 0}`, color: '#d97706' },
              { key: 'error', label: `🔴 ${rowStatusCounts.error || 0}`, color: '#dc2626' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${activeTab === tab.key ? tab.color : 'var(--border-color)'}`,
                  background: activeTab === tab.key ? `${tab.color}15` : 'transparent',
                  color: activeTab === tab.key ? tab.color : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {filteredRows.length} / {validation.data.length} rows
          </span>
        </div>
      )}

      {/* Main Content */}
      {validation && (
        <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
          {/* Data Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div ref={tableRef} style={{ overflow: 'auto', maxHeight: '55vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)' }}>
                    <th style={{ ...thStyle, width: 32, position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-card)' }}>#</th>
                    {allColumns.map((col, ci) => {
                      const isFrozen = ci < FROZEN_COLS;
                      const hasIssues = validation && filteredRows.some(r => getCellIssues(r.idx, col).length > 0);
                      return (
                        <th key={col} style={{
                          ...thStyle,
                          minWidth: col === 'Name' ? 150 : col === 'Email' ? 170 : 110,
                          position: 'sticky', top: 0, zIndex: isFrozen ? 9 : 2,
                          left: isFrozen ? (ci === 0 ? 32 : 32 + ci * 80) : undefined,
                          background: 'var(--bg-card)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {hasIssues && <span style={{ color: '#dc2626', fontSize: 9 }}>●</span>}
                            {col}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(({ row, idx }) => {
                    const status = getRowStatus(idx);
                    const rowIssues = getRowIssues(idx);
                    const rowBg = focusedRow === idx ? 'rgba(170,59,255,0.06)'
                      : status === 'error' ? 'rgba(220,38,38,0.04)'
                      : status === 'warning' ? 'rgba(217,119,6,0.04)'
                      : 'transparent';

                    const edited = editedData && validation
                      ? !Object.keys(row).every(k => row[k] === validation.data.find((_, i) => i + 2 === idx)?.[k])
                      : false;

                    return (
                      <tr key={idx} id={`row-${idx}`} className={focusedRow === idx ? 'row-focused' : ''}
                        style={{ background: rowBg, borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                        {/* Row number */}
                        <td style={{
                          ...tdStyle, width: 32, position: 'sticky', left: 0,
                          background: rowBg, zIndex: 1, fontWeight: 600,
                          color: 'var(--text-secondary)', fontSize: 10, textAlign: 'center',
                        }}>
                          {idx - 1}
                        </td>

                        {/* Data cells */}
                        {allColumns.map((col, ci) => {
                          const cellIssues = getCellIssues(idx, col);
                          const isFrozen = ci < FROZEN_COLS;
                          const isEditingCell = isEditing(idx, col);
                          const cellVal = row[col] ?? '';

                          let cellBg = 'transparent';
                          let cellBorder = 'transparent';
                          let indicator = null;

                          if (cellIssues.length > 0) {
                            const hasError = cellIssues.some(i => i.type === 'error');
                            const hasWarning = cellIssues.some(i => i.type === 'warning');
                            cellBg = hasError ? 'rgba(220,38,38,0.12)' : 'rgba(217,119,6,0.12)';
                            cellBorder = hasError ? '2px solid rgba(220,38,38,0.5)' : '2px solid rgba(217,119,6,0.5)';
                            indicator = hasError ? '🔴' : '🟡';
                          } else if (validation && cellVal !== '') {
                            cellBg = 'rgba(22,163,74,0.08)';
                            indicator = edited ? '🟢' : '✅';
                          } else if (edited) {
                            cellBg = 'rgba(22,163,74,0.08)';
                            indicator = '🟢';
                          }

                          return (
                            <td key={col} style={{
                              ...tdStyle,
                              background: cellBg,
                              borderBottom: '1px solid var(--border-color)',
                              borderLeft: cellBorder,
                              borderRight: cellBorder,
                              cursor: 'pointer',
                              position: isFrozen ? 'sticky' : 'static',
                              left: isFrozen ? (ci === 0 ? 32 : 32 + ci * 80) : undefined,
                              zIndex: isFrozen ? 1 : 0,
                              padding: 0,
                              minWidth: 80,
                            }}
                              onClick={() => !isEditingCell && goToCell(idx, col)}
                              title={cellIssues.length > 0 ? cellIssues.map(i => `${i.type === 'error' ? '❌' : '⚠️'} ${i.msg}`).join('\n') : (edited ? '✅ Manually edited - valid' : (validation && cellVal !== '' ? '✅ Valid' : ''))}
                            >
                              {isEditingCell ? (
                                <input ref={el => { inputRefs.current[`${idx}-${col}`] = el; }}
                                  defaultValue={cellVal}
                                  onBlur={e => handleCellBlur(idx, col, e.target.value)}
                                  onKeyDown={e => handleCellKeyDown(e, idx, col)}
                                  className="cell-input"
                                  style={{
                                    width: '100%', padding: '7px 8px', border: `2px solid var(--accent)`,
                                    borderRadius: 3, outline: 'none', fontSize: 12,
                                    background: '#fff', color: '#111',
                                    boxSizing: 'border-box',
                                  }} />
                              ) : (
                                <div style={{
                                  padding: '7px 8px', display: 'flex', alignItems: 'center', gap: 5,
                                  minHeight: 30,
                                }}>
                                  {indicator && <span style={{ fontSize: 10, flexShrink: 0, lineHeight: 1 }}>{indicator}</span>}
                                  <span style={{
                                    color: cellVal ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontStyle: cellVal ? 'normal' : 'italic',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {cellVal || '—'}
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredRows.length === 0 && (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {search ? 'No rows match your search.' : `No ${activeTab !== 'all' ? activeTab : ''} rows found.`}
                </div>
              )}
            </div>
          </div>

          {/* Error Panel */}
          {groupedErrors.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 18px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-card)',
              }}>
                <span style={{ fontSize: 15 }}>📋</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  Issues ({validation.errors.length + validation.warnings.length})
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Click row buttons to jump to cell
                </span>
              </div>
              <div style={{ maxHeight: 280, overflow: 'auto' }}>
                {groupedErrors.map(group => {
                  const rowData = validation.data.find((_, i) => i + 2 === group.row);
                  const name = rowData?.Name || `Row ${group.row - 1}`;
                  return (
                    <div key={group.row} style={{
                      padding: '10px 18px', borderBottom: '1px solid var(--border-color)',
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: group.errors?.length > 0 ? 'rgba(220,38,38,0.12)' : 'rgba(217,119,6,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                      }}>
                        {group.errors?.length > 0 ? '❌' : '⚠️'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 3px', fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                          Row #{group.row - 1} — {name}
                        </p>
                        {group.errors?.map((e, i) => (
                          <p key={`e-${i}`} style={{ margin: '1px 0', fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <span>·</span> <strong>{e.column}:</strong> {e.message}
                            <button onClick={() => goToCell(group.row, e.column)}
                              style={{
                                marginLeft: 4, padding: '2px 8px', fontSize: 10, borderRadius: 4,
                                border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)',
                                color: '#dc2626', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                              }}>
                              Go to Cell →
                            </button>
                          </p>
                        ))}
                        {group.warnings?.map((w, i) => (
                          <p key={`w-${i}`} style={{ margin: '1px 0', fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <span>·</span> <strong>{w.column}:</strong> {w.message}
                            <button onClick={() => goToCell(group.row, w.column)}
                              style={{
                                marginLeft: 4, padding: '2px 8px', fontSize: 10, borderRadius: 4,
                                border: '1px solid rgba(217,119,6,0.3)', background: 'rgba(217,119,6,0.06)',
                                color: '#d97706', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                              }}>
                              Go to Cell →
                            </button>
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {validation && (
              <button onClick={handleAutoFix} disabled={loading}
                style={{
                  padding: '11px 26px', borderRadius: 'var(--radius)', border: 'none',
                  background: loading ? 'var(--text-secondary)' : '#16a34a',
                  color: '#fff', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                ⚡ Auto-Fix All Issues
              </button>
            )}
            {currentData.length > 0 && (
              <button onClick={handleDownload} disabled={loading}
                style={{
                  padding: '11px 26px', borderRadius: 'var(--radius)',
                  border: `1.5px solid ${validation?.errors?.length > 0 ? 'var(--border-color)' : '#16a34a'}`,
                  background: 'var(--bg-card)',
                  color: validation?.errors?.length > 0 ? 'var(--text-secondary)' : '#16a34a',
                  fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                ⬇ Download Fixed Excel
              </button>
            )}
          </div>

          {/* History Panel */}
          {historyEnabled && history.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 18px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-card)',
              }}>
                <span style={{ fontSize: 15 }}>📜</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  Recent Validations
                </span>
                <button onClick={() => setShowHistory(!showHistory)}
                  style={{
                    marginLeft: 'auto', background: 'none', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)', padding: '4px 12px', fontSize: 11, cursor: 'pointer',
                    color: 'var(--text-secondary)', fontWeight: 500,
                  }}>
                  {showHistory ? 'Hide' : `Show All (${history.length})`}
                </button>
              </div>
              {showHistory && (
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {history.map(rec => (
                    <div key={rec.id} style={{
                      padding: '10px 18px', borderBottom: '1px solid var(--border-color)',
                      display: 'flex', gap: 12, alignItems: 'center', fontSize: 12,
                    }}>
                      <span style={{ fontSize: 16 }}>{rec.template_type === 'admin' ? '👤' : '🖥️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rec.file_name}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                          {rec.total_rows} rows · {rec.valid_count} valid · {rec.error_count} errors · {rec.warning_count} warnings · {rec.auto_fix_count || 0} auto-fixed
                        </p>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(rec.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!validation && !error && (
        <div className="card" style={{
          padding: '56px 40px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, marginBottom: 4,
          }}>📊</div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            ISP Client Import Validator
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
            Upload an <strong>.xlsx</strong> file with ISP client data, select your template, and validate.
            Auto-fix common formatting issues and download a clean file.
          </p>
          <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>📋 Admin (25 cols)</span>
            <span>📋 Mac (21 cols)</span>
            <span>⚡ Auto-fix</span>
            <span>⌨️ Tab/Arrow nav</span>
          </div>
        </div>
      )}

      {/* Auto-Fix Report Modal */}
      {autoFixReport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setAutoFixReport(null)}>
          <div className="report-enter" style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 0, maxWidth: 460, width: '90%',
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              background: 'linear-gradient(135deg, #16a34a, #15803d)', padding: '24px 28px',
              textAlign: 'center', color: '#fff',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 24,
              }}>✅</div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#fff' }}>Auto-Fix Complete</h3>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>
                {autoFixReport.fixed} issue{autoFixReport.fixed !== 1 ? 's' : ''} fixed successfully
              </p>
            </div>
            <div style={{ padding: '20px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                {[
                  { label: 'Phone Numbers', count: autoFixReport.phone || 0, icon: '📱' },
                  { label: 'Date Formats', count: autoFixReport.date || 0, icon: '📅' },
                  { label: 'Bill Month', count: autoFixReport.billMonth || 0, icon: '📆' },
                  { label: 'Status Values', count: autoFixReport.status || 0, icon: '🏷️' },
                  { label: 'Bill Amounts', count: autoFixReport.bill || 0, icon: '💰' },
                  { label: 'Other Fixes', count: autoFixReport.other || 0, icon: '🔧' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>{item.label}</p>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{item.count}</p>
                    </div>
                  </div>
                ))}
              </div>
              {autoFixReport.remaining > 0 && (
                <div style={{
                  marginTop: 16, padding: '12px 16px', background: 'rgba(220,38,38,0.06)',
                  borderRadius: 'var(--radius)', border: '1px solid rgba(220,38,38,0.15)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>🔧</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
                      {autoFixReport.remaining} issue{autoFixReport.remaining !== 1 ? 's' : ''} require manual editing
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                      Click on any cell above to edit, or fix in your source file and re-upload.
                    </p>
                  </div>
                </div>
              )}
              <button onClick={() => setAutoFixReport(null)}
                style={{
                  width: '100%', marginTop: 16, padding: '10px', borderRadius: 'var(--radius)',
                  border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600,
                  fontSize: 13, cursor: 'pointer',
                }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 10,
  color: 'var(--text-secondary)',
  borderBottom: '2px solid var(--border-color)',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  userSelect: 'none',
};

const tdStyle = {
  padding: '6px 8px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 200,
};
