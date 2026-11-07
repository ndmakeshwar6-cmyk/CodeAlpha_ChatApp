import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import Avatar from "./Avatar";

export default function People({ user, nicks, onOpen, onProfile }) {
  const [text, setText] = useState("");
  const [people, setPeople] = useState([]);

  useEffect(() => {
    const t = text.trim().toLowerCase();
    const col = collection(db, "users");
    const q = t
      ? query(col, where("nameLower", ">=", t), where("nameLower", "<=", t + "\uf8ff"), limit(30))
      : query(col, limit(50));
    getDocs(q).then((snap) =>
      setPeople(
        snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((p) => p.uid !== user.uid && p.profileDone)
      )
    );
  }, [text]);

  return (
    <div className="list">
      <input placeholder="🔍 Search people by name" value={text} onChange={(e) => setText(e.target.value)} />
      {people.map((p) => (
        <div className="item" key={p.uid} onClick={() => onOpen(p.uid)}>
          <span onClick={(e) => { e.stopPropagation(); onProfile(p.uid); }}>
            <Avatar src={p.photoURL} name={p.name} size={46} />
          </span>
          <div className="item-text">
            <b>{nicks[p.uid] || p.name}</b>
            {nicks[p.uid] && <small>{p.name}</small>}
          </div>
        </div>
      ))}
      {people.length === 0 && <p className="hint">No one found</p>}
    </div>
  );
}