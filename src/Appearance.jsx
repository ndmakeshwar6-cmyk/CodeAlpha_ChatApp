
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

function ThemeIcon({ type }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (type === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.7" />
        <path d="M12 2.5v2M12 19.5v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2.5 12h2M19.5 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </svg>
    );
  }

  if (type === "dark") {
    return (
      <svg {...common}>
        <path d="M19.2 15.1A8 8 0 0 1 8.9 4.8 8.2 8.2 0 1 0 19.2 15.1Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="3.5" y="4" width="17" height="13" rx="1.8" />
      <path d="M8 21h8M12 17v4M3.5 14.5h17" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 14h11l1-14M9 7V4h6v3" />
    </svg>
  );
}

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

  useEffect(() => {
    setOut(prefs.out ?? null);
    setInn(prefs.inn ?? null);
    setAccent(prefs.accent ?? null);
    setTheme(prefs.theme || "light");
    setFont(prefs.font || "system");
    setSize(prefs.size || "default");
    setCombos(prefs.combos || []);
  }, [prefs]);

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

  const pickTheme = async (value) => {
    setTheme(value);
    show({ theme: value });
    await save({ theme: value });
  };

  const pickFont = async (value) => {
    setFont(value);
    show({ font: value });
    await save({ font: value });
  };

  const pickSize = async (value) => {
    setSize(value);
    show({ size: value });
    await save({ size: value });
  };

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
      ? combos.map((c) => (c.id === editingId ? item : c))
      : [...combos, item];

    if (await save({ combos: next })) {
      setCombos(next);
      setName("");
      setEditingId(null);
      setMsg("Colour combination saved!");
    }
  };

  const useCombo = async (c) => {
    setOut(c.out);
    setInn(c.inn);
    setAccent(c.accent);

    show({
      out: c.out,
      inn: c.inn,
      accent: c.accent,
    });

    if (
      await save({
        out: c.out,
        inn: c.inn,
        accent: c.accent,
      })
    ) {
      setMsg(`${c.name} applied successfully!`);
    }
  };

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

  const deleteCombo = async (id) => {
    const next = combos.filter((c) => c.id !== id);

    if (await save({ combos: next })) {
      setCombos(next);
      setDelId(null);
      setMsg("Combination deleted.");
    }
  };

  const colorOptions = [
    {
      key: "out",
      title: "My messages",
      description: "Your outgoing message bubbles",
      value: out || DEF.out,
    },
    {
      key: "inn",
      title: "Their messages",
      description: "Messages you receive",
      value: inn || DEF.inn,
    },
    {
      key: "accent",
      title: "App accent",
      description: "Buttons and selected elements",
      value: accent || DEF.accent,
    },
  ];

  return (
    <div className="appearance-page">

      <div className="appearance-intro">
        <h3>Make Tether yours</h3>
        <p>Personalise your chats, colours and typography.</p>
      </div>

      <section className="appearance-section">
        <div className="appearance-section-head">
          <h4>Theme</h4>
          <p>Choose how Tether looks.</p>
        </div>

        <div className="appearance-options">
          {[
            ["light", "Light"],
            ["dark", "Dark"],
            ["system", "System"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={theme === id}
              className={`appearance-option ${theme === id ? "is-selected" : ""}`}
              onClick={() => pickTheme(id)}
            >
              <span className="appearance-option-icon">
                <ThemeIcon type={id} />
              </span>
              <span>{label}</span>
              {theme === id && <span className="appearance-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="appearance-section">
        <div className="appearance-section-head">
          <h4>Chat colours</h4>
          <p>Pick colours for your messages and app controls.</p>
        </div>

        <div className="appearance-color-grid">
          {colorOptions.map((item) => (
            <label className="appearance-color-card" key={item.key}>
              <span className="appearance-color-info">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>

              <span className="appearance-color-control">
                <input
                  type="color"
                  aria-label={item.title}
                  value={item.value}
                  onChange={(e) => changeColor(item.key, e.target.value)}
                />
                <span className="appearance-color-code">
                  {item.value.toUpperCase()}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="appearance-preview">
          <div className="appearance-preview-heading">
            <span>Live preview</span>
            <small>See your colours in action</small>
          </div>

          <div className="appearance-preview-chat">
            <div
              className="appearance-preview-bubble"
              style={{
                background: inn || DEF.inn,
                color: readable(inn || DEF.inn),
              }}
            >
              Hey! How are you?
              <small>10:30</small>
            </div>

            <div
              className="appearance-preview-bubble outgoing"
              style={{
                background: out || DEF.out,
                color: readable(out || DEF.out),
              }}
            >
              Doing great, thanks!
              <small>10:31 ✓✓</small>
            </div>
          </div>
        </div>

        <div className="appearance-actions">
          <button type="button" className="appearance-primary" onClick={saveColors}>
            Save colours
          </button>
          <button type="button" className="appearance-secondary" onClick={resetColors}>
            Reset to default
          </button>
        </div>
      </section>

      <section className="appearance-section">
        <div className="appearance-section-head">
          <h4>Colour combinations</h4>
          <p>Save your favourite palettes and switch between them.</p>
        </div>

        <div className="appearance-combo-list">
          {combos.length === 0 && (
            <div className="appearance-empty">
              <p>No saved combinations yet.</p>
              <small>Create your first palette below.</small>
            </div>
          )}

          {combos.map((c) => (
            <div className="appearance-combo" key={c.id}>
              <div className="appearance-combo-details">
                <div className="appearance-swatches">
                  <span style={{ background: c.out }} />
                  <span style={{ background: c.inn }} />
                  <span style={{ background: c.accent }} />
                </div>
                <strong>{c.name}</strong>
              </div>

              <div className="appearance-combo-actions">
                {delId === c.id ? (
                  <>
                    <button
                      type="button"
                      className="appearance-danger"
                      onClick={() => deleteCombo(c.id)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="appearance-secondary"
                      onClick={() => setDelId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="appearance-primary"
                      onClick={() => useCombo(c)}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="appearance-secondary"
                      onClick={() => editCombo(c)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="appearance-icon-button"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => setDelId(c.id)}
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="appearance-save-combo">
          <input
            type="text"
            placeholder="Name your colour combination"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCombo();
            }}
          />

          <button
            type="button"
            className="appearance-primary"
            onClick={saveCombo}
          >
            {editingId ? "Update" : "Save palette"}
          </button>

          {editingId && (
            <button
              type="button"
              className="appearance-secondary"
              onClick={() => {
                setEditingId(null);
                setName("");
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="appearance-section">
        <div className="appearance-section-head">
          <h4>Font</h4>
          <p>Choose a font that feels like you.</p>
        </div>

        <div className="appearance-options appearance-font-options">
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={font === f.id}
              className={`appearance-option ${font === f.id ? "is-selected" : ""}`}
              style={{ fontFamily: f.css }}
              onClick={() => pickFont(f.id)}
            >
              {f.name}
              {font === f.id && <span className="appearance-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="appearance-section">
        <div className="appearance-section-head">
          <h4>Text size</h4>
          <p>Make messages comfortable to read.</p>
        </div>

        <div className="appearance-options appearance-size-options">
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={size === s.id}
              className={`appearance-option ${size === s.id ? "is-selected" : ""}`}
              onClick={() => pickSize(s.id)}
            >
              {s.name}
              {size === s.id && <span className="appearance-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {msg && (
        <div className="appearance-feedback" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
