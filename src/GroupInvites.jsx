import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection, query, where, onSnapshot, doc, updateDoc, arrayUnion,
} from "firebase/firestore";
import Avatar from "./Avatar";

export default function GroupInvites({ user, onJoined }) {
  const [invites, setInvites] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "groupInvites"),
      where("to", "==", user.uid),
      where("status", "==", "pending")
    );
    return onSnapshot(q, (snap) =>
      setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [user.uid]);

  const accept = async (i) => {
    setMsg("");
    try {
      await updateDoc(doc(db, "groups", i.gid), { members: arrayUnion(user.uid) });
      await updateDoc(doc(db, "groupInvites", i.id), { status: "accepted" });
      onJoined(i.gid);
    } catch {
      setMsg("Couldn't join this group. It may not exist anymore.");
    }
  };

  const decline = async (i) => {
    await updateDoc(doc(db, "groupInvites", i.id), { status: "declined" });
  };

  if (invites.length === 0 && !msg) return null;

  return (
    <div className="invites">
      {invites.map((i) => (
        <div className="req" key={i.id}>
          <Avatar src={i.groupPhoto} name={i.groupName} size={46} />
          <div className="item-text">
            <b>{i.groupName}</b>
            <small>{i.fromName} invited you to join</small>
          </div>
          <div className="req-btns">
            <button onClick={() => accept(i)}>Join</button>
            <button className="secondary" onClick={() => decline(i)}>Decline</button>
          </div>
        </div>
      ))}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}