const express = require('express');
const cors = require('cors');
const dns = require('dns');
const net = require('net');
let whois;
try { whois = require('whois'); } catch { whois = null; }
const { RouterOSClient } = require('mikro-routeros');
const snmp = require('net-snmp');
const https = require('https');
const http = require('http');
const tls = require('tls');
const multer = require('multer');
const { validateAll, autoFixAll, dataToSheet, parseFile, validateHeaders } = require('./_isp-validator');

// Targets reach `exec` as part of a shell command string, so only real hostnames
// and IP addresses may pass — otherwise "8.8.8.8; cat /etc/passwd" runs too.
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
function isValidHost(value) {
  const v = String(value ?? '').trim();
  if (!v || v.length > 253) return false;
  return net.isIP(v) !== 0 || HOSTNAME_RE.test(v);
}

const isServerless = !process.env.PORT || !!process.env.VERCEL;
const upload = multer({
  storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
});

function execAsync(cmd, opts = {}) {
  if (isServerless) return Promise.reject(new Error('exec not available in serverless'));
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(cmd, { timeout: 10000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(err.message), { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.post('/api/ping', async (req, res) => {
  const { target, count = 4 } = req.body;
  if (!target) return res.status(400).json({ error: 'Target is required' });
  if (!isValidHost(target)) return res.status(400).json({ error: 'Target must be a hostname or IP address' });
  if (isServerless) {
    const simTimes = Array.from({ length: count }, () => 10 + Math.random() * 190);
    const simPkts = simTimes.map((t, i) => ({ seq: i + 1, time: t, status: 'Success' }));
    return res.json({ status: 'reachable', target, sent: count, received: count, loss: '0%', times: simTimes, packets: simPkts, raw: '', min: Math.min(...simTimes), max: Math.max(...simTimes), avg: simTimes.reduce((a, b) => a + b, 0) / count, note: 'Simulated (serverless)' });
  }
  try {
    const n = Math.min(Math.max(parseInt(count, 10) || 4, 1), 20);
    const cmd = process.platform === 'win32' ? `ping -n ${n} ${target}` : `ping -c ${n} ${target}`;
    const { stdout } = await execAsync(cmd);
    const lines = stdout.split('\n');
    const packets = [];
    const times = [];
    lines.forEach(line => {
      const winMatch = line.match(/Reply from\s+(\S+):\s*bytes=\d+\s+time[=<](\d+\.?\d*)\s*ms\s+TTL=(\d+)/i);
      if (winMatch) {
        packets.push({ seq: packets.length + 1, ip: winMatch[1], time: parseFloat(winMatch[2]), ttl: parseInt(winMatch[3]), status: 'Success' });
        times.push(parseFloat(winMatch[2]));
        return;
      }
      const nixMatch = line.match(/(\d+)\s*bytes from\s+(\S+):\s*icmp_seq=(\d+)\s+ttl=(\d+)\s+time[=<](\d+\.?\d*)\s*ms/i);
      if (nixMatch) {
        packets.push({ seq: parseInt(nixMatch[3]), ip: nixMatch[2], time: parseFloat(nixMatch[5]), ttl: parseInt(nixMatch[4]), status: 'Success' });
        times.push(parseFloat(nixMatch[5]));
        return;
      }
      if (line.match(/Request timed out/i) || line.match(/Destination host unreachable/i)) {
        packets.push({ seq: packets.length + 1, time: null, status: 'Lost' });
      }
    });
    const lostLine = lines.find(l => l.includes('loss')) || '';
    const lossMatch = lostLine.match(/(\d+)%/);
    res.json({
      status: times.length > 0 ? 'reachable' : 'unreachable',
      target,
      sent: count, received: times.length,
      loss: lossMatch ? lossMatch[1] + '%' : ((count - times.length) / count * 100).toFixed(0) + '%',
      times, packets, raw: stdout,
      min: times.length ? Math.min(...times) : null,
      max: times.length ? Math.max(...times) : null,
      avg: times.length ? (times.reduce((a, b) => a + b, 0) / times.length) : null,
    });
  } catch {
    res.json({ status: 'unreachable', sent: count, received: 0, loss: '100%', times: [], packets: [], raw: '' });
  }
});

app.post('/api/scan-port', async (req, res) => {
  const { target, ports } = req.body;
  if (!target || !ports) return res.status(400).json({ error: 'Target and ports required' });
  const results = [];
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
          results.push({ port, status: 'open' });
          socket.destroy();
          resolve();
        });
        socket.on('timeout', () => {
          results.push({ port, status: 'filtered' });
          socket.destroy();
          reject();
        });
        socket.on('error', () => {
          results.push({ port, status: 'closed' });
          reject();
        });
        socket.connect(port, target);
      });
    } catch {}
  }
  res.json({ target, results });
});

app.get('/api/dns', (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Domain required' });
  const types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'];
  const results = [];
  let pending = types.length;
  types.forEach(type => {
    dns.resolve(domain, type, (err, addresses) => {
      if (!err && addresses) {
        addresses.forEach(addr => {
          results.push({ type, name: domain, value: typeof addr === 'object' ? JSON.stringify(addr) : String(addr), ttl: 300 });
        });
      }
      pending--;
      if (pending === 0) res.json({ domain, records: results });
    });
  });
});

app.get('/api/whois', (req, res) => {
  if (!whois) return res.status(500).json({ error: 'whois module not available' });
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Query required' });
  whois.lookup(query, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    const lines = data.split('\n').filter(l => l.trim());
    const fields = {};
    lines.forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.substring(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
        const val = line.substring(idx + 1).trim();
        if (!fields[key]) fields[key] = val;
      }
    });
    res.json({ query, data: fields });
  });
});

app.get('/api/traceroute', async (req, res) => {
  const { target } = req.query;
  if (!target) return res.status(400).json({ error: 'Target required' });
  if (!isValidHost(target)) return res.status(400).json({ error: 'Target must be a hostname or IP address' });
  if (isServerless) return res.json({ target, hops: [], raw: '', note: 'Traceroute requires shell access — not available in serverless.' });
  try {
    const cmd = process.platform === 'win32' ? `tracert -d ${target}` : `traceroute -n ${target}`;
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    const lines = stdout.split('\n');
    const hops = [];
    lines.forEach(line => {
      const hopMatch = line.match(/^\s*(\d+)\s+/);
      if (!hopMatch) return;
      const rtts = line.match(/<?(\d+|<?1)\.?\d*\s*ms/g) || [];
      const ipMatch = line.match(/((?:\d{1,3}\.){3}\d{1,3})/);
      hops.push({
        hop: parseInt(hopMatch[1]),
        ip: ipMatch ? ipMatch[1] : '*',
        rtt1: rtts[0] ? rtts[0].replace(/[<>\s]/g, '') : '*',
        rtt2: rtts[1] ? rtts[1].replace(/[<>\s]/g, '') : '*',
        rtt3: rtts[2] ? rtts[2].replace(/[<>\s]/g, '') : '*',
        hostname: line.split(/\s{2,}/).pop()?.trim() || '',
      });
    });
    res.json({ target, hops, raw: stdout });
  } catch { res.json({ target, hops: [], raw: '', note: 'Traceroute failed' }); }
});

app.get('/api/ip-info', async (req, res) => {
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    res.json(data);
  } catch {
    try {
      const response = await fetch('https://ip-api.com/json/');
      const data = await response.json();
      res.json({
        ip: data.query,
        city: data.city,
        region: data.regionName,
        country: data.country,
        org: data.isp,
        timezone: data.timezone,
        asn: data.as,
        latitude: data.lat,
        longitude: data.lon,
      });
    } catch {
      res.json({ error: 'Could not fetch IP info' });
    }
  }
});

// === MIKROTIK API CHECKER ===
app.post('/api/mikrotik/test', async (req, res) => {
  const { host, port = 8728, username, password } = req.body;
  if (!host || !username || !password) return res.status(400).json({ error: 'Host, username, and password are required' });
  if (!isValidHost(host)) return res.status(400).json({ error: 'Host must be a hostname or IP address' });

  const diagnostics = [];
  const addDiag = (phase, status, message, detail = null) => {
    diagnostics.push({ phase, status, message, detail });
  };

  // Phase 1: Ping reachability — informational only. Plenty of RouterOS boxes
  // drop ICMP while the API port answers fine, so a silent ping must not abort
  // the check; the port test below is the real gate.
  try {
    if (isServerless) throw new Error('skip');
    const { stdout } = await execAsync(process.platform === 'win32' ? `ping -n 2 ${host}` : `ping -c 2 ${host}`);
    if (!/ttl[=:]|time[=<]/i.test(stdout)) {
      addDiag('ping', 'warn', `${host} did not answer ICMP — continuing, the API may still be reachable`, stdout?.substring(0, 400) || '');
    } else {
      addDiag('ping', 'pass', `Host ${host} is reachable`);
    }
  } catch (e) {
    if (isServerless || e.message === 'skip') {
      addDiag('ping', 'pass', `Skipped ping (serverless) — trying direct TCP connection`);
    } else {
      addDiag('ping', 'warn', `${host} did not answer ICMP — continuing, the API may still be reachable`);
    }
  }

  // Phase 2: Port open check
  try {
    await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.on('connect', () => {
        addDiag('port', 'pass', `Port ${port} is open`);
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        addDiag('port', 'fail', `Port ${port} is filtered (no response)`);
        socket.destroy();
        reject(new Error('Filtered'));
      });
      socket.on('error', (err) => {
        addDiag('port', 'fail', `Port ${port} is closed`, err.message);
        reject(new Error('Closed'));
      });
      socket.connect(port, host);
    });
  } catch {
    return res.json({
      success: false,
      diagnostics,
      message: 'API PORT NOT ACCESSIBLE',
      details: `Port ${port} on ${host} is closed or filtered. Check: (1) Is the API service enabled in RouterOS? (/ip service enable api) (2) Is the port correct? Default is 8728. (3) Is there a firewall blocking the port?`,
    });
  }

  // Phase 3: RouterOS API login
  let client = null;
  try {
    client = new RouterOSClient(host, port, 15000);
    await client.connect();
    await client.login(username, password);
    addDiag('auth', 'pass', 'Authentication successful');
  } catch (err) {
    addDiag('auth', 'fail', 'Authentication failed', err.message || 'Invalid credentials');
    if (client) { try { await client.close(); } catch {} }
    return res.json({
      success: false,
      diagnostics,
      message: 'AUTHENTICATION FAILED',
      details: 'The IP is reachable and port is open, but the username or password is incorrect. Check: (1) Username (case-sensitive) (2) Password (3) Is the user allowed to login via API? (/user set [username] address=0.0.0.0/0)',
    });
  }

  // Phase 4: Fetch system info
  try {
    const identity = await client.runQuery('/system/identity/print');
    const resource = await client.runQuery('/system/resource/print');
    const clock = await client.runQuery('/system/clock/print');
    const interfaces = await client.runQuery('/interface/print');
    const ethernetPorts = await client.runQuery('/interface/ethernet/print').catch(() => []);
    const services = await client.runQuery('/ip/service/print').catch(() => []);
    const routerboard = await client.runQuery('/system/routerboard/print').catch(() => [{}]);

    addDiag('info', 'pass', 'System information retrieved');

    await client.close();

    const idRow = identity?.[0] || {};
    const resRow = resource?.[0] || {};
    const clkRow = clock?.[0] || {};
    const rbRow = routerboard?.[0] || {};

    // Build enriched port list from all interfaces + ethernet details
    const etherMap = {};
    (ethernetPorts || []).forEach(ep => { etherMap[ep.name] = ep; });

    const allPorts = (interfaces || []).map(iface => {
      const eth = etherMap[iface.name] || {};
      return {
        name: iface.name,
        type: iface.type,
        mtu: iface.mtu,
        mac: iface['mac-address'],
        running: iface.running === 'true',
        disabled: iface.disabled === 'true',
        enabled: iface.disabled !== 'true',
        comment: iface.comment || '',
        // Ethernet-specific port details
        speed: eth['advertised-link-modes']
          ? (eth['advertised-link-modes'].match(/(\d+[MG])bps/) || [])[1] || eth.speed || '—'
          : eth.speed || '—',
        duplex: eth['auto-negotiation'] === 'true' ? 'auto' : (eth.duplex || '—'),
        poeOut: eth['poe-out'] || (eth['poe'] || '—'),
        linkStatus: iface.running === 'true' ? 'link-ok' : 'no-link',
        rate: eth.rate || '—',
        sfpPresent: eth['sfp-present'] || '—',
        sfpType: eth['sfp-type'] || '—',
      };
    });

    // Separate physical ethernet ports vs virtual interfaces
    const physicalPorts = allPorts.filter(p =>
      ['ether', 'sfp', 'combo', 'wlan', 'wlan60'].some(t => p.type === t || p.name.toLowerCase().startsWith(t))
    );
    const virtualInterfaces = allPorts.filter(p =>
      !physicalPorts.includes(p)
    );

    return res.json({
      success: true,
      diagnostics,
      message: `Connected to ${idRow.name || 'MikroTik'} successfully`,
      info: {
        identity: idRow.name || 'Unknown',
        version: resRow.version || 'Unknown',
        boardName: resRow['board-name'] || 'Unknown',
        cpu: resRow.cpu || 'Unknown',
        cpuCount: resRow['cpu-count'] || 'Unknown',
        cpuFrequency: resRow['cpu-frequency'] || 'Unknown',
        totalMemory: resRow['total-memory'] || 'Unknown',
        totalHdd: resRow['total-hdd-space'] || 'Unknown',
        architecture: resRow['architecture-name'] || 'Unknown',
        uptime: resRow.uptime || 'Unknown',
        clock: clkRow.time || 'Unknown',
        date: clkRow.date || 'Unknown',
        timezone: clkRow['time-zone-name'] || 'Unknown',
        routerboard: rbRow.model || 'Unknown',
        serialNumber: rbRow['serial-number'] || 'Unknown',
        firmware: rbRow['firmware-type'] || 'Unknown',
        services: (services || []).map(s => ({
          name: s.name || 'Unknown',
          port: parseInt(s.port) || 0,
          disabled: s.disabled === 'true',
          enabled: s.disabled !== 'true',
          certificate: s.certificate || '—',
          address: s.address || '0.0.0.0',
          comment: s.comment || '',
        })),
        ports: {
          total: allPorts.length,
          enabled: allPorts.filter(p => p.enabled).length,
          disabled: allPorts.filter(p => !p.enabled).length,
          running: allPorts.filter(p => p.running).length,
          physical: physicalPorts,
          virtual: virtualInterfaces,
        },
      },
    });
  } catch (err) {
    if (client) { try { await client.close(); } catch {} }
    addDiag('info', 'fail', 'Failed to fetch system info', err.message);
    return res.json({ success: true, diagnostics, message: 'Logged in but info retrieval partially failed', info: null });
  }
});

// === SNMP CHECKER ===
function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) return reject(error);
      const results = {};
      (varbinds || []).forEach((vb, i) => {
        const oid = oids[i];
        if (snmp.isVarbindError(vb)) {
          results[oid] = { error: snmp.varbindError(vb) };
        } else {
          results[oid] = { value: vb.value };
        }
      });
      resolve(results);
    });
  });
}

function snmpWalk(session, oid) {
  return new Promise((resolve, reject) => {
    const entries = [];
    session.walk(oid, 20, (error, varbinds) => {
      if (error) return reject(error);
      (varbinds || []).forEach(vb => {
        if (!snmp.isVarbindError(vb)) {
          entries.push({ oid: vb.oid, value: vb.value });
        }
      });
    }, (error) => {
      if (error) return reject(error);
      resolve(entries);
    });
  });
}

function bufferToStr(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('utf8').replace(/[\x00-\x1f]/g, '').trim();
  return String(buf);
}

app.post('/api/snmp/check', async (req, res) => {
  const { host, community = 'public', port = 161, version = '2c' } = req.body;
  if (!host) return res.status(400).json({ error: 'Host is required' });
  if (!isValidHost(host)) return res.status(400).json({ error: 'Host must be a hostname or IP address' });

  const diagnostics = [];
  const addDiag = (phase, status, message, detail = null) => {
    diagnostics.push({ phase, status, message, detail });
  };

  // Phase 1: Ping — informational; a device that drops ICMP can still answer SNMP.
  try {
    if (!isServerless) {
      const { stdout } = await execAsync(process.platform === 'win32' ? `ping -n 2 ${host}` : `ping -c 2 ${host}`);
      if (!/ttl[=:]|time[=<]/i.test(stdout)) {
        addDiag('ping', 'warn', `${host} did not answer ICMP — continuing, SNMP may still respond`);
      } else {
        addDiag('ping', 'pass', `Host ${host} is reachable`);
      }
    } else {
      addDiag('ping', 'pass', `Skipped ping (serverless) — trying SNMP directly`);
    }
  } catch {
    addDiag('ping', 'warn', `${host} did not answer ICMP — continuing, SNMP may still respond`);
  }

  // Phase 2: SNMP connection
  let session = null;
  try {
    const snmpVersion = version === '1' ? snmp.Version1 : snmp.Version2c;
    session = snmp.createSession(host, community, {
      port,
      version: snmpVersion,
      timeout: 8000,
      retries: 1,
    });

    // Try to fetch sysDescr as a connectivity test
    const sysOids = [
      '1.3.6.1.2.1.1.1.0',   // sysDescr
      '1.3.6.1.2.1.1.2.0',   // sysObjectID
      '1.3.6.1.2.1.1.3.0',   // sysUpTime
      '1.3.6.1.2.1.1.4.0',   // sysContact
      '1.3.6.1.2.1.1.5.0',   // sysName
      '1.3.6.1.2.1.1.6.0',   // sysLocation
      '1.3.6.1.2.1.2.1.0',   // ifNumber
    ];

    const sysData = await snmpGet(session, sysOids);
    addDiag('snmp', 'pass', `SNMP ${version} connected with community "${community}"`);

    // Phase 3: Walk interfaces
    let ifaces = [];
    try {
      const ifDescr = await snmpWalk(session, '1.3.6.1.2.1.2.2.1.2');
      const ifAdmin = await snmpWalk(session, '1.3.6.1.2.1.2.2.1.7');
      const ifOper = await snmpWalk(session, '1.3.6.1.2.1.2.2.1.8');
      const ifSpeed = await snmpWalk(session, '1.3.6.1.2.1.2.2.1.5');
      const ifMtu = await snmpWalk(session, '1.3.6.1.2.1.2.2.1.4');
      const ifMac = await snmpWalk(session, '1.3.6.1.2.1.2.2.1.6');

      const indexMap = {};
      ifDescr.forEach(e => { const idx = e.oid.split('.').pop(); indexMap[idx] = { name: bufferToStr(e.value) }; });
      ifAdmin.forEach(e => { const idx = e.oid.split('.').pop(); if (indexMap[idx]) indexMap[idx].admin = e.value; });
      ifOper.forEach(e => { const idx = e.oid.split('.').pop(); if (indexMap[idx]) indexMap[idx].oper = e.value; });
      ifSpeed.forEach(e => { const idx = e.oid.split('.').pop(); if (indexMap[idx]) indexMap[idx].speed = e.value; });
      ifMtu.forEach(e => { const idx = e.oid.split('.').pop(); if (indexMap[idx]) indexMap[idx].mtu = e.value; });
      ifMac.forEach(e => { const idx = e.oid.split('.').pop(); if (indexMap[idx]) indexMap[idx].mac = e.value; });

      ifaces = Object.entries(indexMap).map(([idx, data]) => ({
        index: parseInt(idx),
        name: data.name || `if${idx}`,
        admin: data.admin === 1 ? 'up' : 'down',
        oper: data.oper === 1 ? 'up' : 'down',
        speed: data.speed || 0,
        mtu: data.mtu || 0,
        mac: data.mac ? Buffer.from(data.mac).toString('hex').replace(/(.{2})(?=.)/g, '$1:').toUpperCase() : null,
        status: data.oper === 1 ? 'link-ok' : 'no-link',
      }));
    } catch (e) {
      // Walk is optional
    }

    session.close();

    return res.json({
      success: true,
      diagnostics,
      host,
      message: `SNMP response received from ${host}`,
      system: {
        description: sysData['1.3.6.1.2.1.1.1.0']?.value ? bufferToStr(sysData['1.3.6.1.2.1.1.1.0'].value) : '—',
        objectId: sysData['1.3.6.1.2.1.1.2.0']?.value ? String(sysData['1.3.6.1.2.1.1.2.0'].value) : '—',
        uptime: sysData['1.3.6.1.2.1.1.3.0']?.value ? (sysData['1.3.6.1.2.1.1.3.0'].value / 100).toFixed(0) + ' seconds' : '—',
        contact: sysData['1.3.6.1.2.1.1.4.0']?.value ? bufferToStr(sysData['1.3.6.1.2.1.1.4.0'].value) : '—',
        name: sysData['1.3.6.1.2.1.1.5.0']?.value ? bufferToStr(sysData['1.3.6.1.2.1.1.5.0'].value) : '—',
        location: sysData['1.3.6.1.2.1.1.6.0']?.value ? bufferToStr(sysData['1.3.6.1.2.1.1.6.0'].value) : '—',
        ifCount: sysData['1.3.6.1.2.1.2.1.0']?.value || 0,
      },
      interfaces: ifaces,
    });
  } catch (err) {
    if (session) session.close();
    addDiag('snmp', 'fail', `SNMP connection failed`, err.message);
    return res.json({ success: false, diagnostics, message: `SNMP error: ${err.message}` });
  }
});

// === SNMP MIB BROWSER — Custom OID Query ===
function formatSnmpValue(vb) {
  if (snmp.isVarbindError(vb)) return { type: 'error', value: snmp.varbindError(vb) };
  const val = vb.value;
  const type = vb.type;
  if (Buffer.isBuffer(val)) {
    const isMac = val.length === 6;
    const isIp = val.length === 4;
    if (isMac) return { type: 'MAC', value: val.toString('hex').replace(/(.{2})(?=.)/g, '$1:').toUpperCase() };
    if (isIp) return { type: 'IPAddress', value: Array.from(val).join('.') };
    const str = val.toString('utf8').replace(/[\x00-\x1f]/g, '').trim();
    if (str.length > 0 && str.length === val.length) return { type: 'String', value: str };
    return { type: 'Hex-String', value: val.toString('hex').replace(/(.{2})(?=.)/g, '$1:').toUpperCase() };
  }
  if (type === snmp.ObjectType.Counter64 || type === snmp.ObjectType.Counter || type === snmp.ObjectType.Gauge32 || type === snmp.ObjectType.Unsigned32) {
    return { type: 'Counter', value: String(val) };
  }
  if (type === snmp.ObjectType.Integer || type === snmp.ObjectType.Integer32) {
    return { type: 'Integer', value: String(val) };
  }
  if (type === snmp.ObjectType.OID) {
    return { type: 'OID', value: String(val) };
  }
  if (type === snmp.ObjectType.TimeTicks) {
    const sec = Math.floor(val / 100);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return { type: 'TimeTicks', value: `${d}d ${h}h ${m}m ${s}s`, raw: val };
  }
  return { type: 'Opaque', value: String(val) };
}

app.post('/api/snmp/query', async (req, res) => {
  const { host, community = 'public', port = 161, version = '2c', oid, operation = 'get', timeout = 8000, maxRepetitions = 20 } = req.body;
  if (!host) return res.status(400).json({ error: 'Host is required' });
  if (!oid) return res.status(400).json({ error: 'OID is required' });

  const oidRegex = /^(\d+\.)*\d+$/;
  if (!oidRegex.test(oid)) return res.status(400).json({ error: 'Invalid OID format. Use dot notation like 1.3.6.1.2.1.1.1.0' });

  let session = null;
  try {
    const snmpVersion = version === '1' ? snmp.Version1 : snmp.Version2c;
    session = snmp.createSession(host, community, { port, version: snmpVersion, timeout: Math.min(timeout, 30000), retries: 1 });

    const startTime = Date.now();
    let results = [];

    if (operation === 'get') {
      const oidResult = await snmpGet(session, [oid]);
      const vb = oidResult[oid];
      results = [{ oid, ...formatSnmpValue({ value: vb?.value, type: 0, oid }, vb?.error ? { type: 0 } : null) }];
      if (vb?.error) results[0] = { oid, type: 'error', value: vb.error };

    } else if (operation === 'walk' || operation === 'getbulk') {
      const entries = await snmpWalk(session, oid);
      results = entries.map(e => ({
        oid: e.oid,
        ...formatSnmpValue({ value: e.value, type: 0, oid: e.oid }),
      }));

    } else if (operation === 'getnext') {
      const nextOid = await new Promise((resolve, reject) => {
        session.next([oid], (error, varbinds) => {
          if (error) return reject(error);
          if (varbinds && varbinds.length > 0) {
            const vb = varbinds[0];
            if (snmp.isVarbindError(vb)) {
              resolve({ oid: oid, type: 'error', value: snmp.varbindError(vb) });
            } else {
              resolve({ oid: vb.oid, ...formatSnmpValue(vb) });
            }
          } else {
            resolve(null);
          }
        });
      });
      results = nextOid ? [nextOid] : [];

    } else if (operation === 'getmulti') {
      const oids = oid.split(',').map(s => s.trim());
      const validated = oids.filter(o => oidRegex.test(o));
      if (validated.length === 0) return res.status(400).json({ error: 'No valid OIDs provided (comma-separated)' });
      const oidResult = await snmpGet(session, validated);
      results = validated.map(o => ({
        oid: o,
        ...formatSnmpValue({ value: oidResult[o]?.value, type: 0, oid: o }, oidResult[o]?.error ? { type: 0 } : null),
      }));
      if (oidResult[o]?.error) results.find(r => r.oid === o).value = oidResult[o].error;
    }

    session.close();
    const elapsed = Date.now() - startTime;

    return res.json({
      success: true,
      host,
      oid,
      operation,
      elapsed,
      count: results.length,
      results,
    });
  } catch (err) {
    if (session) session.close();

    let hint = '';
    const msg = err.message || String(err);
    if (msg.includes('EHOSTUNREACH') || msg.includes('ENETUNREACH')) hint = 'Host is not reachable. Check network connectivity.';
    else if (msg.includes('ECONNREFUSED')) hint = 'SNMP service is not running or port is wrong.';
    else if (msg.includes('ETIMEOUT') || msg.includes('RequestTimedOut')) hint = 'SNMP request timed out. Try increasing timeout or check community string.';
    else if (msg.includes('auth') || msg.includes('community')) hint = 'Authentication failed. Check community string.';
    else if (msg.includes('noSuchName') || msg.includes('noSuchObject') || msg.includes('noSuchInstance')) hint = 'OID does not exist on this device. Try a different OID.';
    else if (msg.includes('genErr')) hint = 'General SNMP error. The device may not support this operation.';

    return res.json({ success: false, host, oid, operation, message: `SNMP error: ${msg}`, hint, results: [] });
  }
});

// === HTTP HEADERS CHECKER ===
app.get('/api/http-headers', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'HEAD',
      timeout: 10000,
      headers: { 'User-Agent': 'SuperApp-NetworkTools/1.0' },
    };

    const reqHttp = client.request(options, (response) => {
      const headers = {};
      Object.entries(response.headers).forEach(([key, val]) => {
        headers[key] = Array.isArray(val) ? val.join(', ') : String(val);
      });
      res.json({
        url: targetUrl,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        httpVersion: response.httpVersion,
        headers,
        timing: {
          total: Date.now() - start,
        },
      });
    });

    const start = Date.now();
    reqHttp.on('error', (err) => res.status(500).json({ error: err.message, url: targetUrl }));
    reqHttp.on('timeout', () => { reqHttp.destroy(); res.status(504).json({ error: 'Request timed out', url: targetUrl }); });
    reqHttp.end();
  } catch (err) {
    res.status(400).json({ error: 'Invalid URL', url: targetUrl });
  }
});

// === SSL CERTIFICATE CHECKER ===
app.get('/api/ssl-cert', (req, res) => {
  const { host, port = 443 } = req.query;
  if (!host) return res.status(400).json({ error: 'Host is required' });

  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
    const cert = socket.getPeerCertificate(true);
    const validFrom = new Date(cert.valid_from).toISOString();
    const validTo = new Date(cert.valid_to).toISOString();
    const daysLeft = Math.floor((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24));

    socket.end();

    res.json({
      host,
      port,
      subject: {
        commonName: cert.subject?.CN || 'Unknown',
        organization: cert.subject?.O || 'Unknown',
        country: cert.subject?.C || 'Unknown',
      },
      issuer: {
        commonName: cert.issuer?.CN || 'Unknown',
        organization: cert.issuer?.O || 'Unknown',
        country: cert.issuer?.C || 'Unknown',
      },
      validFrom,
      validTo,
      daysLeft,
      expired: daysLeft < 0,
      serialNumber: cert.serialNumber || 'Unknown',
      fingerprint: cert.fingerprint || 'Unknown',
      fingerprint256: cert.fingerprint256 || 'Unknown',
      subjectAltNames: cert.subjectaltname ? cert.subjectaltname.split(', ').filter(Boolean) : [],
      bits: cert.bits || 0,
      signatureAlgorithm: cert.sigalg || 'Unknown',
    });
  });

  socket.setTimeout(10000);
  socket.on('error', (err) => res.status(500).json({ error: `Could not connect: ${err.message}`, host, port }));
  socket.on('timeout', () => { socket.destroy(); res.status(504).json({ error: 'Connection timed out', host, port }); });
});

// === SCAN CAMPAIGN (subdomain discovery + port scan) ===
app.post('/api/scan-campaign', async (req, res) => {
  const { domain, ports } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });

  let portList = ports || [21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 1433, 1521, 2049, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 9090, 27017];
  if (typeof portList === 'string') portList = portList.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));

  const subdomains = [];
  const seen = new Set();

  try {
    const response = await fetch(`https://crt.sh/?q=%25.${domain}&output=json`, { timeout: 10000 });
    const data = await response.json();
    if (Array.isArray(data)) {
      data.forEach(entry => {
        const name = entry.name_value;
        if (name && name.includes(domain) && !seen.has(name)) {
          seen.add(name);
          subdomains.push({ subdomain: name, source: 'crt.sh' });
        }
      });
    }
  } catch {}

  const common = ['www', 'mail', 'ftp', 'admin', 'blog', 'shop', 'api', 'cdn', 'webmail', 'dev', 'staging', 'test', 'app', 'portal', 'm', 'mobile', 'news', 'forum', 'wiki', 'help', 'support', 'status', 'docs', 'demo', 'beta', 'vpn', 'ns1', 'ns2', 'mx', 'remote', 'git', 'jenkins', 'jira', 'confluence', 'smtp', 'imap', 'pop3', 'calendar', 'cloud', 'cp', 'cpanel', 'whm', 'autodiscover'];
  for (const sub of common) {
    const fqdn = `${sub}.${domain}`;
    if (seen.has(fqdn)) continue;
    seen.add(fqdn);
    try {
      await new Promise((resolve) => {
        dns.resolve(fqdn, 'A', (err, addresses) => {
          if (!err && addresses && addresses.length > 0) {
            subdomains.push({ subdomain: fqdn, ips: addresses, source: 'brute' });
          }
          resolve();
        });
      });
    } catch {}
  }

  const results = [];
  for (const sub of subdomains) {
    const target = (sub.ips && sub.ips[0]) || sub.subdomain;
    const openPorts = [];
    for (const port of portList) {
      try {
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(2000);
          socket.on('connect', () => { openPorts.push(port); socket.destroy(); resolve(); });
          socket.on('timeout', () => { socket.destroy(); reject(); });
          socket.on('error', () => { reject(); });
          socket.connect(port, target);
        });
      } catch {}
    }
    results.push({ subdomain: sub.subdomain, ips: sub.ips || [], source: sub.source, open_ports: openPorts });
  }

  res.json({ domain, total: results.length, ports_scanned: portList.length, results });
});

// === HTTP REQUEST TESTER ===
app.post('/api/http-test', async (req, res) => {
  const { method = 'GET', url, headers = {}, body } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const startTotal = Date.now();

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method.toUpperCase(),
      timeout: 15000,
      headers: { 'User-Agent': 'SuperApp-NetworkTools/1.0', ...headers },
    };

    const reqHttp = client.request(options, (response) => {
      const responseHeaders = {};
      Object.entries(response.headers).forEach(([key, val]) => {
        responseHeaders[key] = Array.isArray(val) ? val.join(', ') : String(val);
      });

      let responseBody = '';
      const connectTime = Date.now() - startTotal;

      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        res.json({
          url: targetUrl,
          method: method.toUpperCase(),
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: responseHeaders,
          body: responseBody.substring(0, 50000),
          timing: { dns: 0, connect: connectTime, ttfb: connectTime, total: Date.now() - startTotal },
        });
      });
    });

    reqHttp.on('error', (err) => res.status(500).json({ error: err.message, url: targetUrl }));
    reqHttp.on('timeout', () => { reqHttp.destroy(); res.status(504).json({ error: 'Request timed out', url: targetUrl }); });

    if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
      reqHttp.write(body);
    }
    reqHttp.end();
  } catch (err) {
    res.status(400).json({ error: 'Invalid URL or request failed', detail: err.message });
  }
});

// === SUBDOMAIN DISCOVERY ===
app.get('/api/subdomain-discovery', async (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });

  const results = [];
  const seen = new Set();

  // Try crt.sh API
  try {
    const response = await fetch(`https://crt.sh/?q=%25.${domain}&output=json`, { timeout: 10000 });
    const data = await response.json();
    if (Array.isArray(data)) {
      data.forEach(entry => {
        const name = entry.name_value;
        if (name && name.includes(domain) && !seen.has(name)) {
          seen.add(name);
          results.push({ subdomain: name, source: 'crt.sh' });
        }
      });
    }
  } catch {}

  // Common subdomain wordlist (brute force)
  const common = [
    'www', 'mail', 'ftp', 'admin', 'blog', 'shop', 'api', 'cdn', 'webmail',
    'dev', 'staging', 'test', 'app', 'portal', 'm', 'mobile', 'news', 'forum',
    'wiki', 'help', 'support', 'status', 'docs', 'demo', 'beta', 'vpn', 'ns1',
    'ns2', 'mx', 'remote', 'git', 'jenkins', 'jira', 'confluence', 'smtp',
    'imap', 'pop3', 'calendar', 'cloud', 'cp', 'cpanel', 'whm', 'autodiscover',
  ];

  for (const sub of common) {
    const fqdn = `${sub}.${domain}`;
    if (seen.has(fqdn)) continue;
    seen.add(fqdn);
    try {
      await new Promise((resolve, reject) => {
        dns.resolve(fqdn, 'A', (err, addresses) => {
          if (!err && addresses && addresses.length > 0) {
            results.push({ subdomain: fqdn, ips: addresses, source: 'brute' });
          }
          resolve();
        });
      });
    } catch {}
  }

  const unique = [];
  const subSeen = new Set();
  results.forEach(r => {
    if (!subSeen.has(r.subdomain)) {
      subSeen.add(r.subdomain);
      unique.push(r);
    }
  });

  res.json({ domain, count: unique.length, subdomains: unique });
});

// === SCENARIO RUNNER ===
app.post('/api/run-scenario', async (req, res) => {
  const { steps } = req.body;
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'Steps array is required' });
  }

  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepResult = { step: i + 1, type: step.type, target: step.target, status: 'pending', timing: null, result: null, error: null };

    try {
      const start = Date.now();

      if (step.type === 'dns') {
        const records = await new Promise((resolve, reject) => {
          const types = step.recordTypes || ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'];
          const dnsResults = [];
          let pending = types.length;
          types.forEach(type => {
            dns.resolve(step.target, type, (err, addresses) => {
              if (!err && addresses) {
                addresses.forEach(addr => {
                  dnsResults.push({ type, value: typeof addr === 'object' ? JSON.stringify(addr) : String(addr) });
                });
              }
              pending--;
              if (pending === 0) resolve(dnsResults);
            });
          });
        });
        stepResult.result = { records };
        stepResult.status = 'success';
      } else if (step.type === 'http') {
        const method = step.method || 'GET';
        let targetUrl = step.target;
        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
        const parsed = new URL(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;
        const httpResult = await new Promise((resolve, reject) => {
          const opts = {
            hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search, method, timeout: 10000,
            headers: { 'User-Agent': 'SuperApp-NetworkTools/1.0' },
          };
          const reqHttp2 = client.request(opts, (response) => {
            let body = '';
            response.on('data', c => { body += c; });
            response.on('end', () => resolve({ statusCode: response.statusCode, body: body.substring(0, 1000) }));
          });
          reqHttp2.on('error', reject);
          reqHttp2.on('timeout', () => { reqHttp2.destroy(); reject(new Error('Timeout')); });
          reqHttp2.end();
        });
        stepResult.result = httpResult;
        stepResult.status = httpResult.statusCode < 400 ? 'success' : 'warning';
      } else if (step.type === 'ssl') {
        const { host, port } = step.port ? { host: step.target, port: step.port } : (() => {
          try {
            const parsed = new URL(step.target.startsWith('http') ? step.target : 'https://' + step.target);
            return { host: parsed.hostname, port: parsed.port || 443 };
          } catch { return { host: step.target, port: 443 }; }
        })();
        const certResult = await new Promise((resolve, reject) => {
          const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
            const cert = socket.getPeerCertificate(true);
            const daysLeft = Math.floor((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24));
            socket.end();
            resolve({
              subject: cert.subject?.CN || 'Unknown', issuer: cert.issuer?.CN || 'Unknown',
              validFrom: cert.valid_from, validTo: cert.valid_to, daysLeft, expired: daysLeft < 0,
            });
          });
          socket.setTimeout(10000);
          socket.on('error', reject);
        });
        stepResult.result = certResult;
        stepResult.status = certResult.expired ? 'error' : (certResult.daysLeft < 30 ? 'warning' : 'success');
      } else if (step.type === 'headers') {
        let targetUrl = step.target;
        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
        const parsed = new URL(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;
        const headerResult = await new Promise((resolve, reject) => {
          const opts = {
            hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search, method: 'HEAD', timeout: 10000,
            headers: { 'User-Agent': 'SuperApp-NetworkTools/1.0' },
          };
          const reqHttp3 = client.request(opts, (response) => {
            const hdrs = {};
            Object.entries(response.headers).forEach(([k, v]) => { hdrs[k] = Array.isArray(v) ? v.join(', ') : String(v); });
            resolve({ statusCode: response.statusCode, headers: hdrs });
          });
          reqHttp3.on('error', reject);
          reqHttp3.on('timeout', () => { reqHttp3.destroy(); reject(new Error('Timeout')); });
          reqHttp3.end();
        });
        stepResult.result = headerResult;
        stepResult.status = 'success';
      }

      stepResult.timing = Date.now() - start;
    } catch (err) {
      stepResult.status = 'error';
      stepResult.error = err.message;
    }

    results.push(stepResult);
  }

  res.json({ total: results.length, passed: results.filter(r => r.status === 'success').length, results });
});

// === CMD CONSOLE (safe command execution) ===
const SAFE_CMDS = ['ping', 'tracert', 'traceroute', 'pathping', 'nslookup', 'netstat', 'ipconfig', 'arp', 'systeminfo', 'hostname', 'route', 'date', 'time', 'ver', 'whoami', 'net', 'echo'];
app.post('/api/cmd', async (req, res) => {
  const { command, args } = req.body;
  if (!command) return res.status(400).json({ error: 'Command required' });
  if (!SAFE_CMDS.includes(command)) return res.status(403).json({ error: `Command '${command}' not allowed` });
  if (isServerless) return res.json({ output: `\n  '${command}' cannot run in serverless mode.\n`, command, args, error: true });
  try {
    const fullCmd = process.platform === 'win32' ? `${command} ${args || ''}` : command === 'tracert' ? `traceroute ${args || ''}` : `${command} ${args || ''}`;
    const { stdout, stderr } = await execAsync(fullCmd, { timeout: 30000, shell: true });
    res.json({ output: stdout + stderr, command, args, error: false });
  } catch (e) {
    res.json({ output: e.stdout || e.stderr || e.message, command, args, error: true });
  }
});

// === ISP EXCEL VALIDATOR ===
app.post('/api/isp/validate', (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum size is 100 MB.' });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(500).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const templateType = req.body.templateType;
    if (!templateType || !['admin', 'mac'].includes(templateType)) {
      return res.status(400).json({ error: 'templateType must be "admin" or "mac".' });
    }

    const parsed = parseFile(req.file.buffer);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const headerCheck = validateHeaders(parsed.headers, templateType);
    if (!headerCheck.valid) {
      const issues = [];
      if (headerCheck.missing.length > 0) issues.push(`Missing columns: ${headerCheck.missing.join(', ')}`);
      if (headerCheck.duplicates.length > 0) issues.push(`Duplicate columns: ${headerCheck.duplicates.join(', ')}`);
      return res.status(400).json({
        error: 'Header mismatch.',
        details: issues.join('; '),
        headerCheck,
      });
    }

    const result = validateAll(parsed.rows, templateType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/isp/validate-from-url', async (req, res) => {
  try {
    const { fileUrl, templateType } = req.body;
    if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required.' });
    if (!templateType || !['admin', 'mac'].includes(templateType)) {
      return res.status(400).json({ error: 'templateType must be "admin" or "mac".' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(fileUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return res.status(400).json({ error: `Failed to fetch file from storage: ${response.statusText}` });

    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = parseFile(buffer);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const headerCheck = validateHeaders(parsed.headers, templateType);
    if (!headerCheck.valid) {
      const issues = [];
      if (headerCheck.missing.length > 0) issues.push(`Missing columns: ${headerCheck.missing.join(', ')}`);
      if (headerCheck.duplicates.length > 0) issues.push(`Duplicate columns: ${headerCheck.duplicates.join(', ')}`);
      return res.status(400).json({ error: 'Header mismatch.', details: issues.join('; '), headerCheck });
    }

    const result = validateAll(parsed.rows, templateType);
    res.json(result);
  } catch (err) {
    console.error('validate-from-url error:', err?.message || err?.name || err);
    res.status(500).json({ error: err.message || 'Validation failed' });
  }
});

app.post('/api/isp/autofix', async (req, res) => {
  try {
    const { data, templateType } = req.body;
    if (!data || !templateType) return res.status(400).json({ error: 'data and templateType are required.' });
    if (!['admin', 'mac'].includes(templateType)) {
      return res.status(400).json({ error: 'templateType must be "admin" or "mac".' });
    }

    const result = autoFixAll(data, templateType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/isp/download', async (req, res) => {
  try {
    const { data, templateType } = req.body;
    if (!data || !templateType) return res.status(400).json({ error: 'data and templateType are required.' });

    const buf = dataToSheet(data, templateType);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="fixed-clients.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
if (!isServerless) {
  app.listen(PORT, () => console.log(`SuperApp backend running on port ${PORT}`));
}
module.exports = app;
