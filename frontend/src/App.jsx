import React, { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:3999/api';

const SPORTS = ['baseball', 'football', 'basketball', 'hockey', 'wrestling'];
const GRADES = ['Raw', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'PSA 6', 'PSA 5', 'BGS 10', 'BGS 9', 'BGS 8', 'CGC 10', 'CGC 9', 'CGC 8', 'SGC 10', 'SGC 9', 'SGC 8'];

const emptyCard = { name: '', set: '', grade: 'Raw', price: '', quantity: 1, sport: 'baseball' };

export default function App() {
  const [cards, setCards] = useState([]);
  const [form, setForm] = useState(emptyCard);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [stats, setStats] = useState({ written: 0, skipped: 0 });
  const [editingIdx, setEditingIdx] = useState(null);
  const [tab, setTab] = useState('manage');

  // Load cards on mount
  useEffect(() => {
    fetch(`${API}/cards`).then(r => r.json()).then(d => {
      if (d.cards?.length) setCards(d.cards);
      else setCards([
        { name: 'Mike Trout Rookie', set: '2011 Topps Update', grade: 'PSA 10', price: 5000, quantity: 1, sport: 'baseball' },
        { name: 'Patrick Mahomes Rookie', set: '2017 Panini Contenders', grade: 'PSA 9', price: 1200, quantity: 1, sport: 'football' },
        { name: 'John Cena Auto', set: '2022 Topps WWE Heritage', grade: 'Raw', price: 150, quantity: 1, sport: 'wrestling' },
      ]);
    }).catch(() => setCards([]));
  }, []);

  const saveCards = (updated) => {
    setCards(updated);
    fetch(`${API}/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cards: updated }) });
  };

  const addOrUpdate = () => {
    if (!form.name || !form.set || !form.price) return;
    const card = { ...form, price: Number(form.price), quantity: Number(form.quantity) || 1 };
    if (editingIdx !== null) {
      const updated = [...cards];
      updated[editingIdx] = card;
      saveCards(updated);
      setEditingIdx(null);
    } else {
      saveCards([...cards, card]);
    }
    setForm(emptyCard);
  };

  const edit = (idx) => {
    setForm({ ...cards[idx], price: String(cards[idx].price) });
    setEditingIdx(idx);
    setTab('manage');
  };

  const remove = (idx) => {
    saveCards(cards.filter((_, i) => i !== idx));
  };

  const previewCard = () => {
    if (!form.name || !form.set || !form.price) return;
    const card = { ...form, price: Number(form.price), quantity: Number(form.quantity) || 1 };
    fetch(`${API}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }) })
      .then(r => r.json()).then(d => setPreview(d));
  };

  const generateCSV = () => {
    fetch(`${API}/generate-csv`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cards }) })
      .then(r => r.json()).then(d => {
        setCsv(d.csv || '');
        setStats({ written: d.written, skipped: d.skipped });
        setTab('csv');
      });
  };

  const styles = {
    container: { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif', background: '#0f1117', color: '#e4e4e7', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px' },
    title: { fontSize: '28px', fontWeight: 700, color: '#fafafa' },
    badge: { fontSize: '11px', background: '#27272a', padding: '4px 10px', borderRadius: '4px', color: '#a1a1aa' },
    tabs: { display: 'flex', gap: '4px', marginBottom: '20px' },
    tab: (active) => ({ padding: '8px 20px', border: 'none', background: active ? '#2563eb' : '#27272a', color: active ? '#fff' : '#a1a1aa', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }),
    card: { background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '20px', marginBottom: '16px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
    field: { marginBottom: '12px' },
    label: { display: 'block', fontSize: '12px', color: '#71717a', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    input: { width: '100%', padding: '8px 12px', background: '#0f0f11', border: '1px solid #3f3f46', borderRadius: '6px', color: '#e4e4e7', fontSize: '14px', boxSizing: 'border-box' },
    select: { width: '100%', padding: '8px 12px', background: '#0f0f11', border: '1px solid #3f3f46', borderRadius: '6px', color: '#e4e4e7', fontSize: '14px', boxSizing: 'border-box' },
    btn: { padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 },
    btnPrimary: { background: '#2563eb', color: '#fff' },
    btnGreen: { background: '#16a34a', color: '#fff' },
    btnRed: { background: '#dc2626', color: '#fff', padding: '6px 12px', fontSize: '12px' },
    btnSm: { padding: '6px 14px', fontSize: '13px' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th: { textAlign: 'left', padding: '8px', borderBottom: '2px solid #27272a', color: '#71717a', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' },
    td: { padding: '8px', borderBottom: '1px solid #27272a' },
    preview: { background: '#0d0d0f', border: '1px solid #3f3f46', borderRadius: '6px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#22c55e', marginTop: '8px' },
    csvBox: { background: '#0d0d0f', border: '1px solid #3f3f46', borderRadius: '6px', padding: '16px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '600px', overflow: 'auto', color: '#a1a1aa' },
    statBox: { display: 'inline-block', padding: '8px 16px', background: '#27272a', borderRadius: '6px', marginRight: '12px', fontSize: '13px' },
    sportBadge: (sport) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: sport === 'wrestling' ? '#7c3aed' : '#2563eb', color: '#fff' }),
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Card Suite — Sports & Wrestling</div>
          <div style={{ fontSize: '13px', color: '#71717a', marginTop: '4px' }}>eBay CSV Builder for Sports Cards & Wrestling Cards</div>
        </div>
        <div style={styles.badge}>Evolved v2 · Score 1.000</div>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'manage')} onClick={() => setTab('manage')}>Manage Cards</button>
        <button style={styles.tab(tab === 'csv')} onClick={() => setTab('csv')}>CSV Output</button>
      </div>

      {tab === 'manage' && (
        <>
          <div style={styles.card}>
            <h3 style={{ marginTop: 0 }}>{editingIdx !== null ? 'Edit Card' : 'Add Card'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div style={styles.field}>
                <label style={styles.label}>Card Name</label>
                <input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Mike Trout Rookie" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Set</label>
                <input style={styles.input} value={form.set} onChange={e => setForm({ ...form, set: e.target.value })} placeholder="2011 Topps Update" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Grade</label>
                <select style={styles.select} value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Sport</label>
                <select style={styles.select} value={form.sport} onChange={e => setForm({ ...form, sport: e.target.value })}>
                  {SPORTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Price ($)</label>
                <input style={styles.input} type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="5000" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Quantity</label>
                <input style={styles.input} type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="1" min="1" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={addOrUpdate}>{editingIdx !== null ? 'Update' : 'Add Card'}</button>
              <button style={{ ...styles.btn, ...styles.btnSm, background: '#27272a', color: '#e4e4e7' }} onClick={previewCard}>Preview Row</button>
              {editingIdx !== null && <button style={{ ...styles.btn, ...styles.btnSm, background: '#27272a', color: '#e4e4e7' }} onClick={() => { setForm(emptyCard); setEditingIdx(null); }}>Cancel</button>}
            </div>
            {preview && preview.row && (
              <div style={styles.preview}>{preview.row}</div>
            )}
            {preview && preview.error && (
              <div style={{ ...styles.preview, color: '#ef4444' }}>{preview.error}</div>
            )}
          </div>

          <div style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{cards.length}</strong> cards loaded
            </div>
            <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={generateCSV}>Generate eBay CSV</button>
          </div>

          {cards.length > 0 && (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Set</th>
                    <th style={styles.th}>Sport</th>
                    <th style={styles.th}>Grade</th>
                    <th style={styles.th}>Price</th>
                    <th style={styles.th}>Qty</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{c.name}</td>
                      <td style={styles.td}>{c.set}</td>
                      <td style={styles.td}><span style={styles.sportBadge(c.sport)}>{c.sport}</span></td>
                      <td style={styles.td}>{c.grade}</td>
                      <td style={styles.td}>${c.price}</td>
                      <td style={styles.td}>{c.quantity}</td>
                      <td style={styles.td}>
                        <button style={{ ...styles.btn, ...styles.btnSm, background: '#27272a', color: '#e4e4e7', marginRight: '4px' }} onClick={() => edit(i)}>Edit</button>
                        <button style={{ ...styles.btn, ...styles.btnRed }} onClick={() => remove(i)}>Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'csv' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={styles.statBox}>Written: <strong style={{ color: '#22c55e' }}>{stats.written}</strong></div>
              <div style={styles.statBox}>Skipped: <strong style={{ color: '#ef4444' }}>{stats.skipped}</strong></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={generateCSV}>Regenerate</button>
              <a href={`${API}/download-csv`} download>
                <button style={{ ...styles.btn, ...styles.btnPrimary }}>Download CSV</button>
              </a>
            </div>
          </div>
          {csv ? (
            <div style={styles.csvBox}>{csv}</div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
              No CSV generated yet. Click "Generate eBay CSV" to build it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
