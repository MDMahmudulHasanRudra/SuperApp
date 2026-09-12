import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

function getSid() {
  let sid = localStorage.getItem('superapp-session-id');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('superapp-session-id', sid);
  }
  return sid;
}

export function useDbStorage(table, localStorageKey, initialValue) {
  const [localValue, setLocalValue] = useLocalStorage(localStorageKey, initialValue);
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const sid = getSid();
      const res = await fetch(`/api/db/${table}?session_id=${encodeURIComponent(sid)}`);
      if (!res.ok) throw new Error(res.statusText);
      const { rows } = await res.json();
      if (rows && rows.length > 0) {
        const merged = mergeRows(rows);
        setData(merged);
        setLocalValue(merged);
      } else {
        setData(localValue);
      }
    } catch {
      setData(localValue);
    }
    setLoading(false);
  };

  const upsert = useCallback(async (newData) => {
    setData(newData);
    setLocalValue(newData);
    try {
      const sid = getSid();
      await fetch(`/api/db/${table}/upsert`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, data: newData }),
      });
    } catch {}
  }, [table]);

  const removeItem = useCallback(async () => {
    setData(initialValue);
    setLocalValue(initialValue);
    try {
      const sid = getSid();
      await fetch(`/api/db/${table}?session_id=${encodeURIComponent(sid)}`, {
        method: 'DELETE',
      });
    } catch {}
  }, [table, initialValue]);

  return [data, upsert, { loading, error: null, removeItem }];
}

function mergeRows(rows) {
  if (rows.length === 0) return null;
  const latest = rows.reduce((a, b) =>
    new Date(a.created_at) > new Date(b.created_at) ? a : b
  );
  return latest.data;
}
