
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
  { text: "Studying", emoji: "📚" },
  { text: "Busy", emoji: "⏳" },
  { text: "Listening to music", emoji: "🎧" },
  { text: "Chilling", emoji: "😌" },
  { text: "Working", emoji: "💻" },
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
  const [moodEmoji, setMoodEmoji] = useState("");
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

  // Save mood status
  const saveMood = async (text, emoji) => {
    if (!text.trim()) return;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        mood: {
          text: text.trim().slice(0, 40),
          emoji: (emoji || "").trim().slice(0, 4),
          expiresAt: Timestamp.fromMillis(
            Date.now() + 8 * 60 * 60 * 1000
          ),
        },
      });

      setMoodOpen(false);
      setMoodText("");
      setMoodEmoji("");
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
        📌
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
          onClick={() => setMoodOpen(true)}
        >
          {active
            ? `${profile.mood.emoji} ${profile.mood.text}`
            : "＋ Set a mood"}
        </button>
      </div>

      {/* Search */}
      <input
        placeholder="🔍 Search chats and contacts"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

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
        >
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setMoodOpen(false)}
            >
              ✕
            </button>

            <h3 style={{ margin: 0 }}>
              How are you feeling?
            </h3>

            <div className="mood-opts">
              {MOODS.map((m) => (
                <button
                  key={m.text}
                  onClick={() => saveMood(m.text, m.emoji)}
                >
                  {m.emoji} {m.text}
                </button>
              ))}
            </div>

            <small>Or write your own</small>

            <div
              className="row-inline"
              style={{ width: "100%" }}
            >
              <input
                style={{ width: 54, flex: "none" }}
                value={moodEmoji}
                placeholder="😀"
                maxLength={4}
                onChange={(e) => setMoodEmoji(e.target.value)}
              />

              <input
                value={moodText}
                placeholder="Custom status"
                maxLength={40}
                onChange={(e) => setMoodText(e.target.value)}
              />
            </div>

            <button
              onClick={() => saveMood(moodText, moodEmoji)}
            >
              Save
            </button>

            {active && (
              <button
                className="secondary"
                onClick={clearMood}
              >
                Remove my status
              </button>
            )}

            <small>Your status disappears after 8 hours</small>
          </div>
        </div>
      )}
    </div>
  );
}
