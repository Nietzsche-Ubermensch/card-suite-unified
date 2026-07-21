import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = 'http://localhost:3999/api';

const SPORTS = ['wrestling', 'soccer', 'baseball', 'football', 'basketball', 'hockey'];
const GRADES = ['Raw', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'BGS 10', 'BGS 9.5', 'BGS 9', 'CGC 10', 'CGC 9', 'SGC 10', 'SGC 9'];

const S = {
  bg: '#0a0a0b',
  surface: '#131316',
  surface2: '#1a1a1f',
  border: '#2a2a30',
  text: '#e4e4e7',
  textDim: '#71717a',
  accent: '#6366f1',
  accentDim: '#4f46e5',
  success: '#22c55e',
  danger: '#ef4444',
  purple: '#a855f7',
  blue: '#3b82f6',
  green: '#22c55e',
  radius: '8px',
  mono: "'SF Mono', 'Monaco', 'Cascadia Code', monospace",
};

const emptyCard = { name: '', set: '', grade: 'Raw', price: '', quantity: 1, sport: 'wrestling', serial: '', parallel: '', insert: '', rookie: false, auto: false };

export default function App() {
  const [cards, setCards] = useState([]);
  const [form, setForm] = useState(emptyCard);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [stats, setStats] = useState({ written: 0, skipped: 0 });
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState('manage');
  const [selected, setSelected] = useState(new Set());
  const [health, setHealth] = useState(null);
  const [images, setImages] = useState([]);
  const [cropImg, setCropImg] = useState(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [cropStart, setCropStart] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [toast, setToast] = useState(null);
  const [bulkPriceOp, setBulkPriceOp] = useState('percent');
  const [bulkPriceVal, setBulkPriceVal] = useState('');
  const imgRef = useRef(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(setHealth).catch(() => setHealth(null));
    fetch(`${API}/cards`).then(r => r.json()).then(d => {
      if (d.cards?.length) setCards(d.cards);
      else setCards([
        { id: 1, name: 'Arianna Grace', set: '2022 Topps Chrome WWE', grade: 'Raw', price: 25, quantity: 1, sport: 'wrestling', serial: '080/25' },
        { id: 2, name: 'Dominik Mysterio', set: '2022 Topps Chrome WWE', grade: 'Raw', price: 45, quantity: 1, sport: 'wrestling', serial: '117/275', parallel: 'Green Refractor' },
        { id: 3, name: 'Mercedes Moné', set: '2025 AEW Metal Universe Ring Heroes', grade: 'Raw', price: 75, quantity: 1, sport: 'wrestling', serial: 'RH 15/25' },
        { id: 4, name: 'Lionel Messi', set: '2024-25 Panini Donruss Soccer Pitch Kings', grade: 'Raw', price: 50, quantity: 1, sport: 'soccer' },
        { id: 5, name: 'James Wood', set: '2023 Bowman Chrome', grade: 'Raw', price: 80, quantity: 1, sport: 'baseball', rookie: true },
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
    if (editingId !== null) {
      saveCards(cards.map(c => c.id === editingId ? { ...card, id: editingId } : c));
      setEditingId(null);
      showToast('Card updated');
    } else {
      const newCard = { ...card, id: Math.max(0, ...cards.map(c => c.id || 0)) + 1 };
      saveCards([...cards, newCard]);
      showToast('Card added');
    }
    setForm(emptyCard);
  };

  const editCard = (c) => {
    setForm({ ...c, price: String(c.price), quantity: String(c.quantity) });
    setEditingId(c.id);
    setTab('manage');
  };

  const deleteCard = (id) => {
    saveCards(cards.filter(c => c.id !== id));
    showToast('Card deleted', 'danger');
  };

  const previewRow = () => {
    if (!form.name || !form.set) return;
    fetch(`${API}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card: { ...form, price: Number(form.price) || 0, quantity: Number(form.quantity) || 1 } }) })
      .then(r => r.json()).then(d => { if (d.row) setPreview(d); else setPreview({ error: d.error }); });
  };

  const generateCSV = () => {
    fetch(`${API}/generate-csv`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cards }) })
      .then(r => r.json()).then(d => { setCsv(d.csv || ''); setStats({ written: d.written, skipped: d.skipped }); showToast(`CSV generated: ${d.written} rows`); })
      .catch(() => showToast('CSV generation failed', 'danger'));
  };

  // Selection
  const toggleSelect = (id) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };
  const selectAll = () => setSelected(new Set(cards.map(c => c.id)));
  const selectNone = () => setSelected(new Set());
  const selectedCards = cards.filter(c => selected.has(c.id));

  // Bulk operations
  const bulkSetSport = (sport) => {
    if (selected.size === 0) return;
    fetch(`${API}/bulk-sport`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], sport }) })
      .then(r => r.json()).then(d => { setCards(cards.map(c => selected.has(c.id) ? { ...c, sport } : c)); showToast(`${d.updated} cards → ${sport}`); });
  };

  const bulkSetGrade = (grade) => {
    if (selected.size === 0) return;
    fetch(`${API}/bulk-grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], grade }) })
      .then(r => r.json()).then(d => { setCards(cards.map(c => selected.has(c.id) ? { ...c, grade } : c)); showToast(`${d.updated} cards → ${grade}`); });
  };

  const bulkAdjustPrice = () => {
    if (selected.size === 0 || !bulkPriceVal) return;
    const val = Number(bulkPriceVal);
    fetch(`${API}/bulk-price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], operation: bulkPriceOp, value: val }) })
      .then(r => r.json()).then(d => {
        setCards(cards.map(c => {
          if (!selected.has(c.id)) return c;
          let p = c.price;
          if (bulkPriceOp === 'percent') p = Math.round(p * (1 + val/100) * 100) / 100;
          else if (bulkPriceOp === 'fixed') p = Math.round((p + val) * 100) / 100;
          else if (bulkPriceOp === 'set') p = val;
          return { ...c, price: Math.max(0, p) };
        }));
        showToast(`${d.updated} prices adjusted`);
      });
  };

  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} cards?`)) return;
    fetch(`${API}/bulk-delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }) })
      .then(r => r.json()).then(d => { setCards(cards.filter(c => !selected.has(c.id))); setSelected(new Set()); showToast(`${d.deleted} cards deleted`, 'danger'); });
  };

  // Venice enhance
  const enhanceCard = (card) => {
    setEnhancing(true);
    fetch(`${API}/enhance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }) })
      .then(r => r.json()).then(d => {
        if (d.enhanced) {
          setCards(cards.map(c => c.id === card.id ? { ...c, enhancedTitle: d.enhanced.title, enhancedDescription: d.enhanced.description } : c));
          showToast(`Enhanced: ${d.enhanced.title?.substring(0, 40)}...`, 'success');
        } else showToast('Enhancement failed', 'danger');
      }).catch(() => showToast('Enhancement failed', 'danger')).finally(() => setEnhancing(false));
  };

  const enhanceBatch = () => {
    if (selectedCards.length === 0) return;
    setEnhancing(true);
    fetch(`${API}/enhance-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cards: selectedCards }) })
      .then(r => r.json()).then(d => {
        if (d.enhanced) showToast(`${d.enhanced} cards enhanced via Venice AI`);
        else showToast('Batch enhancement failed', 'danger');
      }).catch(() => showToast('Batch enhancement failed', 'danger')).finally(() => setEnhancing(false));
  };

  // Image upload
  const onUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const fd = new FormData();
    files.forEach(f => fd.append('images', f));
    fetch(`${API}/upload`, { method: 'POST', body: fd })
      .then(r => r.json()).then(d => { showToast(`${d.count} images uploaded`); loadUploads(); })
      .catch(() => showToast('Upload failed', 'danger'));
  };

  const loadUploads = () => {
    // We can list cropped images via the static path
    // For now just show uploaded via the inventory endpoint
  };

  // Crop handlers
  const onCropStart = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCropStart({ x, y });
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const onCropMove = (e) => {
    if (!cropStart || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(cropStart.x, e.clientX - rect.left));
    const y = Math.max(0, Math.min(cropStart.y, e.clientY - rect.top));
    const w = Math.abs(e.clientX - rect.left - cropStart.x);
    const h = Math.abs(e.clientY - rect.top - cropStart.y);
    setCropRect({ x, y, w, h });
  };

  const onCropEnd = () => {
    setCropStart(null);
  };

  const applyCrop = () => {
    if (!cropImg || cropRect.w < 10 || cropRect.h < 10) return;
    // Scale crop coords to actual image dimensions
    const img = imgRef.current;
    if (!img) return;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    fetch(`${API}/crop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: cropImg.filename,
        x: Math.round(cropRect.x * scaleX),
        y: Math.round(cropRect.y * scaleY),
        width: Math.round(cropRect.w * scaleX),
        height: Math.round(cropRect.h * scaleY),
      })
    }).then(r => r.json()).then(d => {
      if (d.croppedPath) { showToast('Image cropped'); setCropRect({ x: 0, y: 0, w: 0, h: 0 }); }
      else showToast('Crop failed', 'danger');
    }).catch(() => showToast('Crop failed', 'danger'));
  };

  const autoCrop = (filename) => {
    fetch(`${API}/auto-crop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) })
      .then(r => r.json()).then(d => { if (d.croppedPath) showToast('Auto-cropped & resized to 1000x1400'); else showToast('Auto-crop failed', 'danger'); })
      .catch(() => showToast('Auto-crop failed', 'danger'));
  };

  // Import inventory
  const importInventory = () => {
    fetch(`${API}/import-inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json()).then(d => {
        if (d.imported > 0) {
          fetch(`${API}/cards`).then(r => r.json()).then(d2 => { if (d2.cards?.length) setCards(d2.cards); });
          showToast(`${d.imported} cards imported from rbeachgebay (${d.totalImages} images found)`);
        } else showToast(`No new images to import (${d.totalImages} total, ${d.totalCards} cards already)`);
      }).catch(() => showToast('Import failed', 'danger'));
  };

  const sportBadge = (sport) => {
    const styles = {
      wrestling: { bg: S.purple, label: 'WWE/AEW' },
      soccer: { bg: S.green, label: 'Soccer' },
      baseball: { bg: S.blue, label: 'MLB' },
      football: { bg: S.blue, label: 'NFL' },
      basketball: { bg: S.blue, label: 'NBA' },
      hockey: { bg: S.blue, label: 'NHL' },
    };
    const st = styles[sport] || { bg: S.textDim, label: sport };
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: st.bg, color: '#fff' }}>{st.label}</span>;
  };

  return (
    <div style={{ minHeight: '100vh', background: S.bg, color: S.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '0 0 40px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${S.border}`, position: 'sticky', top: 0, background: S.bg, zIndex: 100 }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>Card Suite</div>
          <div style={{ fontSize: '12px', color: S.textDim }}>eBay CSV Builder · Image Cropper · Venice AI Enhancement</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {health && <span style={{ fontSize: '11px', color: S.success }}>● Online · {health.cards} cards</span>}
          <span style={{ fontSize: '11px', color: S.textDim }}>{cards.length} cards · {selected.size} selected</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${S.border}`, padding: '0 24px' }}>
        {['manage', 'bulk', 'crop', 'csv'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${S.accent}` : '2px solid transparent',
            color: tab === t ? S.text : S.textDim, fontSize: '13px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
          }}>{t === 'csv' ? 'CSV Output' : t === 'bulk' ? 'Bulk Edit' : t === 'crop' ? 'Image Tools' : 'Manage Cards'}</button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, padding: '12px 20px', borderRadius: S.radius, background: toast.type === 'danger' ? S.danger : toast.type === 'success' ? S.success : S.accent, color: '#fff', fontSize: '13px', fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>{toast.msg}</div>
        )}

        {/* MANAGE TAB */}
        {tab === 'manage' && (
          <div>
            {/* Form */}
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', marginBottom: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>{editingId !== null ? 'Edit Card' : 'Add New Card'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                <Input label="Player Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Arianna Grace" />
                <Input label="Set" value={form.set} onChange={v => setForm({ ...form, set: v })} placeholder="2022 Topps Chrome WWE" />
                <Select label="Sport" value={form.sport} onChange={v => setForm({ ...form, sport: v })} options={SPORTS} />
                <Select label="Grade" value={form.grade} onChange={v => setForm({ ...form, grade: v })} options={GRADES} />
                <Input label="Price ($)" value={form.price} onChange={v => setForm({ ...form, price: v })} placeholder="25" type="number" />
                <Input label="Quantity" value={form.quantity} onChange={v => setForm({ ...form, quantity: v })} placeholder="1" type="number" />
                <Input label="Serial Number" value={form.serial} onChange={v => setForm({ ...form, serial: v })} placeholder="080/25" />
                <Input label="Parallel/Variety" value={form.parallel} onChange={v => setForm({ ...form, parallel: v })} placeholder="Green Refractor" />
                <Input label="Insert Name" value={form.insert} onChange={v => setForm({ ...form, insert: v })} placeholder="Blast Furnace" />
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingTop: '20px' }}>
                  <label style={{ fontSize: '12px', color: S.textDim, cursor: 'pointer' }}><input type="checkbox" checked={form.rookie || false} onChange={e => setForm({ ...form, rookie: e.target.checked })} style={{ marginRight: '6px' }} />Rookie</label>
                  <label style={{ fontSize: '12px', color: S.textDim, cursor: 'pointer' }}><input type="checkbox" checked={form.auto || false} onChange={e => setForm({ ...form, auto: e.target.checked })} style={{ marginRight: '6px' }} />Auto</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <Btn onClick={addOrUpdate} primary>{editingId !== null ? 'Update' : 'Add Card'}</Btn>
                <Btn onClick={previewRow}>Preview CSV Row</Btn>
                {editingId !== null && <Btn onClick={() => { setForm(emptyCard); setEditingId(null); }}>Cancel</Btn>}
              </div>
              {preview && (
                <div style={{ marginTop: '12px', padding: '12px', background: S.surface2, borderRadius: S.radius, border: `1px solid ${S.border}` }}>
                  {preview.error ? <span style={{ color: S.danger, fontSize: '12px' }}>{preview.error}</span> : (
                    <div style={{ fontSize: '11px', fontFamily: S.mono, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px', overflow: 'auto' }}>{preview.row}</div>
                  )}
                </div>
              )}
            </div>

            {/* Import button */}
            <div style={{ marginBottom: '16px' }}>
              <Btn onClick={importInventory} small>Import from rbeachgebay folder (172 images)</Btn>
            </div>

            {/* Cards table */}
            <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${S.border}` }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Btn onClick={selectAll} small>Select All</Btn>
                  <Btn onClick={selectNone} small>Clear</Btn>
                </div>
                <div style={{ fontSize: '11px', color: S.textDim }}>{selected.size} selected</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: S.textDim, width: '32px' }}></th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: S.textDim }}>Player</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: S.textDim }}>Set</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: S.textDim }}>Sport</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: S.textDim }}>Grade</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', color: S.textDim }}>Price</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: S.textDim }}>Serial</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', color: S.textDim }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map(c => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${S.border}`, background: selected.has(c.id) ? 'rgba(99,102,241,0.05)' : 'none' }}>
                      <td style={{ padding: '8px 12px' }}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                      <td style={{ padding: '8px 12px', fontSize: '13px' }}>{c.name} {c.rookie && <span style={{ fontSize: '9px', color: S.accent }}>RC</span>}{c.auto && <span style={{ fontSize: '9px', color: S.success }}>AU</span>}</td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', color: S.textDim }}>{c.set}</td>
                      <td style={{ padding: '8px 12px' }}>{sportBadge(c.sport)}</td>
                      <td style={{ padding: '8px 12px', fontSize: '12px' }}>{c.grade}</td>
                      <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>${c.price}</td>
                      <td style={{ padding: '8px 12px', fontSize: '11px', color: S.textDim, fontFamily: S.mono }}>{c.serial || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={() => enhanceCard(c)} disabled={enhancing} style={{ background: 'none', border: 'none', color: S.accent, cursor: 'pointer', fontSize: '11px', padding: '2px 6px' }} title="Venice AI enhance">AI</button>
                        <button onClick={() => editCard(c)} style={{ background: 'none', border: 'none', color: S.textDim, cursor: 'pointer', fontSize: '11px', padding: '2px 6px' }}>Edit</button>
                        <button onClick={() => deleteCard(c.id)} style={{ background: 'none', border: 'none', color: S.danger, cursor: 'pointer', fontSize: '11px', padding: '2px 6px' }}>Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BULK EDIT TAB */}
        {tab === 'bulk' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Bulk Sport · {selected.size} selected</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {SPORTS.map(s => <Btn key={s} onClick={() => bulkSetSport(s)} small>{s}</Btn>)}
              </div>
            </div>
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Bulk Grade · {selected.size} selected</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {GRADES.map(g => <Btn key={g} onClick={() => bulkSetGrade(g)} small>{g}</Btn>)}
              </div>
            </div>
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Bulk Price Adjust · {selected.size} selected</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={bulkPriceOp} onChange={e => setBulkPriceOp(e.target.value)} style={{ background: S.surface2, color: S.text, border: `1px solid ${S.border}`, borderRadius: '4px', padding: '6px 8px', fontSize: '12px' }}>
                  <option value="percent">Percent ±</option>
                  <option value="fixed">Fixed ±</option>
                  <option value="set">Set To</option>
                </select>
                <input type="number" value={bulkPriceVal} onChange={e => setBulkPriceVal(e.target.value)} placeholder="10 or -5" style={{ background: S.surface2, color: S.text, border: `1px solid ${S.border}`, borderRadius: '4px', padding: '6px 8px', fontSize: '12px', width: '100px' }} />
                <Btn onClick={bulkAdjustPrice} small primary>Apply</Btn>
              </div>
            </div>
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Venice AI Enhancement · {selected.size} selected</div>
              <p style={{ fontSize: '12px', color: S.textDim, marginBottom: '12px' }}>Uses Venice AI (llama-3.3-70b) to generate SEO-optimized eBay titles and HTML descriptions for selected cards.</p>
              <Btn onClick={enhanceBatch} disabled={enhancing || selected.size === 0} primary small>{enhancing ? 'Enhancing...' : `Enhance ${selected.size} Cards`}</Btn>
            </div>
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: S.danger }}>Danger Zone</div>
              <Btn onClick={bulkDelete} small style={{ color: S.danger }}>Delete {selected.size} Cards</Btn>
            </div>
          </div>
        )}

        {/* IMAGE TOOLS TAB */}
        {tab === 'crop' && (
          <div>
            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', marginBottom: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Upload Card Images</div>
              <input type="file" accept="image/*" multiple onChange={onUpload} style={{ fontSize: '12px', color: S.textDim }} />
              <div style={{ marginTop: '12px', fontSize: '11px', color: S.textDim }}>Max 24 images at once · JPG/PNG/WebP · Up to 25MB each</div>
            </div>

            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', marginBottom: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Auto-Crop & Resize</div>
              <p style={{ fontSize: '12px', color: S.textDim, marginBottom: '12px' }}>Upload an image, then click auto-crop. Removes borders and resizes to eBay-optimized 1000x1400px.</p>
              <CropTool API={API} onToast={showToast} />
            </div>

            <div style={{ background: S.surface, borderRadius: S.radius, padding: '20px', border: `1px solid ${S.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Import from rbeachgebay</div>
              <p style={{ fontSize: '12px', color: S.textDim, marginBottom: '12px' }}>172 card images found at /mnt/c/Users/peter/Desktop/rbeachgebay/</p>
              <Btn onClick={importInventory} small>Import All as Cards</Btn>
            </div>
          </div>
        )}

        {/* CSV TAB */}
        {tab === 'csv' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <Btn onClick={generateCSV} primary>Generate eBay CSV</Btn>
              <a href={`${API}/download-csv`} download style={{ textDecoration: 'none' }}><Btn small>Download CSV</Btn></a>
            </div>
            {stats.written > 0 && (
              <div style={{ marginBottom: '12px', fontSize: '12px', color: S.textDim }}>Generated: {stats.written} rows, skipped: {stats.skipped}</div>
            )}
            {csv && (
              <div style={{ background: S.surface, borderRadius: S.radius, padding: '16px', border: `1px solid ${S.border}`, maxHeight: '600px', overflow: 'auto' }}>
                <pre style={{ fontSize: '11px', fontFamily: S.mono, whiteSpace: 'pre', color: S.textDim, margin: 0 }}>{csv.substring(0, 5000)}{csv.length > 5000 ? '\n... (' + csv.length + ' chars total)' : ''}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Crop tool component
function CropTool({ API, onToast }) {
  const [filename, setFilename] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [start, setStart] = useState(null);
  const imgRef = useRef(null);

  const onUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('images', file);
    fetch(`${API}/upload`, { method: 'POST', body: fd })
      .then(r => r.json()).then(d => {
        if (d.files?.[0]) {
          setFilename(d.files[0].filename);
          setImgUrl(`http://localhost:3999${d.files[0].path}`);
          onToast('Image uploaded');
        }
      });
  };

  const onMouseDown = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(true);
  };

  const onMouseMove = (e) => {
    if (!dragging || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setCrop({
      x: Math.min(start.x, cx),
      y: Math.min(start.y, cy),
      w: Math.abs(cx - start.x),
      h: Math.abs(cy - start.y),
    });
  };

  const onMouseUp = () => setDragging(false);

  const doCrop = () => {
    if (crop.w < 10 || crop.h < 10 || !imgRef.current) return;
    const scaleX = imgRef.current.naturalWidth / imgRef.current.clientWidth;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.clientHeight;
    fetch(`${API}/crop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, x: Math.round(crop.x * scaleX), y: Math.round(crop.y * scaleY), width: Math.round(crop.w * scaleX), height: Math.round(crop.h * scaleY) })
    }).then(r => r.json()).then(d => {
      if (d.croppedPath) onToast(`Cropped: ${d.filename}`);
      else onToast('Crop failed', 'danger');
    });
  };

  const doAutoCrop = () => {
    if (!filename) return;
    fetch(`${API}/auto-crop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) })
      .then(r => r.json()).then(d => {
        if (d.croppedPath) onToast(`Auto-cropped: ${d.croppedPath} (${d.croppedSize?.width}x${d.croppedSize?.height})`);
        else onToast('Auto-crop failed', 'danger');
      });
  };

  return (
    <div>
      <input type="file" accept="image/*" onChange={onUpload} style={{ fontSize: '12px', color: '#71717a', marginBottom: '12px' }} />
      {imgUrl && (
        <div>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
            <img ref={imgRef} src={imgUrl} alt="crop" style={{ maxWidth: '500px', maxHeight: '400px', display: 'block', cursor: 'crosshair' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
            {crop.w > 0 && crop.h > 0 && (
              <div style={{ position: 'absolute', left: crop.x, top: crop.y, width: crop.w, height: crop.h, border: '2px solid #6366f1', background: 'rgba(99,102,241,0.1)', pointerEvents: 'none' }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={doCrop} style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Crop Selected</button>
            <button onClick={doAutoCrop} style={{ padding: '6px 12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Auto-Crop + Resize</button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#71717a' }}>Drag to select crop area, or click auto-crop to detect and trim borders automatically.</div>
        </div>
      )}
    </div>
  );
}

// Reusable components
function Input({ label, value, onChange, placeholder, type }) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>{label}</label>
      <input type={type || 'text'} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: '#1a1a1f', color: '#e4e4e7', border: '1px solid #2a2a30', borderRadius: '4px', padding: '8px 10px', fontSize: '13px', outline: 'none' }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: '#1a1a1f', color: '#e4e4e7', border: '1px solid #2a2a30', borderRadius: '4px', padding: '8px 10px', fontSize: '13px', outline: 'none' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Btn({ children, onClick, primary, small, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '6px 12px' : '8px 16px', background: primary ? '#6366f1' : '#1a1a1f', color: primary ? '#fff' : '#e4e4e7',
      border: primary ? 'none' : '1px solid #2a2a30', borderRadius: '4px', fontSize: small ? '11px' : '13px', fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, ...style
    }}>{children}</button>
  );
}
