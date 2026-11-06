import { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import Whiteboard from "./Whiteboard";
import "./App.css";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("chat");
  const fileRef = useRef(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "messages"), orderBy("createdAt"));
    return onSnapshot(q, (snap) =>
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [user]);

  const signUp = async () => {
    try { await createUserWithEmailAndPassword(auth, email, password); setError(""); }
    catch (e) { setError(e.message); }
  };
  const logIn = async () => {
    try { await signInWithEmailAndPassword(auth, email, password); setError(""); }
    catch (e) { setError(e.message); }
  };
  const send = async () => {
    if (!text.trim()) return;
    await addDoc(collection(db, "messages"), {
      text, sender: user.email, createdAt: serverTimestamp(),
    });
    setText("");
  };

  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
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
      await addDoc(collection(db, "messages"), {
        text: "", fileUrl: data.secure_url, fileName: file.name,
        fileType: file.type, sender: user.email, createdAt: serverTimestamp(),
      });
    } catch (err) {
      alert(err.message);
    }
    setUploading(false);
    e.target.value = "";
  };

  if (!user) {
    return (
      <div className="card">
        <h2>Cute Chat</h2>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password (6+ characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={logIn}>Log in</button>
        <button onClick={signUp}>Sign up</button>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="top">
        <h2>Cute Chat</h2>
        <button onClick={() => signOut(auth)}>Log out</button>
      </div>
      <div className="tabs">
        <button className={tab === "chat" ? "tab active" : "tab"} onClick={() => setTab("chat")}>💬 Chat</button>
        <button className={tab === "board" ? "tab active" : "tab"} onClick={() => setTab("board")}>🎨 Whiteboard</button>
      </div>

      {tab === "board" ? (
        <Whiteboard />
      ) : (
        <>
          <div className="messages">
            {messages.map((m) => (
              <div key={m.id} className={m.sender === user.email ? "msg mine" : "msg"}>
                <small>{m.sender}</small>
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
              </div>
            ))}
          </div>
          <div className="send">
            <input type="file" ref={fileRef} onChange={sendFile} style={{ display: "none" }} />
            <button onClick={() => fileRef.current.click()} disabled={uploading}>
              {uploading ? "⏳" : "📎"}
            </button>
            <input placeholder="Type a message" value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()} />
            <button onClick={send}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}

