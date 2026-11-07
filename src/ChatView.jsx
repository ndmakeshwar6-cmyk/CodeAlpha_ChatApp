import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, setDoc, doc, getDoc, deleteDoc, query, orderBy,
  onSnapshot, serverTimestamp, increment,
} from "firebase/firestore";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";
const FAIL = "Message couldn't be sent. Check your connection, or you may not be able to message this person.";

const clock = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
const ms = (x) => (x?.toMillis ? x.toMillis() : 0);

export default function ChatView({ user, profile, chat, nicks, onBack, onProfile }) {
  const [other, setOther] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatDoc, setChatDoc] = useState(null);
  const [iBlocked, setIBlocked] = useState(false);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [, tick] = useState(0);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const lastTyping = useRef(0);
  const readMarked = useRef("");

  const path = chat.group ? ["messages"] : ["chats", chat.id, "messages"];
  const title = chat.group ? "Everyone" : nicks[chat.otherUid] || other?.name || "Chat";

  useEffect(() => {
    if (chat.otherUid) {
      getDoc(doc(db, "users", chat.otherUid)).then((s) =>
        setOther(s.exists() ? s.data() : null)
      );
    }
  }, []);

  useEffect(() => {
    const q = query(collection(db, ...path), orderBy("createdAt"));
    return onSnapshot(q, (snap) =>
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    if (chat.group) return;
    return onSnapshot(doc(db, "chats", chat.id), (s) =>
      setChatDoc(s.exists() ? s.data() : { none: true })
    );
  }, []);

  useEffect(() => {
    if (!chat.otherUid) return;
    return onSnapshot(doc(db, "users", user.uid, "blocked", chat.otherUid), (s) =>
      setIBlocked(s.exists())
    );
  }, []);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const markRead = () => {
    if (chat.group || !chatDoc || chatDoc.none) return;
    if (document.visibilityState !== "visible") return;
    const last = messages[messages.length - 1];
    if (!last || last.uid === user.uid || !last.createdAt?.toMillis) return;
    const unread = chatDoc.unread?.[user.uid] || 0;
    const needs = ms(chatDoc.lastRead?.[user.uid]) < ms(last.createdAt) || unread > 0;
    if (!needs || readMarked.current === last.id) return;
    readMarked.current = last.id;
    setDoc(
      doc(db, "chats", chat.id),
      { lastRead: { [user.uid]: serverTimestamp() }, unread: { [user.uid]: 0 } },
      { merge: true }
    ).catch(() => { readMarked.current = ""; });
  };

  useEffect(() => {
    markRead();
    document.addEventListener("visibilitychange", markRead);
    window.addEventListener("focus", markRead);
    return () => {
      document.removeEventListener("visibilitychange", markRead);
      window.removeEventListener("focus", markRead);
    };
  }, [messages, chatDoc]);

  const onType = (v) => {
    setText(v);
    if (chat.group || iBlocked || !v || !chatDoc || chatDoc.none) return;
    const now = Date.now();
    if (now - lastTyping.current < 2500) return;
    lastTyping.current = now;
    setDoc(
      doc(db, "chats", chat.id),
      { typing: { [user.uid]: now } },
      { merge: true }
    ).catch(() => {});
  };

  const post = async (extra, preview) => {
    await addDoc(collection(db, ...path), {
      ...extra,
      uid: user.uid,
      senderName: profile.name,
      senderPhoto: profile.photoURL || "",
      createdAt: serverTimestamp(),
    });
    if (!chat.group) {
      await setDoc(
        doc(db, "chats", chat.id),
        {
          members: chat.id.split("_"),
          lastMessage: preview,
          lastSender: user.uid,
          lastAt: serverTimestamp(),
          unread: { [chat.otherUid]: increment(1) },
        },
        { merge: true }
      );
    }
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    setErr("");
    try {
      await post({ text: t }, t);
    } catch {
      setText(t);
      setErr(FAIL);
    }
  };

  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!data.secure_url) throw new Error(data.error?.message || "Upload failed");
      await post(
        { text: "", fileUrl: data.secure_url, fileName: file.name, fileType: file.type },
        "📎 " + file.name
      );
    } catch (error) {
      setErr(error.message === "Upload failed" ? "Upload failed. Try again." : FAIL);
    }
    setUploading(false);
    e.target.value = "";
  };

  const unblock = () =>
    deleteDoc(doc(db, "users", user.uid, "blocked", chat.otherUid));

  const tickFor = (m) => {
    if (chat.group || m.uid !== user.uid) return null;
    const t = ms(m.createdAt);
    if (!t) return { icon: "🕓", cls: "" };
    if (ms(chatDoc?.lastRead?.[chat.otherUid]) >= t) return { icon: "✓✓", cls: "read" };
    if (ms(chatDoc?.delivered?.[chat.otherUid]) >= t) return { icon: "✓✓", cls: "" };
    return { icon: "✓", cls: "" };
  };

  const theirTyping = chatDoc?.typing?.[chat.otherUid];
  const isTyping = !!theirTyping && Date.now() - theirTyping < 5000;

  return (
    <div className="chatview">
      <div className="chat-head">
        <button className="back" onClick={onBack}>←</button>
        {chat.group ? (
          <>
            <div className="avatar fallback" style={{ width: 40, height: 40 }}>👥</div>
            <b>Everyone</b>
          </>
        ) : (
          <div className="head-person" onClick={() => onProfile(chat.otherUid)}>
            <Avatar src={other?.photoURL} name={title} size={40} />
            <b>{title}</b>
          </div>
        )}
      </div>

      <div className="messages">
        {messages.map((m) => {
          const mine = m.uid === user.uid;
          const t = tickFor(m);
          return (
            <div key={m.id} className={mine ? "row mine" : "row"}>
              {chat.group && (
                <Avatar src={m.senderPhoto} name={m.senderName || "Guest"} size={32} />
              )}
              <div className={mine ? "msg mine" : "msg"}>
                {chat.group && <small>{nicks[m.uid] || m.senderName || "Guest"}</small>}
                {m.text && <div>{m.text}</div>}
                {m.fileUrl && m.fileType?.startsWith("image/") && (
                  <img src={m.fileUrl} alt={m.fileName} className="media" />
                )}
                {m.fileUrl && m.fileType?.startsWith("video/") && (
                  <video src={m.fileUrl} controls className="media" />
                )}
                {m.fileUrl && !m.fileType?.startsWith("image/") && !m.fileType?.startsWith("video/") && (
                  <a href={m.fileUrl} target="_blank" rel="noreferrer">📄 {m.fileName}</a>
                )}
                <div className="msg-meta">
                  <span>{clock(m.createdAt)}</span>
                  {t && <span className={"tick " + t.cls}>{t.icon}</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {isTyping && <small className="typing">typing…</small>}
      {err && <p className="error">{err}</p>}

      {iBlocked ? (
        <div className="blocked-note">
          <span>You blocked this person.</span>
          <button onClick={unblock}>Unblock</button>
        </div>
      ) : (
        <div className="send">
          <input type="file" ref={fileRef} onChange={sendFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? "⏳" : "📎"}
          </button>
          <input
            placeholder="Type a message"
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button onClick={send}>Send</button>
        </div>
      )}
    </div>
  );
}