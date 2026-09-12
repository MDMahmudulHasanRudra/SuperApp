const XLSX = require('xlsx');

const TEMPLATES = {
  admin: {
    columns: [
      { name: 'Name', mandatory: true },
      { name: 'Mobile', mandatory: true },
      { name: 'Email', mandatory: true },
      { name: 'NationalId', mandatory: false },
      { name: 'Address', mandatory: false },
      { name: 'Zone', mandatory: true },
      { name: 'Conn.Type', mandatory: true },
      { name: 'Server', mandatory: true },
      { name: 'Prot.Type', mandatory: true },
      { name: 'Profile', mandatory: true },
      { name: 'UserName', mandatory: true },
      { name: 'Password', mandatory: true },
      { name: 'R.Address', mandatory: false },
      { name: 'C.Type', mandatory: true },
      { name: 'Package', mandatory: true },
      { name: 'B.Status', mandatory: true },
      { name: 'M.Bill', mandatory: true },
      { name: 'Bill.Month', mandatory: true },
      { name: 'Join.Date', mandatory: true },
      { name: 'Exp.Date', mandatory: true },
      { name: 'Assign2Emp.', mandatory: true },
      { name: 'DateOfBirth(Opt.)', mandatory: false },
      { name: 'FatherName(Opt.)', mandatory: false },
      { name: 'MotherName(Opt.)', mandatory: false },
      { name: 'Occupation(Opt.)', mandatory: false },
    ],
  },
  mac: {
    columns: [
      { name: 'Name', mandatory: true },
      { name: 'Mobile', mandatory: true },
      { name: 'Email', mandatory: true },
      { name: 'NationalId', mandatory: false },
      { name: 'Address', mandatory: false },
      { name: 'Zone', mandatory: true },
      { name: 'Conn.Type', mandatory: true },
      { name: 'Server', mandatory: true },
      { name: 'Prot.Type', mandatory: true },
      { name: 'Profile', mandatory: true },
      { name: 'UserName', mandatory: true },
      { name: 'Password', mandatory: true },
      { name: 'R.Address', mandatory: false },
      { name: 'C.Type', mandatory: true },
      { name: 'Package', mandatory: true },
      { name: 'V.ToDate', mandatory: false },
      { name: 'B.Status', mandatory: true },
      { name: 'M.Bill', mandatory: true },
      { name: 'Bill.Month', mandatory: true },
      { name: 'Join.Date', mandatory: true },
      { name: 'Exp.Date', mandatory: true },
    ],
  },
};

function getTemplate(type) {
  return TEMPLATES[type];
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMobile(mobile) {
  const cleaned = String(mobile).replace(/[\s\-\(\)]/g, '');
  return /^01\d{9}$/.test(cleaned);
}

function isValidIPv4(ip) {
  if (!ip || String(ip).trim() === '') return true;
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

function isValidDateFormat(val) {
  if (!val || String(val).trim() === '') return false;
  const d = parseDate(String(val).trim());
  return d !== null;
}

function isValidExpDate(val) {
  if (!val || String(val).trim() === '') return false;
  const s = String(val).trim();
  if (/^(0?[1-9]|[12][0-9]|3[01])$/.test(s)) return true;
  return isValidDateFormat(s);
}

function isValidBillMonth(val) {
  if (!val || String(val).trim() === '') return false;
  return /^(0[1-9]|1[0-2])-\d{4}$/.test(String(val).trim());
}

const DATE_FORMATS = [
  /^(\d{2})-(\d{2})-(\d{4})$/,      // DD-MM-YYYY
  /^(\d{2})\/(\d{2})\/(\d{4})$/,     // DD/MM/YYYY
  /^(\d{4})-(\d{2})-(\d{2})$/,       // YYYY-MM-DD
  /^(\d{2})-(\d{2})-(\d{2})$/,       // DD-MM-YY
];

function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  for (const re of DATE_FORMATS) {
    const m = s.match(re);
    if (m) {
      const d = m[0].length === 8
        ? new Date(`20${m[3]}-${m[2]}-${m[1]}`)
        : new Date(`${m[3]}-${m[2]}-${m[1]}`);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function formatDate(d) {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function parseValue(val) {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (typeof val === 'number' && !isNaN(val)) {
    if (Number.isInteger(val) && val > 100000) return String(val);
    return str;
  }
  return str;
}

function validateRow(row, template, rowIndex) {
  const errors = [];
  const warnings = [];

  const colMap = {};
  Object.keys(row).forEach(k => { colMap[k] = row[k]; });

  template.columns.forEach(col => {
    const val = parseValue(row[col.name]);

    if (col.mandatory) {
      if (val === '' || val === undefined || val === null) {
        errors.push({ column: col.name, message: `${col.name} is required.` });
        return;
      }
    } else {
      if (val === '' || val === undefined || val === null) return;
    }

    switch (col.name) {
      case 'Mobile': {
        const cleaned = String(val).replace(/[\s\-\(\)]/g, '');
        if (!isValidMobile(cleaned)) {
          errors.push({ column: 'Mobile', message: 'Invalid phone number. Expected 11 digits starting with 01.' });
        }
        break;
      }
      case 'Email': {
        if (!isValidEmail(val)) {
          errors.push({ column: 'Email', message: 'Invalid email format.' });
        }
        break;
      }
      case 'NationalId': {
        if (val !== '' && !/^\d+$/.test(val)) {
          warnings.push({ column: 'NationalId', message: 'NationalId should be numeric.' });
        }
        break;
      }
      case 'R.Address': {
        if (!isValidIPv4(val)) {
          errors.push({ column: 'R.Address', message: 'Invalid IPv4 address format.' });
        }
        break;
      }
      case 'B.Status': {
        const lower = val.toLowerCase();
        if (!['active', 'inactive', 'suspended'].includes(lower)) {
          errors.push({ column: 'B.Status', message: 'Must be Active, Inactive, or Suspended.' });
        }
        break;
      }
      case 'M.Bill': {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) {
          errors.push({ column: 'M.Bill', message: 'Must be a positive number.' });
        }
        break;
      }
      case 'Bill.Month': {
        if (!isValidBillMonth(val)) {
          const pd = parseDate(val);
          if (pd) {
            warnings.push({ column: 'Bill.Month', message: `Expected MM-YYYY format (e.g. 07-2026). Received a full date — will auto-fix.` });
          } else {
            errors.push({ column: 'Bill.Month', message: 'Invalid format. Expected MM-YYYY (e.g. 07-2026).' });
          }
        }
        break;
      }
      case 'Exp.Date': {
        if (!isValidExpDate(val)) {
          errors.push({ column: col.name, message: `Invalid expiry date. Expected DD-MM-YYYY or a day number (1-31).` });
        }
        break;
      }
      case 'Join.Date':
      case 'DateOfBirth(Opt.)':
      case 'V.ToDate': {
        if (!isValidDateFormat(val)) {
          errors.push({ column: col.name, message: `Invalid date format. Expected DD-MM-YYYY.` });
        }
        break;
      }
    }
  });

  if (row['Exp.Date']) {
    const ed = parseDate(row['Exp.Date']);
    const isDayNum = /^(0?[1-9]|[12][0-9]|3[01])$/.test(String(row['Exp.Date']).trim());
    if (ed) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (ed < today) {
        warnings.push({ column: 'Exp.Date', message: 'Exp.Date is in the past — subscription may have expired.' });
      }
      const oneYearFromNow = new Date(today);
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      if (ed > oneYearFromNow) {
        warnings.push({ column: 'Exp.Date', message: 'Exp.Date is more than 1 year away — verify correctness.' });
      }
    } else if (!isDayNum) {
      warnings.push({ column: 'Exp.Date', message: 'Exp.Date is not a recognizable date format.' });
    }
  }

  if (row['Join.Date'] && row['Exp.Date']) {
    const jd = parseDate(row['Join.Date']);
    const ed = parseDate(row['Exp.Date']);
    if (jd && ed && ed <= jd) {
      errors.push({ column: 'Exp.Date', message: 'Exp.Date must be after Join.Date.' });
    }
  }

  return { errors, warnings };
}

function validateAll(data, templateType) {
  const template = getTemplate(templateType);
  if (!template) return { valid: false, errors: [], warnings: [], data, message: 'Invalid template type.' };

  const errors = [];
  const warnings = [];

  data.forEach((row, i) => {
    const result = validateRow(row, template, i + 2);
    result.errors.forEach(e => errors.push({ row: i + 2, ...e }));
    result.warnings.forEach(w => warnings.push({ row: i + 2, ...w }));
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data,
  };
}

function autoFixRow(row, templateType) {
  const template = getTemplate(templateType);
  const fixed = { ...row };
  const unfixable = [];

  template.columns.forEach(col => {
    const val = parseValue(fixed[col.name]);
    if (val === '' && !col.mandatory) return;

    let newVal = val;

    switch (col.name) {
      case 'Mobile': {
        let cleaned = String(newVal).replace(/\D/g, '');
        // Drop an international prefix first: 00880…, +880… and 880… are all the
        // same local 01… number. Trimming to 11 digits before this would keep the
        // country code and cut real digits off the end.
        if (cleaned.startsWith('00880')) cleaned = cleaned.slice(5);
        else if (cleaned.startsWith('880')) cleaned = cleaned.slice(3);
        // A local number typed without its leading zero (1812345679).
        if (cleaned.length === 10 && cleaned.startsWith('1')) cleaned = '0' + cleaned;
        // Trailing junk on an otherwise valid local number.
        if (cleaned.length > 11 && cleaned.startsWith('01')) cleaned = cleaned.slice(0, 11);
        if (/^01\d{9}$/.test(cleaned)) newVal = cleaned;
        break;
      }
      case 'B.Status': {
        const lower = String(newVal).toLowerCase().trim();
        if (['active', 'inactive', 'suspended'].includes(lower)) {
          newVal = lower.charAt(0).toUpperCase() + lower.slice(1);
        }
        break;
      }
      case 'Bill.Month': {
        if (/^(0[1-9]|1[0-2])-\d{4}$/.test(String(newVal).trim())) {
          break;
        }
        const pd = parseDate(newVal);
        if (pd) {
          const mm = String(pd.getMonth() + 1).padStart(2, '0');
          const yyyy = pd.getFullYear();
          newVal = `${mm}-${yyyy}`;
        }
        break;
      }
      case 'Exp.Date': {
        const dayMatch = String(newVal).trim().match(/^(0?[1-9]|[12][0-9]|3[01])$/);
        if (dayMatch) {
          newVal = dayMatch[1];
        } else {
          const pd = parseDate(newVal);
          if (pd) {
            newVal = formatDate(pd);
          }
        }
        break;
      }
      case 'Join.Date':
      case 'DateOfBirth(Opt.)':
      case 'V.ToDate': {
        const pd = parseDate(newVal);
        if (pd) {
          newVal = formatDate(pd);
        }
        break;
      }
      case 'M.Bill': {
        const num = parseFloat(newVal);
        if (!isNaN(num) && num >= 0) {
          newVal = String(num);
        }
        break;
      }
    }

    fixed[col.name] = newVal;
  });

  return fixed;
}

function autoFixAll(data, templateType) {
  const template = getTemplate(templateType);
  const fixedData = data.map(row => autoFixRow(row, templateType));
  const validation = validateAll(fixedData, templateType);

  return {
    fixedData,
    remainingErrors: validation.errors,
    remainingWarnings: validation.warnings,
  };
}

function dataToSheet(data, templateType) {
  const template = getTemplate(templateType);
  const colNames = template.columns.map(c => c.name);

  const wsData = [colNames];
  data.forEach(row => {
    const r = colNames.map(c => String(row[c] ?? ''));
    wsData.push(r);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');

  // Write all cells as text to prevent Excel auto-conversion
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  // Set column widths
  ws['!cols'] = colNames.map(() => ({ wch: 18 }));

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: false });
  return buf;
}

function parseFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { error: 'No sheets found in the file.' };

  const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });

  if (jsonData.length < 2) {
    return { error: 'File must have a header row and at least one data row.' };
  }

  const headers = jsonData[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    const isEmpty = row.every(cell => String(cell).trim() === '');
    if (isEmpty) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? String(row[idx]).trim() : '';
    });
    rows.push(obj);
  }

  return { headers, rows };
}

function validateHeaders(headers, templateType) {
  const template = getTemplate(templateType);
  const expected = template.columns.map(c => c.name);

  const missing = expected.filter(e => !headers.includes(e));
  const unknown = headers.filter(h => !expected.includes(h));
  const seen = {};
  const duplicates = [];
  headers.forEach(h => {
    if (seen[h]) duplicates.push(h);
    seen[h] = true;
  });

  return { expected, missing, unknown, duplicates, valid: missing.length === 0 && duplicates.length === 0 };
}

module.exports = {
  TEMPLATES,
  getTemplate,
  validateAll,
  autoFixAll,
  dataToSheet,
  parseFile,
  validateHeaders,
};
