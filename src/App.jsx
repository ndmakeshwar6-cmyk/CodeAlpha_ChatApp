import { useEffect, useState } from "react";
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
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

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
        <h2>Chat room</h2>
        <button onClick={() => signOut(auth)}>Log out</button>
      </div>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={m.sender === user.email ? "msg mine" : "msg"}>
            <small>{m.sender}</small>
            <div>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="send">
        <input placeholder="Type a message" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}