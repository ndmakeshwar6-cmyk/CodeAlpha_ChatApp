
import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";

export default function NewGroup({
  user,
  profile,
  onClose,
  onCreated,
}) {
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

  // Listen to the user's contacts
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "contactLinks"),
      where("members", "array-contains", user.uid)
    );

    return onSnapshot(
      q,
      (snap) => {
        const ids = snap.docs
          .map((d) =>
            d.data().members.find((m) => m !== user.uid)
          )
          .filter(Boolean);

        setContacts(ids);
      },
      (err) => {
        console.error("Contact listener error:", err);
        setError("Couldn't load your contacts.");
      }
    );
  }, [user?.uid]);

  // Fetch contact profiles
  useEffect(() => {
    let cancelled = false;

    const loadPeople = async () => {
      const missing = contacts.filter((id) => !people[id]);

      if (!missing.length) return;

      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "users", id));

            if (snap.exists()) {
              return [id, snap.data()];
            }
          } catch (err) {
            console.error("Contact profile error:", err);
          }

          return null;
        })
      );

      if (cancelled) return;

      setPeople((previous) => {
        const updated = { ...previous };

        results.forEach((entry) => {
          if (entry) {
            updated[entry[0]] = entry[1];
          }
        });

        return updated;
      });
    };

    loadPeople();

    return () => {
      cancelled = true;
    };
  }, [contacts, people]);

  // Upload group photo
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Please choose an image smaller than 10 MB.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    setError("");

    try {
      const form = new FormData();

      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: form,
        }
      );

      const data = await res.json();

      if (!res.ok || !data.secure_url) {
        throw new Error(data.error?.message || "Upload failed");
      }

      setPhotoURL(data.secure_url);
    } catch (err) {
      console.error("Group photo upload error:", err);
      setError("Photo upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Select or deselect a contact
  const toggle = (uid) => {
    setPicked((previous) =>
      previous.includes(uid)
        ? previous.filter((id) => id !== uid)
        : [...previous, uid]
    );
  };

  // Create group and send invitations
  const create = async () => {
    if (!name.trim()) {
      setError("Please enter a group name.");
      return;
    }

    if (uploading || busy) return;

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
          await setDoc(
            doc(db, "groupInvites", `${ref.id}_${uid}`),
            {
              gid: ref.id,
              to: uid,
              from: user.uid,
              fromName: profile?.name || "Someone",
              status: "pending",
              groupName: name.trim(),
              groupPhoto: photoURL,
              createdAt: serverTimestamp(),
            }
          );
        } catch (err) {
          console.error(`Invitation failed for ${uid}:`, err);
          failed++;
        }
      }

      if (failed > 0) {
        setResult({
          gid: ref.id,
          failed,
        });
      } else {
        onCreated(ref.id);
      }
    } catch (err) {
      console.error("Group creation error:", err);
      setError("Couldn't create the group. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay new-group-overlay" onClick={onClose}>
      <div
        className="sheet new-group-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="new-group-header">
          <div>
            <h3>{result ? "Group created" : "Create a group"}</h3>
            {!result && (
              <p>Bring your people together.</p>
            )}
          </div>

          <button
            className="new-group-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {result ? (
          <div className="new-group-result">
            <div className="new-group-success-icon">✓</div>

            <h3>Your group is ready!</h3>

            <p>
              {result.failed}{" "}
              {result.failed === 1 ? "person couldn't" : "people couldn't"}{" "}
              be invited because of their privacy settings.
            </p>

            <button
              className="new-group-submit"
              onClick={() => onCreated(result.gid)}
            >
              Open group
            </button>
          </div>
        ) : (
          <>
            {/* Group photo */}
            <div className="new-group-photo-section">
              <div className="new-group-photo-preview">
                <Avatar
                  src={photoURL}
                  name={name || "G"}
                  size={76}
                />
              </div>

              <div className="new-group-photo-info">
                <b>Group picture</b>
                <small>
                  Choose a picture your members will recognize.
                </small>

                <button
                  type="button"
                  className="new-group-photo-button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Choose photo"}
                </button>
              </div>
            </div>

            <input
              type="file"
              accept="image/*"
              ref={fileRef}
              onChange={pickPhoto}
              style={{ display: "none" }}
            />

            {/* Group information */}
            <div className="new-group-fields">
              <label className="new-group-label">
                Group name
              </label>

              <input
                className="new-group-input"
                placeholder="Give your group a name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="new-group-label">
                Description <span>(optional)</span>
              </label>

              <textarea
                className="new-group-input new-group-textarea"
                placeholder="What is this group about?"
                value={desc}
                maxLength={120}
                rows={2}
                onChange={(e) => setDesc(e.target.value)}
              />

              <small className="new-group-character-count">
                {desc.length}/120
              </small>
            </div>

            {/* Contact selection */}
            <div className="new-group-members-section">
              <div className="new-group-members-heading">
                <div>
                  <h4>Add members</h4>
                  <small>
                    Invite people. They join only if they accept.
                  </small>
                </div>

                <span className="new-group-selected-count">
                  {picked.length} selected
                </span>
              </div>

              <div className="new-group-contact-list">
                {contacts.map((uid) => {
                  const p = people[uid];
                  const selected = picked.includes(uid);

                  return (
                    <label
                      key={uid}
                      className={`new-group-contact ${
                        selected ? "selected" : ""
                      }`}
                    >
                      <Avatar
                        src={p?.photoURL}
                        name={p?.name || "?"}
                        size={44}
                      />

                      <div className="new-group-contact-info">
                        <b>{p?.name || "Loading..."}</b>
                        <small>
                          {p?.username
                            ? `@${p.username}`
                            : " "}
                        </small>
                      </div>

                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(uid)}
                        aria-label={`Select ${p?.name || "contact"}`}
                      />

                      <span className="new-group-checkmark">
                        {selected ? "✓" : ""}
                      </span>
                    </label>
                  );
                })}

                {contacts.length === 0 && (
                  <div className="new-group-empty">
                    <span>👥</span>
                    <p>No contacts yet</p>
                    <small>
                      Add contacts first, then invite them here.
                    </small>
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="new-group-error">
                {error}
              </div>
            )}

            {/* Create button */}
            <button
              className="new-group-submit"
              onClick={create}
              disabled={busy || uploading || !name.trim()}
            >
              {busy
                ? "Creating group..."
                : uploading
                ? "Uploading photo..."
                : `Create group${picked.length ? ` · ${picked.length} invited` : ""}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
