import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";

export default function NewGroup({ user, profile, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [contacts, setContacts] = useState([]);
  const [people, setPeople] = useState({});
  const [picked, setPicked] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "contactLinks"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) =>
      setContacts(snap.docs.map((d) => d.data().members.find((m) => m !== user.uid)))
    );
  }, [user.uid]);

  useEffect(() => {
    contacts.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id)).then((s) => {
          if (s.exists()) setPeople((p) => ({ ...p, [id]: s.data() }));
        });
      }
    });
  }, [contacts]);

  const pickPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!data.secure_url) throw new Error("Upload failed");
      setPhotoURL(data.secure_url);
    } catch {
      setError("Photo upload failed. Try again.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const toggle = (uid) =>
    setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));

  const create = async () => {
    if (!name.trim()) {
      setError("Give your group a name");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ref = doc(collection(db, "groups"));
      await setDoc(ref, {
        name: name.trim(),
        description: desc.trim(),
        photoURL,
        createdBy: user.uid,
        members: [user.uid],
        admins: [user.uid],
        createdAt: serverTimestamp(),
        lastMessage: "Group created",
        lastSender: "",
        lastAt: serverTimestamp(),
        unread: {},
      });
      let failed = 0;
      for (const uid of picked) {
        try {
          await setDoc(doc(db, "groupInvites", ref.id + "_" + uid), {
            gid: ref.id,
            to: uid,
            from: user.uid,
            fromName: profile.name,
            status: "pending",
            groupName: name.trim(),
            groupPhoto: photoURL,
            createdAt: serverTimestamp(),
          });
        } catch {
          failed++;
        }
      }
      if (failed > 0) setResult({ gid: ref.id, failed });
      else onCreated(ref.id);
    } catch {
      setError("Couldn't create the group. Please try again.");
    }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        <h3 style={{ margin: 0 }}>New group</h3>

        {result ? (
          <>
            <p>
              Group created. {result.failed} {result.failed === 1 ? "person" : "people"} couldn't
              be invited because of their privacy settings.
            </p>
            <button onClick={() => onCreated(result.gid)}>Open group</button>
          </>
        ) : (
          <>
            <Avatar src={photoURL} name={name || "G"} size={80} />
            <input type="file" accept="image/*" ref={fileRef} onChange={pickPhoto} style={{ display: "none" }} />
            <button className="secondary" onClick={() => fileRef.current.click()} disabled={uploading}>
              {uploading ? "Uploading..." : "Group photo"}
            </button>
            <input style={{ width: "100%", boxSizing: "border-box" }} placeholder="Group name"
              value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <input style={{ width: "100%", boxSizing: "border-box" }} placeholder="Description (optional)"
              value={desc} maxLength={120} onChange={(e) => setDesc(e.target.value)} />

            <small>Invite people. They join only if they accept.</small>
            <div className="scroll">
              {contacts.map((uid) => {
                const p = people[uid];
                return (
                  <label key={uid} className="pick">
                    <input type="checkbox" checked={picked.includes(uid)} onChange={() => toggle(uid)} />
                    <Avatar src={p?.photoURL} name={p?.name || "?"} size={34} />
                    <span>{p?.name || "..."} <small>@{p?.username}</small></span>
                  </label>
                );
              })}
              {contacts.length === 0 && <small>You have no contacts yet. You can invite people later.</small>}
            </div>

            {error && <small className="error">{error}</small>}
            <button onClick={create} disabled={busy}>{busy ? "Creating..." : "Create group"}</button>
          </>
        )}
      </div>
    </div>
  );
}