
import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";

export default function GroupInfo({
  user,
  profile,
  gid,
  nicks,
  onClose,
  onLeft,
  onProfile,
}) {
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

  useEffect(() => {
    return onSnapshot(
      gref,
      (s) => (s.exists() ? setG({ id: s.id, ...s.data() }) : setGone(true)),
      () => setGone(true)
    );
  }, [gid]);

  useEffect(() => {
    const q = query(
      collection(db, "contactLinks"),
      where("members", "array-contains", user.uid)
    );

    return onSnapshot(q, (snap) =>
      setContacts(
        snap.docs.map((d) =>
          d.data().members.find((m) => m !== user.uid)
        )
      )
    );
  }, [user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, "groupInvites"),
      where("from", "==", user.uid)
    );

    return onSnapshot(q, (snap) =>
      setSentInvites(snap.docs.map((d) => d.data()))
    );
  }, [user.uid]);

  useEffect(() => {
    const ids = [...(g?.members || []), ...contacts];

    ids.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id)).then((s) => {
          if (s.exists()) {
            setPeople((p) => ({ ...p, [id]: s.data() }));
          }
        });
      }
    });
  }, [g, contacts]);

  if (gone) {
    return (
      <div className="overlay group-info-overlay" onClick={onClose}>
        <div
          className="group-info-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="close" onClick={onClose}>✕</button>
          <p>You're no longer in this group.</p>
        </div>
      </div>
    );
  }

  if (!g) {
    return (
      <div className="overlay group-info-overlay" onClick={onClose}>
        <div
          className="group-info-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <p>Loading group...</p>
        </div>
      </div>
    );
  }

  const isAdmin = g.admins.includes(user.uid);

  const nameOf = (uid) =>
    uid === user.uid
      ? "You"
      : nicks[uid] || people[uid]?.name || "...";

  const pending = new Set(
    sentInvites
      .filter((i) => i.gid === gid && i.status === "pending")
      .map((i) => i.to)
  );

  const addable = contacts.filter(
    (uid) => !g.members.includes(uid)
  );

  const members = [...g.members].sort(
    (a, b) =>
      Number(g.admins.includes(b)) -
      Number(g.admins.includes(a))
  );

  const startEdit = () => {
    setName(g.name);
    setDesc(g.description || "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!name.trim()) return;

    try {
      await updateDoc(gref, {
        name: name.trim(),
        description: desc.trim(),
      });
      setEditing(false);
      setMsg("Group details updated.");
    } catch {
      setMsg("Couldn't update the group. Try again.");
    }
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

      if (!data.secure_url) {
        throw new Error("Photo upload failed");
      }

      await updateDoc(gref, { photoURL: data.secure_url });
      setMsg("Group photo updated.");
    } catch {
      setMsg("Photo upload failed. Try again.");
    }

    setUploading(false);
    e.target.value = "";
  };

  const promote = async (uid) => {
    try {
      await updateDoc(gref, { admins: arrayUnion(uid) });
      setMsg("Admin permissions updated.");
    } catch {
      setMsg("Couldn't promote this member.");
    }
  };

  const removeMember = async (uid) => {
    try {
      await updateDoc(gref, {
        members: g.members.filter((m) => m !== uid),
        admins: g.admins.filter((a) => a !== uid),
      });

      setConfirm(null);
    } catch {
      setMsg("Couldn't remove this member.");
    }
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

      setMsg("Invitation sent.");
    } catch {
      setMsg(
        "Couldn't invite this person. Their privacy settings may not allow it."
      );
    }
  };

  const leave = async () => {
    const remaining = g.members.filter(
      (m) => m !== user.uid
    );

    let admins = g.admins.filter(
      (a) => a !== user.uid
    );

    if (remaining.length > 0 && admins.length === 0) {
      admins = [remaining[0]];
    }

    try {
      await updateDoc(gref, {
        members: remaining,
        admins,
      });

      onLeft();
    } catch {
      setMsg("Couldn't leave the group. Try again.");
    }
  };

  return (
    <div className="overlay group-info-overlay" onClick={onClose}>
      <div
        className="group-info-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="group-info-close" onClick={onClose}>
          ✕
        </button>

        <div className="group-info-content">

          {/* GROUP HEADER */}
          <section className="group-info-hero">
            <div className="group-info-avatar">
              <Avatar
                src={g.photoURL}
                name={g.name}
                size={100}
              />
            </div>

            {isAdmin && (
              <>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileRef}
                  onChange={changePhoto}
                  style={{ display: "none" }}
                />

                <button
                  className="secondary group-info-photo-btn"
                  onClick={() => fileRef.current.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Change group photo"}
                </button>
              </>
            )}

            {editing ? (
              <div className="group-info-edit">
                <label>Group name</label>
                <input
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />

                <label>Description</label>
                <input
                  value={desc}
                  maxLength={120}
                  placeholder="Add a group description"
                  onChange={(e) => setDesc(e.target.value)}
                />

                <div className="group-info-actions">
                  <button onClick={saveEdit}>Save changes</button>
                  <button
                    className="secondary"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group-info-identity">
                <h2>{g.name}</h2>

                {g.description && (
                  <p>{g.description}</p>
                )}

                <small>
                  👥 {g.members.length}{" "}
                  {g.members.length === 1 ? "member" : "members"}
                </small>

                {isAdmin && (
                  <button
                    className="secondary group-info-edit-btn"
                    onClick={startEdit}
                  >
                    ✏️ Edit group
                  </button>
                )}
              </div>
            )}
          </section>

          {/* MEMBERS */}
          <section className="group-info-section">
            <div className="group-info-section-heading">
              <div>
                <h3>Members</h3>
                <small>People in this group</small>
              </div>
              <span className="group-info-count">
                {members.length}
              </span>
            </div>

            <div className="group-info-list">
              {members.map((uid) => (
                <div className="group-info-person" key={uid}>
                  <span
                    className="group-info-person-avatar"
                    onClick={() =>
                      uid !== user.uid && onProfile(uid)
                    }
                  >
                    <Avatar
                      src={people[uid]?.photoURL}
                      name={nameOf(uid)}
                      size={44}
                    />
                  </span>

                  <div className="group-info-person-details">
                    <b>{nameOf(uid)}</b>
                    <small>
                      @{people[uid]?.username || " "}
                    </small>
                  </div>

                  {g.admins.includes(uid) && (
                    <span className="group-info-admin">
                      ⭐ Admin
                    </span>
                  )}

                  {isAdmin && uid !== user.uid && (
                    <div className="group-info-person-actions">
                      {!g.admins.includes(uid) && (
                        <button
                          className="secondary mini-btn"
                          title="Make admin"
                          onClick={() => promote(uid)}
                        >
                          ⭐
                        </button>
                      )}

                      <button
                        className="secondary mini-btn"
                        title="Remove member"
                        onClick={() =>
                          setConfirm({ type: "remove", uid })
                        }
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* REMOVE CONFIRMATION */}
          {confirm?.type === "remove" && (
            <div className="group-info-confirm">
              <p>
                Remove <b>{nameOf(confirm.uid)}</b> from this group?
              </p>

              <div className="group-info-actions">
                <button onClick={() => removeMember(confirm.uid)}>
                  Yes, remove
                </button>
                <button
                  className="secondary"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ADD PEOPLE */}
          {isAdmin && (
            <section className="group-info-section">
              <div className="group-info-section-heading">
                <div>
                  <h3>Add people</h3>
                  <small>Invite your contacts to join</small>
                </div>
              </div>

              <div className="group-info-list">
                {addable.map((uid) => (
                  <div className="group-info-person" key={uid}>
                    <Avatar
                      src={people[uid]?.photoURL}
                      name={people[uid]?.name || "?"}
                      size={44}
                    />

                    <div className="group-info-person-details">
                      <b>
                        {nicks[uid] || people[uid]?.name || "..."}
                      </b>
                      <small>
                        @{people[uid]?.username || " "}
                      </small>
                    </div>

                    {pending.has(uid) ? (
                      <span className="group-info-invited">
                        Invited
                      </span>
                    ) : (
                      <button
                        className="group-info-invite-btn"
                        onClick={() => invite(uid)}
                      >
                        + Invite
                      </button>
                    )}
                  </div>
                ))}

                {addable.length === 0 && (
                  <p className="group-info-empty">
                    All your contacts are already in this group.
                  </p>
                )}
              </div>
            </section>
          )}

          {msg && (
            <p className="group-info-message">{msg}</p>
          )}

          {/* LEAVE GROUP */}
          <section className="group-info-leave">
            {confirm?.type === "leave" ? (
              <div className="group-info-confirm">
                <p>
                  Leave this group? You won't see new messages.
                </p>

                <div className="group-info-actions">
                  <button onClick={leave}>Yes, leave</button>
                  <button
                    className="secondary"
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="group-info-leave-btn"
                onClick={() => setConfirm({ type: "leave" })}
              >
                🚪 Leave group
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
