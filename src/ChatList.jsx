import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import Avatar from "./Avatar";

export default function ChatList({ user, nicks, onOpen, onProfile }) {
  const [chats, setChats] = useState([]);
  const [people, setPeople] = useState({});

  useEffect(() => {
    const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.lastAt?.seconds ?? 9e12) - (a.lastAt?.seconds ?? 9e12));
      setChats(list);
    });
  }, [user.uid]);

  useEffect(() => {
    chats.forEach((c) => {
      const other = c.members.find((m) => m !== user.uid);
      if (other && !people[other]) {
        getDoc(doc(db, "users", other)).then((s) => {
          if (s.exists()) setPeople((p) => ({ ...p, [other]: s.data() }));
        });
      }
    });
  }, [chats]);

  return (
    <div className="list">
      <div className="item" onClick={() => onOpen({ id: "everyone", group: true })}>
        <div className="avatar fallback" style={{ width: 46, height: 46 }}>👥</div>
        <div className="item-text">
          <b>Everyone</b>
          <small>Group chat for all</small>
        </div>
      </div>

      {chats.map((c) => {
        const other = c.members.find((m) => m !== user.uid);
        const p = people[other];
        const name = nicks[other] || p?.name || "...";
        return (
          <div className="item" key={c.id} onClick={() => onOpen({ id: c.id, otherUid: other, group: false })}>
            <span onClick={(e) => { e.stopPropagation(); onProfile(other); }}>
              <Avatar src={p?.photoURL} name={name} size={46} />
            </span>
            <div className="item-text">
              <b>{name}</b>
              <small>{c.lastSender === user.uid ? "You: " : ""}{c.lastMessage}</small>
            </div>
          </div>
        );
      })}

      {chats.length === 0 && (
        <p className="hint">No private chats yet. Go to 👥 to start one.</p>
      )}
    </div>
  );
}