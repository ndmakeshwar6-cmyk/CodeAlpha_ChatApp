import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc, updateDoc, deleteDoc, collection, onSnapshot } from "firebase/firestore";
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail,
} from "firebase/auth";
import Avatar from "./Avatar";

const MODES = [
  ["everyone", "Everyone"],
  ["contacts", "My contacts"],
  ["nobody", "Nobody"],
];

export default function PrivacySettings({ user, profile }) {
  const [blocked, setBlocked] = useState([]);
  const [people, setPeople] = useState({});
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [msg, setMsg] = useState("");
  const mode = profile.groupInvites || "contacts";

  useEffect(
    () =>
      onSnapshot(collection(db, "users", user.uid, "blocked"), (snap) =>
        setBlocked(snap.docs.map((d) => d.id))
      ),
    [user.uid]
  );

  useEffect(() => {
    blocked.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id)).then((s) => {
          if (s.exists()) setPeople((p) => ({ ...p, [id]: s.data() }));
        });
      }
    });
  }, [blocked]);

  const setMode = async (m) => {
    setMsg("");
    try {
      await updateDoc(doc(db, "users", user.uid), { groupInvites: m });
      setMsg("Saved ✅");
    } catch {
      setMsg("Couldn't save. Please try again.");
    }
  };

  const unblock = (id) => deleteDoc(doc(db, "users", user.uid, "blocked", id));

  const changePw = async () => {
    setPwMsg("");
    if (!oldPw) return setPwMsg("Enter your current password");
    if (newPw.length < 8) return setPwMsg("New password needs at least 8 characters");
    if (newPw !== confirmPw) return setPwMsg("New passwords do not match");
    try {
      const cred = EmailAuthProvider.credential(user.email, oldPw);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPw);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg("Password changed ✅");
    } catch (e) {
      const c = e.code || "";
      setPwMsg(
        c.includes("invalid-credential") || c.includes("wrong-password")
          ? "Your current password is wrong"
          : "Couldn't change the password. Please try again."
      );
    }
  };

  const sendReset = async () => {
    setPwMsg("");
    try {
      await sendPasswordResetEmail(auth, user.email);
      setPwMsg("A reset link was sent to your email. Check spam too.");
    } catch {
      setPwMsg("Couldn't send the email. Please try again.");
    }
  };

  return (
    <div className="settings-block">
      <h4 className="sec">Who can invite me to groups</h4>
      <div className="opt-row">
        {MODES.map(([id, label]) => (
          <button key={id} className={mode === id ? "opt on" : "opt"} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <small className="hint">Even when allowed, you always choose whether to join.</small>
      {msg && <small>{msg}</small>}

      <h4 className="sec">Blocked people</h4>
      {blocked.map((id) => (
        <div className="item" key={id} style={{ cursor: "default" }}>
          <Avatar src={people[id]?.photoURL} name={people[id]?.name || "?"} size={40} />
          <div className="item-text grow">
            <b>{people[id]?.name || "..."}</b>
            <small>@{people[id]?.username}</small>
          </div>
          <button className="mini-btn" onClick={() => unblock(id)}>Unblock</button>
        </div>
      ))}
      {blocked.length === 0 && <small className="hint">You haven't blocked anyone.</small>}

      <h4 className="sec">Password</h4>
      <input type="password" placeholder="Current password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      <input type="password" placeholder="New password (8+ characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
      <button onClick={changePw}>Change password</button>
      <button className="link" onClick={sendReset}>Email me a reset link instead</button>
      {pwMsg && <small>{pwMsg}</small>}
    </div>
  );
}