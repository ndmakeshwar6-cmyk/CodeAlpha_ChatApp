import { useRef, useState } from "react";
import { auth, db } from "./firebase";
import { doc, runTransaction } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function ProfileSetup({ user, profile, onSaved, onCancel }) {
  const [name, setName] = useState(profile?.name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || "");
  const [showEmail, setShowEmail] = useState(profile?.showEmail || false);
  const [interests, setInterests] = useState(profile?.interests || []);
  const [interestText, setInterestText] = useState("");
  const [songTitle, setSongTitle] = useState(profile?.songTitle || "");
  const [songLink, setSongLink] = useState(profile?.songLink || "");
  const [birthday, setBirthday] = useState(profile?.birthday || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

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
      if (!data.secure_url) throw new Error(data.error?.message || "Upload failed");
      setPhotoURL(data.secure_url);
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    e.target.value = "";
  };

  const addInterest = () => {
    const t = interestText.trim();
    if (t && !interests.includes(t) && interests.length < 15) {
      setInterests([...interests, t]);
    }
    setInterestText("");
  };

  const save = async () => {
    const uname = username.trim().toLowerCase();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!USERNAME_RE.test(uname)) {
      setError("Username: 3-20 letters, numbers, _ or .");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = {
        name: name.trim(),
        nameLower: name.trim().toLowerCase(),
        username: uname,
        usernameLower: uname,
        photoURL,
        showEmail,
        email: showEmail ? user.email : "",
        interests,
        songTitle: songTitle.trim(),
        songLink: songLink.trim(),
        birthday,
        profileDone: true,
      };
      await runTransaction(db, async (tx) => {
        const newRef = doc(db, "usernames", uname);
        const newSnap = await tx.get(newRef);
        if (newSnap.exists() && newSnap.data().uid !== user.uid) {
          throw new Error("That username is taken");
        }
        const oldName = profile?.usernameLower;
        let oldRef = null;
        let oldSnap = null;
        if (oldName && oldName !== uname) {
          oldRef = doc(db, "usernames", oldName);
          oldSnap = await tx.get(oldRef);
        }
        tx.set(newRef, { uid: user.uid });
        if (oldSnap && oldSnap.exists() && oldSnap.data().uid === user.uid) {
          tx.delete(oldRef);
        }
        tx.set(doc(db, "users", user.uid), data, { merge: true });
      });
      await updateProfile(auth.currentUser, {
        displayName: data.name,
        photoURL: photoURL || null,
      });
      onSaved(data);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="profile">
      <h2>{profile?.profileDone ? "Edit profile" : "Set up your profile"}</h2>

      <div className="pfp-pick">
        <Avatar src={photoURL} name={name} size={90} />
        <input type="file" accept="image/*" ref={fileRef} onChange={pickPhoto} style={{ display: "none" }} />
        <button onClick={() => fileRef.current.click()} disabled={uploading}>
          {uploading ? "Uploading..." : "Choose photo"}
        </button>
      </div>

      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={30} />

      <label>Username</label>
      <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
        placeholder="like shilpa_123" maxLength={20} />

      <label className="check">
        <input type="checkbox" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} />
        Show my email to other people
      </label>

      <label>Interests</label>
      <div className="chips">
        {interests.map((i) => (
          <span className="chip" key={i}>
            {i}
            <b onClick={() => setInterests(interests.filter((x) => x !== i))}>×</b>
          </span>
        ))}
      </div>
      <div className="row-inline">
        <input value={interestText} placeholder="Add an interest" maxLength={25}
          onChange={(e) => setInterestText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addInterest()} />
        <button onClick={addInterest}>Add</button>
      </div>

      <label>Song for your profile</label>
      <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title and artist" maxLength={60} />
      <input value={songLink} onChange={(e) => setSongLink(e.target.value)} placeholder="Link (Spotify or YouTube) - optional" />

      <label>Birthday</label>
      <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />

      <p className="error">{error}</p>
      <button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
      {onCancel && <button className="secondary" onClick={onCancel}>Cancel</button>}
    </div>
  );
}