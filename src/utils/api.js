import axios from 'axios';

// Always same-origin. In dev the vite server proxies /api to the backend
// (see vite.config.js); in production Express serves the API and dist/ together.
const BACKEND_URL = '';

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
});

export async function pingTarget(target, count = 4) {
  const { data } = await api.post('/api/ping', { target, count });
  return data;
}

export async function scanPorts(target, ports) {
  const { data } = await api.post('/api/scan-port', { target, ports });
  return data;
}

export async function dnsLookup(domain) {
  const { data } = await api.get('/api/dns', { params: { domain } });
  return data;
}

export async function whoisLookup(query) {
  const { data } = await api.get('/api/whois', { params: { query } });
  return data;
}

export async function traceroute(target) {
  const { data } = await api.get('/api/traceroute', { params: { target } });
  return data;
}

export async function getIPInfo() {
  const { data } = await api.get('/api/ip-info');
  return data;
}

export async function mikrotikTest({ host, port, username, password }) {
  const { data } = await api.post('/api/mikrotik/test', { host, port, username, password });
  return data;
}

export async function snmpCheck({ host, community, port, version }) {
  const { data } = await api.post('/api/snmp/check', { host, community, port, version });
  return data;
}

export async function snmpQuery({ host, community, port, version, oid, operation = 'get', timeout = 8000 }) {
  const { data } = await api.post('/api/snmp/query', { host, community, port, version, oid, operation, timeout });
  return data;
}

export async function checkHTTPHeaders(url) {
  const { data } = await api.get('/api/http-headers', { params: { url } });
  return data;
}

export async function checkSSLCert(host, port = 443) {
  const { data } = await api.get('/api/ssl-cert', { params: { host, port } });
  return data;
}

export async function sendHTTPRequest({ method, url, headers, body }) {
  const { data } = await api.post('/api/http-test', { method, url, headers, body });
  return data;
}

export async function discoverSubdomains(domain) {
  const { data } = await api.get('/api/subdomain-discovery', { params: { domain } });
  return data;
}

export async function runScanCampaign({ domain, ports }) {
  const { data } = await api.post('/api/scan-campaign', { domain, ports });
  return data;
}

export async function runScenario(steps) {
  const { data } = await api.post('/api/run-scenario', { steps });
  return data;
}

export async function runCmd(command, args) {
  const { data } = await api.post('/api/cmd', { command, args });
  return data;
}

export async function fetchPublicIPInfo() {
  try {
    const { data } = await axios.get('https://ipapi.co/json/', { timeout: 10000 });
    return data;
  } catch {
    try {
      const { data } = await axios.get('https://ip-api.com/json/', { timeout: 10000 });
      return {
        ip: data.query,
        city: data.city,
        region: data.regionName,
        country: data.country,
        org: data.isp,
        timezone: data.timezone,
        asn: data.as,
      };
    } catch {
      return { error: 'Could not fetch IP info' };
    }
  }
}
