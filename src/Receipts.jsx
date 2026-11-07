import { useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  collection, query, where, onSnapshot, doc, setDoc, serverTimestamp,
} from "firebase/firestore";

export default function Receipts({ user }) {
  const marked = useRef(new Set());

  useEffect(() => {
    const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) => {
      snap.docs.forEach((d) => {
        const c = d.data();
        const at = c.lastAt?.seconds;
        if (!at || !c.lastSender || c.lastSender === user.uid) return;
        const done = c.delivered?.[user.uid]?.seconds ?? 0;
        const key = d.id + ":" + at;
        if (done >= at || marked.current.has(key)) return;
        marked.current.add(key);
        setDoc(
          doc(db, "chats", d.id),
          { delivered: { [user.uid]: serverTimestamp() } },
          { merge: true }
        ).catch(() => marked.current.delete(key));
      });
    });
  }, [user.uid]);

  return null;
}