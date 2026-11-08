import { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { applyAppearance, readable, FONTS, SIZES } from "./themeEngine";

const DEF = {
  out: "#f5dce3",
  inn: "#fffdf9",
  accent: "#e9a5b9",
};

const newId = () => Math.random().toString(36).slice(2, 9);

export default function Appearance({ user, prefs }) {
  const ref = doc(db, "users", user.uid, "prefs", "appearance");

  const [out, setOut] = useState(prefs.out ?? null);
  const [inn, setInn] = useState(prefs.inn ?? null);
  const [accent, setAccent] = useState(prefs.accent ?? null);

  const [theme, setTheme] = useState(prefs.theme || "light");
  const [font, setFont] = useState(prefs.font || "system");
  const [size, setSize] = useState(prefs.size || "default");

  const [combos, setCombos] = useState(prefs.combos || []);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [delId, setDelId] = useState(null);
  const [msg, setMsg] = useState("");

  // Keep local settings synchronized with Firebase
  useEffect(() => {
    setOut(prefs.out ?? null);
    setInn(prefs.inn ?? null);
    setAccent(prefs.accent ?? null);
    setTheme(prefs.theme || "light");
    setFont(prefs.font || "system");
    setSize(prefs.size || "default");
    setCombos(prefs.combos || []);
  }, [prefs]);

  // Save settings to Firebase
  const save = async (patch) => {
    setMsg("");

    try {
      await setDoc(ref, patch, { merge: true });
      return true;
    } catch (error) {
      console.error("Appearance save error:", error);
      setMsg("Couldn't save. Check Firebase permissions.");
      return false;
    }
  };

  // Apply settings immediately
  const show = (patch) => {
    applyAppearance({
      ...prefs,
      theme,
      font,
      size,
      out,
      inn,
      accent,
      ...patch,
    });
  };

  // Theme selection
  const pickTheme = async (value) => {
    setTheme(value);
    show({ theme: value });
    await save({ theme: value });
  };

  // Font selection
  const pickFont = async (value) => {
    setFont(value);
    show({ font: value });
    await save({ font: value });
  };

  // Text size selection
  const pickSize = async (value) => {
    setSize(value);
    show({ size: value });
    await save({ size: value });
  };

  // Colour selection
  const changeColor = (key, value) => {
    if (key === "out") setOut(value);
    if (key === "inn") setInn(value);
    if (key === "accent") setAccent(value);

    show({ [key]: value });
  };

  const saveColors = async () => {
    if (await save({ out, inn, accent })) {
      setMsg("Colours saved successfully!");
    }
  };

  const resetColors = async () => {
    setOut(null);
    setInn(null);
    setAccent(null);

    show({ out: null, inn: null, accent: null });

    if (await save({ out: null, inn: null, accent: null })) {
      setMsg("Colours reset to default.");
    }
  };

  // Save a new combination or update an existing one
  const saveCombo = async () => {
    const nm = name.trim();

    if (!nm) {
      setMsg("Please give your combination a name.");
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
      ? combos.map((c) => c.id === editingId ? item : c)
      : [...combos, item];

    if (await save({ combos: next })) {
      setCombos(next);
      setName("");
      setEditingId(null);
      setMsg("Colour combination saved!");
    }
  };

  // Apply a saved combination
  const useCombo = async (c) => {
    setOut(c.out);
    setInn(c.inn);
    setAccent(c.accent);

    show({
      out: c.out,
      inn: c.inn,
      accent: c.accent,
    });

    if (await save({
      out: c.out,
      inn: c.inn,
      accent: c.accent,
    })) {
      setMsg(`${c.name} applied successfully!`);
    }
  };

  // Edit a saved combination
  const editCombo = (c) => {
    setOut(c.out);
    setInn(c.inn);
    setAccent(c.accent);

    show({
      out: c.out,
      inn: c.inn,
      accent: c.accent,
    });

    setName(c.name);
    setEditingId(c.id);
    setMsg("Edit your colours and press Update.");
  };

  // Delete a saved combination
  const deleteCombo = async (id) => {
    const next = combos.filter((c) => c.id !== id);

    if (await save({ combos: next })) {
      setCombos(next);
      setDelId(null);
      setMsg("Combination deleted.");
    }
  };

  return (
    <div className="settings-block">

      <h4 className="sec">Theme</h4>

      <div className="opt-row">
        {[
          ["light", "☀️ Light"],
          ["dark", "🌙 Dark"],
          ["system", "💻 System"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={theme === id ? "opt on" : "opt"}
            onClick={() => pickTheme(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <h4 className="sec">Colours</h4>

      <div className="color-row">
        <label>My messages</label>
        <input
          type="color"
          value={out || DEF.out}
          onChange={(e) => changeColor("out", e.target.value)}
        />
      </div>

      <div className="color-row">
        <label>Their messages</label>
        <input
          type="color"
          value={inn || DEF.inn}
          onChange={(e) => changeColor("inn", e.target.value)}
        />
      </div>

      <div className="color-row">
        <label>App accent</label>
        <input
          type="color"
          value={accent || DEF.accent}
          onChange={(e) => changeColor("accent", e.target.value)}
        />
      </div>

      <div className="preview">
        <div
          className="msg"
          style={{
            background: inn || DEF.inn,
            color: readable(inn || DEF.inn),
          }}
        >
          Hey! How are you? 👋
        </div>

        <div
          className="msg mine"
          style={{
            background: out || DEF.out,
            color: readable(out || DEF.out),
            alignSelf: "flex-end",
          }}
        >
          Doing great, thanks! 💗
        </div>
      </div>

      <div className="opt-row">
        <button onClick={saveColors}>Save colours</button>
        <button className="secondary" onClick={resetColors}>
          Reset to default
        </button>
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
              <button className="mini-btn" onClick={() => deleteCombo(c.id)}>
                Delete
              </button>
              <button
                className="secondary mini-btn"
                onClick={() => setDelId(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="mini-btn" onClick={() => useCombo(c)}>
                Use
              </button>
              <button
                className="secondary mini-btn"
                onClick={() => editCombo(c)}
              >
                Edit
              </button>
              <button
                className="secondary mini-btn"
                onClick={() => setDelId(c.id)}
              >
                🗑
              </button>
            </>
          )}
        </div>
      ))}

      {combos.length === 0 && (
        <small className="hint">No saved combinations yet.</small>
      )}

      <div className="row-inline">
        <input
          placeholder="Name this combination"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />

        <button onClick={saveCombo}>
          {editingId ? "Update" : "Save"}
        </button>
      </div>

      <h4 className="sec">Font</h4>

      <div className="opt-row">
        {FONTS.map((f) => (
          <button
            key={f.id}
            className={font === f.id ? "opt on" : "opt"}
            style={{ fontFamily: f.css }}
            onClick={() => pickFont(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <h4 className="sec">Text size</h4>

      <div className="opt-row">
        {SIZES.map((s) => (
          <button
            key={s.id}
            className={size === s.id ? "opt on" : "opt"}
            onClick={() => pickSize(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      {msg && <small>{msg}</small>}

    </div>
  );
}