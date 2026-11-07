import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection, query, where, onSnapshot, doc, getDoc, setDoc,
  deleteDoc, updateDoc, Timestamp,
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
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

const moodActive = (m) =>
  !!m && !!m.expiresAt?.toMillis && m.expiresAt.toMillis() > Date.now();

export default function Home({ user, profile, nicks, onOpen, onProfile, onFindPeople, onNewGroup }) {
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

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, "chats"), where("members", "array-contains", user.uid)),
      (snap) => setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const u2 = onSnapshot(
      query(collection(db, "contactLinks"), where("members", "array-contains", user.uid)),
      (snap) => setLinks(snap.docs.map((d) => d.data().members.find((m) => m !== user.uid)))
    );
    const u3 = onSnapshot(collection(db, "users", user.uid, "pins"), (snap) =>
      setPins(new Set(snap.docs.map((d) => d.id)))
    );
    const u4 = onSnapshot(
      query(collection(db, "groups"), where("members", "array-contains", user.uid)),
      (snap) => setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); u3(); u4(); };
  }, [user.uid]);

  useEffect(() => {
    const ids = new Set(links);
    chats.forEach((c) => {
      const o = c.members.find((m) => m !== user.uid);
      if (o) ids.add(o);
    });
    ids.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id)).then((s) => {
          if (s.exists()) setPeople((p) => ({ ...p, [id]: s.data() }));
        });
      }
    });
  }, [chats, links]);

  const togglePin = async (id) => {
    const ref = doc(db, "users", user.uid, "pins", id);
    if (pins.has(id)) await deleteDoc(ref);
    else await setDoc(ref, { at: Date.now() });
  };

  const saveMood = async (text, emoji) => {
    if (!text.trim()) return;
    await updateDoc(doc(db, "users", user.uid), {
      mood: {
        text: text.trim().slice(0, 40),
        emoji: (emoji || "").trim().slice(0, 4),
        expiresAt: Timestamp.fromMillis(Date.now() + 8 * 60 * 60 * 1000),
      },
    });
    setMoodOpen(false);
    setMoodText("");
    setMoodEmoji("");
  };

  const clearMood = async () => {
    await updateDoc(doc(db, "users", user.uid), { mood: null });
    setMoodOpen(false);
  };

  const privateItems = chats.map((c) => {
    const other = c.members.find((m) => m !== user.uid);
    const p = people[other];
    return {
      id: c.id,
      other,
      group: false,
      name: nicks[other] || p?.name || "...",
      username: p?.username || "",
      photo: p?.photoURL,
      last: (c.lastSender === user.uid ? "You: " : "") + (c.lastMessage || ""),
      lastAt: c.lastAt,
      unread: c.unread?.[user.uid] || 0,
    };
  });

  const groupItems = groups.map((g) => ({
    id: g.id,
    group: true,
    name: g.name,
    username: "",
    photo: g.photoURL,
    last: (g.lastSender === user.uid ? "You: " : "") + (g.lastMessage || ""),
    lastAt: g.lastAt,
    unread: g.unread?.[user.uid] || 0,
  }));

  const items = [...privateItems, ...groupItems].sort(
    (a, b) => (b.lastAt?.seconds ?? 9e12) - (a.lastAt?.seconds ?? 9e12)
  );

  const open = (it) =>
    it.group
      ? onOpen({ id: it.id, group: true })
      : onOpen({ id: it.id, otherUid: it.other, group: false });

  const q = search.trim().toLowerCase();
  const match = (it) => !q || (it.name + " " + it.username).toLowerCase().includes(q);

  const pinnedItems = items.filter((i) => pins.has(i.id));
  const listItems = q ? items.filter(match) : items.filter((i) => !pins.has(i.id));

  const contactOnly = q
    ? links
        .filter((uid) => !chats.some((c) => c.members.includes(uid)))
        .map((uid) => ({ uid, p: people[uid] }))
        .filter(({ uid, p }) =>
          ((nicks[uid] || "") + " " + (p?.name || "") + " " + (p?.username || ""))
            .toLowerCase()
            .includes(q)
        )
    : [];

  const renderRow = (it) => (
    <div className="item" key={it.id} onClick={() => open(it)}>
      <span onClick={(e) => { if (!it.group) { e.stopPropagation(); onProfile(it.other); } }}>
        <Avatar src={it.photo} name={it.name} size={46} />
      </span>
      <div className="item-text grow">
        <b>{it.name}</b>
        <small>{it.last}</small>
      </div>
      <div className="meta">
        <small>{timeLabel(it.lastAt)}</small>
        {it.unread > 0 && <span className="badge">{it.unread}</span>}
      </div>
      <button
        className={pins.has(it.id) ? "pin on" : "pin off"}
        onClick={(e) => { e.stopPropagation(); togglePin(it.id); }}
      >
        📌
      </button>
    </div>
  );

  const active = moodActive(profile.mood);

  return (
    <div className="list">
      <div className="hello">
        <h3>{greeting()}, {profile.name}</h3>
        <button className="mood-btn" onClick={() => setMoodOpen(true)}>
          {active ? `${profile.mood.emoji} ${profile.mood.text}` : "＋ Set a mood"}
        </button>
      </div>

      <input placeholder="🔍 Search chats and contacts" value={search}
        onChange={(e) => setSearch(e.target.value)} />

      <button className="secondary new-group" onClick={onNewGroup}>＋ New group</button>

      {!q && pinnedItems.length > 0 && (
        <div className="pinned">
          {pinnedItems.map((it) => (
            <div className="pin-item" key={it.id} onClick={() => open(it)}>
              <Avatar src={it.photo} name={it.name} size={52} />
              <small>{it.name}</small>
              {it.unread > 0 && <span className="badge">{it.unread}</span>}
            </div>
          ))}
        </div>
      )}

      {listItems.map(renderRow)}

      {contactOnly.map(({ uid, p }) => (
        <div className="item" key={uid}
          onClick={() => onOpen({ id: [user.uid, uid].sort().join("_"), otherUid: uid, group: false })}>
          <Avatar src={p?.photoURL} name={nicks[uid] || p?.name || "?"} size={46} />
          <div className="item-text grow">
            <b>{nicks[uid] || p?.name}</b>
            <small>Contact · tap to start chatting</small>
          </div>
        </div>
      ))}

      {q && listItems.length === 0 && contactOnly.length === 0 && (
        <p className="hint">No chats or contacts match</p>
      )}

      {!q && items.length === 0 && (
        <div className="invite">
          <span>No chats yet. Find a friend by their @username and say hi!</span>
          <button onClick={onFindPeople}>Find people</button>
        </div>
      )}

      {moodOpen && (
        <div className="overlay" onClick={() => setMoodOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setMoodOpen(false)}>✕</button>
            <h3 style={{ margin: 0 }}>How are you feeling?</h3>
            <div className="mood-opts">
              {MOODS.map((m) => (
                <button key={m.text} onClick={() => saveMood(m.text, m.emoji)}>
                  {m.emoji} {m.text}
                </button>
              ))}
            </div>
            <small>Or write your own</small>
            <div className="row-inline" style={{ width: "100%" }}>
              <input style={{ width: 54, flex: "none" }} value={moodEmoji} placeholder="😀"
                maxLength={4} onChange={(e) => setMoodEmoji(e.target.value)} />
              <input value={moodText} placeholder="Custom status" maxLength={40}
                onChange={(e) => setMoodText(e.target.value)} />
            </div>
            <button onClick={() => saveMood(moodText, moodEmoji)}>Save</button>
            {active && <button className="secondary" onClick={clearMood}>Remove my status</button>}
            <small>Your status disappears after 8 hours</small>
          </div>
        </div>
      )}
    </div>
  );
}