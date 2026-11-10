
import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const MOODS = [
  "Studying",
  "Busy",
  "Listening to music",
  "Chilling",
  "Working",
];

function greeting() {
  const h = new Date().getHours();

  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeLabel(ts) {
  if (!ts?.toDate) return "";

  const d = ts.toDate();
  const now = new Date();

  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

const moodActive = (m) =>
  !!m &&
  !!m.expiresAt?.toMillis &&
  m.expiresAt.toMillis() > Date.now();

export default function Home({
  user,
  profile,
  nicks,
  onOpen,
  onProfile,
  onFindPeople,
  onNewGroup,
}) {
  const [chats, setChats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [links, setLinks] = useState([]);
  const [pins, setPins] = useState(new Set());
  const [people, setPeople] = useState({});
  const [search, setSearch] = useState("");
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodText, setMoodText] = useState("");
  const [selectedMood, setSelectedMood] = useState("");
  const [, tick] = useState(0);

  // Refresh time-based UI every minute
  useEffect(() => {
    const t = setInterval(() => {
      tick((n) => n + 1);
    }, 60000);

    return () => clearInterval(t);
  }, []);

  // Listen to chats, contacts, pins and groups
  useEffect(() => {
    if (!user?.uid) return;

    const u1 = onSnapshot(
      query(
        collection(db, "chats"),
        where("members", "array-contains", user.uid)
      ),
      (snap) => {
        setChats(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => console.error("Chat listener error:", error)
    );

    const u2 = onSnapshot(
      query(
        collection(db, "contactLinks"),
        where("members", "array-contains", user.uid)
      ),
      (snap) => {
        setLinks(
          snap.docs
            .map((d) =>
              d.data().members.find((m) => m !== user.uid)
            )
            .filter(Boolean)
        );
      },
      (error) => console.error("Contact listener error:", error)
    );

    const u3 = onSnapshot(
      collection(db, "users", user.uid, "pins"),
      (snap) => {
        setPins(new Set(snap.docs.map((d) => d.id)));
      },
      (error) => console.error("Pin listener error:", error)
    );

    const u4 = onSnapshot(
      query(
        collection(db, "groups"),
        where("members", "array-contains", user.uid)
      ),
      (snap) => {
        setGroups(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => console.error("Group listener error:", error)
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [user?.uid]);

  // Load contact profiles
  useEffect(() => {
    if (!user?.uid) return;

    const ids = new Set(links);

    chats.forEach((c) => {
      const other = c.members?.find((m) => m !== user.uid);
      if (other) ids.add(other);
    });

    ids.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id))
          .then((s) => {
            if (s.exists()) {
              setPeople((p) => ({
                ...p,
                [id]: s.data(),
              }));
            }
          })
          .catch((error) => {
            console.error("Could not load contact profile:", error);
          });
      }
    });
  }, [chats, links, user?.uid, people]);

  // Pin and unpin conversations
  const togglePin = async (id) => {
    if (!user?.uid || !id) return;

    const ref = doc(db, "users", user.uid, "pins", id);

    try {
      if (pins.has(id)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          at: Date.now(),
        });
      }
    } catch (error) {
      console.error("Could not update conversation pin:", error);
    }
  };

  // Open the editor with the current status, if one is active.
  const openMoodEditor = () => {
    const currentText = profile?.mood?.text || "";
    if (MOODS.includes(currentText)) {
      setSelectedMood(currentText);
      setMoodText("");
    } else {
      setSelectedMood("");
      setMoodText(currentText);
    }
    setMoodOpen(true);
  };

  // Save a text-only mood status for eight hours.
  const saveMood = async () => {
    const text = (moodText.trim() || selectedMood).trim();
    if (!text || !user?.uid) return;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        mood: {
          text: text.slice(0, 40),
          expiresAt: Timestamp.fromMillis(
            Date.now() + 8 * 60 * 60 * 1000
          ),
        },
      });

      setMoodOpen(false);
      setMoodText("");
      setSelectedMood("");
    } catch (error) {
      console.error("Could not save mood:", error);
    }
  };

  // Clear mood status
  const clearMood = async () => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        mood: null,
      });

      setMoodOpen(false);
    } catch (error) {
      console.error("Could not clear mood:", error);
    }
  };

  // Prepare private conversations
  const privateItems = chats.map((c) => {
    const other = c.members?.find((m) => m !== user.uid);
    const p = people[other];

    return {
      id: c.id,
      other,
      group: false,
      name: nicks?.[other] || p?.name || "...",
      username: p?.username || "",
      photo: p?.photoURL,
      last:
        (c.lastSender === user.uid ? "You: " : "") +
        (c.lastMessage || ""),
      lastAt: c.lastAt,
      unread: c.unread?.[user.uid] || 0,
    };
  });

  // Prepare group conversations
  const groupItems = groups.map((g) => ({
    id: g.id,
    group: true,
    name: g.name || "Unnamed group",
    username: "",
    photo: g.photoURL,
    last:
      (g.lastSender === user.uid ? "You: " : "") +
      (g.lastMessage || ""),
    lastAt: g.lastAt,
    unread: g.unread?.[user.uid] || 0,
  }));

  // Combine private and group conversations.
  // Pinned chats appear first, followed by newest activity.
  const items = [...privateItems, ...groupItems].sort((a, b) => {
    const aPinned = pins.has(a.id);
    const bPinned = pins.has(b.id);

    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    const aTime =
      a.lastAt?.toMillis?.() ??
      (a.lastAt?.seconds != null ? a.lastAt.seconds * 1000 : 0);

    const bTime =
      b.lastAt?.toMillis?.() ??
      (b.lastAt?.seconds != null ? b.lastAt.seconds * 1000 : 0);

    return bTime - aTime;
  });

  // Pinned conversations for the top avatar strip
  const pinnedItems = items.filter((it) => pins.has(it.id));

  // Open private or group conversation
  const open = (it) => {
    if (it.group) {
      onOpen({
        id: it.id,
        group: true,
      });
    } else {
      onOpen({
        id: it.id,
        otherUid: it.other,
        group: false,
      });
    }
  };

  // Search
  const q = search.trim().toLowerCase();

  const match = (it) =>
    !q ||
    `${it.name} ${it.username}`.toLowerCase().includes(q);

  // Keep pinned conversations in the main inbox too
  const listItems = q
    ? items.filter(match)
    : items;

  // Contacts without an existing conversation
  const contactOnly = q
    ? links
        .filter(
          (uid) => !chats.some((c) => c.members.includes(uid))
        )
        .map((uid) => ({
          uid,
          p: people[uid],
        }))
        .filter(({ uid, p }) =>
          (
            (nicks?.[uid] || "") +
            " " +
            (p?.name || "") +
            " " +
            (p?.username || "")
          )
            .toLowerCase()
            .includes(q)
        )
    : [];

  // Render full-width conversation rows
  const renderRow = (it) => (
    <div
      className="item tether-message-row"
      key={it.id}
      onClick={() => open(it)}
    >
      <span
        onClick={(e) => {
          if (!it.group) {
            e.stopPropagation();
            onProfile(it.other);
          }
        }}
      >
        <Avatar
          src={it.photo}
          name={it.name}
          size={52}
        />
      </span>

      <div className="item-text grow">
        <b>{it.name}</b>
        <small>{it.last || "No messages yet"}</small>
      </div>

      <div className="meta">
        <small>{timeLabel(it.lastAt)}</small>

        {it.unread > 0 && (
          <span className="badge">
            {it.unread}
          </span>
        )}
      </div>

      <button
        className={pins.has(it.id) ? "pin on" : "pin off"}
        onClick={(e) => {
          e.stopPropagation();
          togglePin(it.id);
        }}
        title={pins.has(it.id) ? "Unpin conversation" : "Pin conversation"}
        aria-label={pins.has(it.id) ? "Unpin conversation" : "Pin conversation"}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M8 4.5h8l-.8 5.2 2.8 2.8v1H6v-1l2.8-2.8L8 4.5Z" />
          <path d="M12 13.5V21" />
        </svg>
      </button>

      <span className="tether-chevron">›</span>
    </div>
  );

  const active = moodActive(profile?.mood);

  return (
    <div className="list">
      {/* Greeting and mood */}
      <div className="hello">
        <h3>
          {greeting()}, {profile?.name}
        </h3>

        <button
          className="mood-btn"
          onClick={openMoodEditor}
        >
          {active ? profile.mood.text : "＋ Set a mood"}
        </button>
      </div>

      {/* Search */}
      <div
        className="tether-search-wrap"
        style={{ position: "relative", width: "100%" }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: "absolute",
            left: 15,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted, #91858b)",
            pointerEvents: "none",
          }}
        >
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4.2 4.2" />
        </svg>
        <input
          className="tether-search-input"
          placeholder="Search chats and contacts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", paddingLeft: 42 }}
        />
      </div>

      {/* New group */}
      <button
        className="secondary new-group"
        onClick={onNewGroup}
      >
        ＋ New group
      </button>

      {/* Pinned contacts — horizontal avatar strip */}
      {!q && pinnedItems.length > 0 && (
        <div className="tether-pinned-section">
          <div className="tether-pinned-strip">
            {pinnedItems.map((it) => (
              <div
                className="tether-pinned-contact"
                key={it.id}
                onClick={() => open(it)}
                title={it.name}
              >
                <div className="tether-pinned-avatar">
                  <Avatar
                    src={it.photo}
                    name={it.name}
                    size={64}
                  />

                  {it.unread > 0 && (
                    <span className="badge">
                      {it.unread}
                    </span>
                  )}
                </div>

                <small>{it.name}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main inbox — all conversations, including pinned ones */}
      {listItems.map(renderRow)}

      {/* Search results for contacts without existing chats */}
      {contactOnly.map(({ uid, p }) => (
        <div
          className="item tether-message-row"
          key={uid}
          onClick={() =>
            onOpen({
              id: [user.uid, uid].sort().join("_"),
              otherUid: uid,
              group: false,
            })
          }
        >
          <Avatar
            src={p?.photoURL}
            name={nicks?.[uid] || p?.name || "?"}
            size={52}
          />

          <div className="item-text grow">
            <b>{nicks?.[uid] || p?.name || "Unknown contact"}</b>
            <small>Contact · tap to start chatting</small>
          </div>

          <span className="tether-chevron">›</span>
        </div>
      ))}

      {/* Empty search results */}
      {q && listItems.length === 0 && contactOnly.length === 0 && (
        <p className="hint">
          No chats or contacts match
        </p>
      )}

      {/* Empty inbox */}
      {!q && items.length === 0 && (
        <div className="invite">
          <span>
            No chats yet. Find a friend by their @username and say hi!
          </span>

          <button onClick={onFindPeople}>
            Find people
          </button>
        </div>
      )}

      {/* Mood editor */}
      {moodOpen && (
        <div
          className="overlay"
          onClick={() => setMoodOpen(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(35, 29, 32, 0.42)",
            backdropFilter: "blur(5px)",
          }}
        >
          <div
            className="sheet mood-editor"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(100%, 520px)",
              boxSizing: "border-box",
              padding: "30px",
              borderRadius: 24,
              background: "var(--surface, #fffdfb)",
              color: "var(--text, #393239)",
              boxShadow: "0 24px 70px rgba(35, 29, 32, 0.16)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <button
              type="button"
              aria-label="Close status editor"
              onClick={() => setMoodOpen(false)}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                width: 38,
                height: 38,
                border: "1px solid var(--border, #eee5e7)",
                borderRadius: "50%",
                background: "var(--surface2, #f7f2ef)",
                color: "var(--text, #393239)",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div style={{ paddingRight: 42 }}>
              <h3 style={{ margin: 0, fontSize: 21, fontWeight: 600 }}>
                How are you feeling?
              </h3>
              <p style={{
                margin: "7px 0 0",
                color: "var(--muted, #91858b)",
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                Choose a status or write your own.
              </p>
            </div>

            <div
              className="mood-opts"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 9,
              }}
            >
              {MOODS.map((mood) => {
                const selected = selectedMood === mood && !moodText.trim();
                return (
                  <button
                    key={mood}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedMood(mood);
                      setMoodText("");
                    }}
                    style={{
                      minHeight: 43,
                      padding: "10px 16px",
                      border: selected
                        ? "1px solid var(--accent, #d98da7)"
                        : "1px solid var(--border, #eee5e7)",
                      borderRadius: 12,
                      background: selected
                        ? "var(--accent-soft, #f7e5eb)"
                        : "var(--surface2, #faf7f5)",
                      color: "var(--text, #393239)",
                      fontSize: 14,
                      fontWeight: selected ? 600 : 400,
                      cursor: "pointer",
                      transition: "background 150ms ease, border-color 150ms ease",
                    }}
                  >
                    {mood}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label
                htmlFor="tether-custom-mood"
                style={{
                  color: "var(--muted, #91858b)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                }}
              >
                Custom status
              </label>
              <input
                id="tether-custom-mood"
                value={moodText}
                placeholder="Write a status..."
                maxLength={40}
                onChange={(e) => {
                  setMoodText(e.target.value);
                  if (e.target.value.trim()) setSelectedMood("");
                }}
                style={{
                  width: "100%",
                  minHeight: 48,
                  boxSizing: "border-box",
                  padding: "12px 14px",
                  border: "1px solid var(--border, #eee5e7)",
                  borderRadius: 12,
                  background: "var(--surface, #fffdfb)",
                  color: "var(--text, #393239)",
                  font: "inherit",
                  fontSize: 14,
                  outlineColor: "var(--accent, #d98da7)",
                }}
              />
              <small style={{
                color: "var(--muted, #91858b)",
                fontSize: 11,
                textAlign: "right",
              }}>
                {(moodText || selectedMood).length}/40
              </small>
            </div>

            <button
              type="button"
              onClick={saveMood}
              disabled={!moodText.trim() && !selectedMood}
              style={{
                width: "100%",
                minHeight: 46,
                border: "1px solid var(--accent, #d98da7)",
                borderRadius: 12,
                background: "var(--accent, #e8a0b7)",
                color: "var(--accent-text, #392b31)",
                fontSize: 14,
                fontWeight: 600,
                cursor: !moodText.trim() && !selectedMood ? "not-allowed" : "pointer",
                opacity: !moodText.trim() && !selectedMood ? 0.55 : 1,
              }}
            >
              Save status
            </button>

            {active && (
              <button
                type="button"
                onClick={clearMood}
                style={{
                  alignSelf: "center",
                  padding: "4px 10px",
                  border: 0,
                  background: "transparent",
                  color: "var(--muted, #91858b)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Remove status
              </button>
            )}

            <p style={{
              margin: 0,
              paddingTop: 3,
              color: "var(--muted, #91858b)",
              fontSize: 12,
              textAlign: "center",
            }}>
              Your status disappears after 8 hours.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
