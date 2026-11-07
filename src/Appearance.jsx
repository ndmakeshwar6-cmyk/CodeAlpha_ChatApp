import { useState } from "react";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { applyAppearance, readable, FONTS, SIZES } from "./appearance";

const DEF = { out: "#ffe0ec", inn: "#ffffff", accent: "#ff9fc4" };
const newId = () => Math.random().toString(36).slice(2, 9);

export default function Appearance({ user, prefs }) {
  const ref = doc(db, "users", user.uid, "prefs", "appearance");
  const [out, setOut] = useState(prefs.out ?? null);
  const [inn, setInn] = useState(prefs.inn ?? null);
  const [accent, setAccent] = useState(prefs.accent ?? null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [delId, setDelId] = useState(null);
  const [msg, setMsg] = useState("");
  const combos = prefs.combos || [];

  const save = async (patch) => {
    setMsg("");
    try {
      await setDoc(ref, patch, { merge: true });
      return true;
    } catch {
      setMsg("Couldn't save. Please try again.");
      return false;
    }
  };

  const show = (patch) => applyAppearance({ ...prefs, ...patch });
  const preview = (patch) => show({ out, inn, accent, ...patch });

  const pickTheme = (theme) => { show({ theme }); save({ theme }); };
  const pickFont = (font) => { show({ font }); save({ font }); };
  const pickSize = (size) => { show({ size }); save({ size }); };

  const saveColors = async () => {
    if (await save({ out, inn, accent })) setMsg("Colours saved ✅");
  };

  const resetColors = async () => {
    setOut(null);
    setInn(null);
    setAccent(null);
    show({ out: null, inn: null, accent: null });
    await save({ out: null, inn: null, accent: null });
  };

  const loadColors = (c) => {
    setOut(c.out);
    setInn(c.inn);
    setAccent(c.accent);
    preview({ out: c.out, inn: c.inn, accent: c.accent });
  };

  const useCombo = async (c) => {
    loadColors(c);
    await save({ out: c.out, inn: c.inn, accent: c.accent });
  };

  const editCombo = (c) => {
    loadColors(c);
    setName(c.name);
    setEditingId(c.id);
  };

  const saveCombo = async () => {
    const nm = name.trim();
    if (!nm) {
      setMsg("Give your combination a name");
      return;
    }
    const item = {
      id: editingId || newId(),
      name: nm.slice(0, 24),
      out: out || DEF.out,
      inn: inn || DEF.inn,
      accent: accent || DEF.accent,
    };
    const next = editingId
      ? combos.map((c) => (c.id === editingId ? item : c))
      : [...combos, item];
    if (await save({ combos: next })) {
      setName("");
      setEditingId(null);
      setMsg("Combination saved ✅");
    }
  };

  const deleteCombo = async (id) => {
    if (await save({ combos: combos.filter((c) => c.id !== id) })) setDelId(null);
  };

  return (
    <div className="settings-block">
      <h4 className="sec">Theme</h4>
      <div className="opt-row">
        {[["light", "☀️ Light"], ["dark", "🌙 Dark"], ["system", "💻 System"]].map(([id, label]) => (
          <button key={id} className={(prefs.theme || "light") === id ? "opt on" : "opt"} onClick={() => pickTheme(id)}>
            {label}
          </button>
        ))}
      </div>

      <h4 className="sec">Colours</h4>
      <div className="color-row">
        <label>My messages</label>
        <input type="color" value={out || DEF.out}
          onChange={(e) => { setOut(e.target.value); preview({ out: e.target.value }); }} />
      </div>
      <div className="color-row">
        <label>Their messages</label>
        <input type="color" value={inn || DEF.inn}
          onChange={(e) => { setInn(e.target.value); preview({ inn: e.target.value }); }} />
      </div>
      <div className="color-row">
        <label>App accent</label>
        <input type="color" value={accent || DEF.accent}
          onChange={(e) => { setAccent(e.target.value); preview({ accent: e.target.value }); }} />
      </div>

      <div className="preview">
        <div className="msg" style={{ background: inn || "var(--in)", color: inn ? readable(inn) : "var(--in-text)" }}>
          Hey! How are you? 👋
        </div>
        <div className="msg mine" style={{ background: out || "var(--out)", color: out ? readable(out) : "var(--out-text)", alignSelf: "flex-end" }}>
          Doing great, thanks! 💗
        </div>
      </div>

      <div className="opt-row">
        <button onClick={saveColors}>Save colours</button>
        <button className="secondary" onClick={resetColors}>Reset to default</button>
      </div>

      <h4 className="sec">Colour combinations</h4>
      {combos.map((c) => (
        <div className="combo" key={c.id}>
          <span className="swatch" style={{ background: c.out }} />
          <span className="swatch" style={{ background: c.inn }} />
          <span className="swatch" style={{ background: c.accent }} />
          <b className="grow">{c.name}</b>
          {delId === c.id ? (
            <>
              <button className="mini-btn" onClick={() => deleteCombo(c.id)}>Delete</button>
              <button className="secondary mini-btn" onClick={() => setDelId(null)}>No</button>
            </>
          ) : (
            <>
              <button className="mini-btn" onClick={() => useCombo(c)}>Use</button>
              <button className="secondary mini-btn" onClick={() => editCombo(c)}>Edit</button>
              <button className="secondary mini-btn" onClick={() => setDelId(c.id)}>🗑</button>
            </>
          )}
        </div>
      ))}
      {combos.length === 0 && <small className="hint">No saved combinations yet.</small>}
      <div className="row-inline">
        <input placeholder="Name this combination" value={name} maxLength={24}
          onChange={(e) => setName(e.target.value)} />
        <button onClick={saveCombo}>{editingId ? "Update" : "Save"}</button>
      </div>

      <h4 className="sec">Font</h4>
      <div className="opt-row">
        {FONTS.map((f) => (
          <button key={f.id} className={(prefs.font || "system") === f.id ? "opt on" : "opt"}
            style={{ fontFamily: f.css }} onClick={() => pickFont(f.id)}>
            {f.name}
          </button>
        ))}
      </div>

      <h4 className="sec">Text size</h4>
      <div className="opt-row">
        {SIZES.map((s) => (
          <button key={s.id} className={(prefs.size || "default") === s.id ? "opt on" : "opt"}
            onClick={() => pickSize(s.id)}>
            {s.name}
          </button>
        ))}
      </div>

      {msg && <small>{msg}</small>}
    </div>
  );
}