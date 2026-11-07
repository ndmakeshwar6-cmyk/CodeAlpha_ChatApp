import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, onSnapshot, updateDoc, setDoc, deleteDoc, collection, query, where,
  arrayUnion, serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";

export default function GroupInfo({ user, profile, gid, nicks, onClose, onLeft, onProfile }) {
  const [g, setG] = useState(null);
  const [gone, setGone] = useState(false);
  const [people, setPeople] = useState({});
  const [contacts, setContacts] = useState([]);
  const [sentInvites, setSentInvites] = useState([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const gref = doc(db, "groups", gid);

  useEffect(
    () =>
      onSnapshot(
        gref,
        (s) => (s.exists() ? setG({ id: s.id, ...s.data() }) : setGone(true)),
        () => setGone(true)
      ),
    [gid]
  );

  useEffect(() => {
    const q = query(collection(db, "contactLinks"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) =>
      setContacts(snap.docs.map((d) => d.data().members.find((m) => m !== user.uid)))
    );
  }, [user.uid]);

  useEffect(() => {
    const q = query(collection(db, "groupInvites"), where("from", "==", user.uid));
    return onSnapshot(q, (snap) => setSentInvites(snap.docs.map((d) => d.data())));
  }, [user.uid]);

  useEffect(() => {
    const ids = [...(g?.members || []), ...contacts];
    ids.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id)).then((s) => {
          if (s.exists()) setPeople((p) => ({ ...p, [id]: s.data() }));
        });
      }
    });
  }, [g, contacts]);

  if (gone) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <button className="close" onClick={onClose}>✕</button>
          <p>You're no longer in this group.</p>
        </div>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="sheet"><p>Loading...</p></div>
      </div>
    );
  }

  const isAdmin = g.admins.includes(user.uid);
  const nameOf = (uid) => (uid === user.uid ? "You" : nicks[uid] || people[uid]?.name || "...");
  const pending = new Set(
    sentInvites.filter((i) => i.gid === gid && i.status === "pending").map((i) => i.to)
  );
  const addable = contacts.filter((uid) => !g.members.includes(uid));
  const members = [...g.members].sort(
    (a, b) => Number(g.admins.includes(b)) - Number(g.admins.includes(a))
  );

  const startEdit = () => {
    setName(g.name);
    setDesc(g.description || "");
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!name.trim()) return;
    await updateDoc(gref, { name: name.trim(), description: desc.trim() });
    setEditing(false);
  };
  const changePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!data.secure_url) throw new Error("x");
      await updateDoc(gref, { photoURL: data.secure_url });
    } catch {
      setMsg("Photo upload failed. Try again.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const promote = (uid) => updateDoc(gref, { admins: arrayUnion(uid) });

  const removeMember = async (uid) => {
    await updateDoc(gref, {
      members: g.members.filter((m) => m !== uid),
      admins: g.admins.filter((a) => a !== uid),
    });
    setConfirm(null);
  };

  const invite = async (uid) => {
    setMsg("");
    const iref = doc(db, "groupInvites", gid + "_" + uid);
    try {
      await deleteDoc(iref).catch(() => {});
      await setDoc(iref, {
        gid,
        to: uid,
        from: user.uid,
        fromName: profile.name,
        status: "pending",
        groupName: g.name,
        groupPhoto: g.photoURL || "",
        createdAt: serverTimestamp(),
      });
      setMsg("Invitation sent");
    } catch {
      setMsg("Couldn't invite this person. Their privacy settings may not allow it.");
    }
  };

  const leave = async () => {
    const remaining = g.members.filter((m) => m !== user.uid);
    let admins = g.admins.filter((a) => a !== user.uid);
    if (remaining.length > 0 && admins.length === 0) admins = [remaining[0]];
    try {
      await updateDoc(gref, { members: remaining, admins });
      onLeft();
    } catch {
      setMsg("Couldn't leave the group. Try again.");
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>

        <Avatar src={g.photoURL} name={g.name} size={90} />
        {isAdmin && (
          <>
            <input type="file" accept="image/*" ref={fileRef} onChange={changePhoto} style={{ display: "none" }} />
            <button className="secondary mini-btn" onClick={() => fileRef.current.click()} disabled={uploading}>
              {uploading ? "Uploading..." : "Change photo"}
            </button>
          </>
        )}

        {editing ? (
          <>
            <input style={{ width: "100%", boxSizing: "border-box" }} value={name} maxLength={40}
              onChange={(e) => setName(e.target.value)} />
            <input style={{ width: "100%", boxSizing: "border-box" }} value={desc} maxLength={120}
              placeholder="Description" onChange={(e) => setDesc(e.target.value)} />
            <div className="row-inline">
              <button onClick={saveEdit}>Save</button>
              <button className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>{g.name}</h2>
            {g.description && <small>{g.description}</small>}
            <small>{g.members.length} {g.members.length === 1 ? "member" : "members"}</small>
            {isAdmin && <button className="secondary mini-btn" onClick={startEdit}>✏️ Edit group</button>}
          </>
        )}

        <h4 className="sec" style={{ alignSelf: "flex-start" }}>Members</h4>
        <div className="scroll">
          {members.map((uid) => (
            <div className="member" key={uid}>
              <span onClick={() => uid !== user.uid && onProfile(uid)} style={{ cursor: "pointer" }}>
                <Avatar src={people[uid]?.photoURL} name={nameOf(uid)} size={36} />
              </span>
              <div className="item-text">
                <b>{nameOf(uid)}</b>
                <small>@{people[uid]?.username}</small>
              </div>
              {g.admins.includes(uid) && <span className="admin-tag">Admin</span>}
              {isAdmin && uid !== user.uid && (
                <>
                  {!g.admins.includes(uid) && (
                    <button className="secondary mini-btn" onClick={() => promote(uid)}>⭐</button>
                  )}
                  <button className="secondary mini-btn" onClick={() => setConfirm({ type: "remove", uid })}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>

        {confirm?.type === "remove" && (
          <div className="confirm-box">
            <small>Remove {nameOf(confirm.uid)} from the group?</small>
            <div className="row-inline">
              <button onClick={() => removeMember(confirm.uid)}>Yes, remove</button>
              <button className="secondary" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        )}

        {isAdmin && (
          <>
            <h4 className="sec" style={{ alignSelf: "flex-start" }}>Add people</h4>
            <div className="scroll">
              {addable.map((uid) => (
                <div className="member" key={uid}>
                  <Avatar src={people[uid]?.photoURL} name={people[uid]?.name || "?"} size={36} />
                  <div className="item-text">
                    <b>{nicks[uid] || people[uid]?.name || "..."}</b>
                    <small>@{people[uid]?.username}</small>
                  </div>
                  {pending.has(uid) ? (
                    <span className="tag">Invited</span>
                  ) : (
                    <button className="mini-btn" onClick={() => invite(uid)}>Invite</button>
                  )}
                </div>
              ))}
              {addable.length === 0 && <small>All your contacts are already here.</small>}
            </div>
          </>
        )}

        {msg && <small>{msg}</small>}

        {confirm?.type === "leave" ? (
          <div className="confirm-box">
            <small>Leave this group? You won't see new messages.</small>
            <div className="row-inline">
              <button onClick={leave}>Yes, leave</button>
              <button className="secondary" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="secondary" onClick={() => setConfirm({ type: "leave" })}>🚪 Leave group</button>
        )}
      </div>
    </div>
  );
}