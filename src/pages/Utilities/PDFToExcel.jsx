import { useState, useRef } from 'react';
import { convertPDFToExcel } from '../../utils/pdfConverter';
import { useDbStorage } from '../../hooks/useDbStorage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import CopyButton from '../../components/common/CopyButton';

const OCR_LANGUAGES = [
  { value: 'eng', label: 'English' },
  { value: 'fra', label: 'French' },
  { value: 'deu', label: 'German' },
  { value: 'spa', label: 'Spanish' },
  { value: 'ita', label: 'Italian' },
  { value: 'por', label: 'Portuguese' },
  { value: 'nld', label: 'Dutch' },
  { value: 'jpn', label: 'Japanese' },
  { value: 'kor', label: 'Korean' },
  { value: 'chi_sim', label: 'Chinese (Simplified)' },
  { value: 'rus', label: 'Russian' },
  { value: 'ara', label: 'Arabic' },
  { value: 'hin', label: 'Hindi' },
];

export default function PDFToExcel() {
  const [file, setFile] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState('');
  const [language, setLanguage] = useState('eng');
  const [history, setHistory] = useDbStorage('pdf_conversions', 'superapp-pdf-conversions', []);
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      setFile(null);
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError('File too large. Maximum size is 20MB.');
      setFile(null);
      return;
    }
    setFile(selected);
    setError('');
    setResult(null);
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsConverting(true);
    setError('');
    setProgress('Reading PDF...');
    try {
      const data = await convertPDFToExcel(file, (page, total, step) => {
        setProgress(step === 'ocr'
          ? `📷 OCR scanning page ${page} of ${total}...`
          : `📄 Extracting text page ${page} of ${total}...`);
      }, language);
      setResult(data);
      setProgress(data.usedOcr
        ? `Done — ${data.rows.length} rows from ${data.pageCount} pages (OCR used for image-based pages)`
        : `Done — ${data.rows.length} rows from ${data.pageCount} pages`);

      setHistory([{
        filename: file.name,
        pageCount: data.pageCount,
        rowCount: data.rows.length,
        usedOcr: data.usedOcr,
        language,
        timestamp: new Date().toISOString(),
      }, ...history].slice(0, 20));
    } catch (err) {
      setError(err.message || 'Conversion failed. The PDF may be encrypted or contain only images.');
    }
    setIsConverting(false);
  };

  const handleExport = () => {
    if (!result?.blobUrl) return;
    const a = document.createElement('a');
    a.href = result.blobUrl;
    a.download = file ? file.name.replace(/\.pdf$/i, '') + '_converted.xlsx' : 'converted.xlsx';
    a.click();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const dropTargetStyle = {
    border: '2px dashed var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    padding: 40,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: file ? 'rgba(67,97,238,0.05)' : 'var(--bg-secondary)',
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>📄➡️📊 PDF to Excel Converter</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Extract text from any PDF — text-based documents or scanned images — and convert to Excel spreadsheets.
        Uses OCR for image-based pages automatically.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>OCR Language:</label>
          <select value={language} onChange={e => setLanguage(e.target.value)}
            style={{ width: 200, fontSize: 13, padding: '8px 12px' }}>
            {OCR_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Used for scanned/image-based pages
          </span>
        </div>
        <div
          style={dropTargetStyle}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)';
            const dropped = e.dataTransfer.files[0];
            if (dropped?.type === 'application/pdf') { setFile(dropped); setError(''); setResult(null); }
            else setError('Please drop a PDF file.');
          }}
        >
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange}
            style={{ display: 'none' }} />
          {file ? (
            <div>
              <p style={{ fontSize: 36, marginBottom: 8 }}>📄</p>
              <p style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {formatSize(file.size)} · {file.type}
              </p>
              <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                style={{ marginTop: 8 }}>Remove</button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 40, marginBottom: 8 }}>📄</p>
              <p style={{ fontWeight: 600, fontSize: 14 }}>Drop a PDF here or click to browse</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Max 20MB</p>
            </div>
          )}
        </div>

        <button className="btn-primary" onClick={handleConvert} disabled={!file || isConverting}
          style={{ width: '100%', marginTop: 16, height: 44, fontSize: 15 }}>
          {isConverting ? `⏳ ${progress}` : '🚀 Convert to Excel'}
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      {isConverting && <LoadingSpinner text={progress} />}

      {result && !isConverting && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>✅ Conversion Complete</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                {result.rows.length} rows · {result.headers.length} columns · {result.pageCount} pages
                {result.usedOcr && <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: 11 }}>📷 OCR Applied</span>}
                {!result.usedOcr && <span className="badge badge-success" style={{ marginLeft: 8, fontSize: 11 }}>📄 Text Extraction</span>}
              </p>
            </div>
            <button className="btn-primary" onClick={handleExport} style={{ height: 40 }}>
              📥 Download .xlsx
            </button>
          </div>

          {result.rows.length > 0 && (
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', maxHeight: 300, overflowY: 'auto' }}>
              <div style={{
                display: 'flex', padding: '8px 14px', fontWeight: 600, fontSize: 12,
                background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)',
                position: 'sticky', top: 0,
              }}>
                {result.headers.map((h, i) => (
                  <span key={i} style={{ flex: 1, minWidth: 100, wordBreak: 'break-word' }}>{h}</span>
                ))}
              </div>
              {result.rows.slice(0, 50).map((row, ri) => (
                <div key={ri} style={{
                  display: 'flex', padding: '6px 14px', fontSize: 12,
                  borderBottom: '1px solid var(--border-color)',
                  background: ri % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                }}>
                  {result.headers.map((h, ci) => (
                    <span key={ci} style={{ flex: 1, minWidth: 100, wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                      {row[h] || ''}
                    </span>
                  ))}
                </div>
              ))}
              {result.rows.length > 50 && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Showing first 50 of {result.rows.length} rows
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <CopyButton text={JSON.stringify(result.rows.slice(0, 10), null, 2)} label="Copy Preview (10 rows)" />
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📜 Conversion History</h3>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {history.map((h, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: '1px solid var(--border-color)', fontSize: 13,
              }}>
                <span style={{ fontWeight: 600 }}>{h.filename}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {h.rowCount} rows · {new Date(h.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
