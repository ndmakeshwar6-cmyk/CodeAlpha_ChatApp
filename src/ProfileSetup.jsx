
import { useRef, useState } from "react";
import { auth, db } from "./firebase";
import { doc, runTransaction } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import Avatar from "./Avatar";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function ProfileSetup({
  user,
  profile,
  onSaved,
  onCancel,
}) {
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
        {
          method: "POST",
          body: form,
        }
      );

      const data = await res.json();

      if (!data.secure_url) {
        throw new Error(data.error?.message || "Photo upload failed");
      }

      setPhotoURL(data.secure_url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const addInterest = () => {
    const value = interestText.trim();

    if (!value) return;

    if (interests.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setInterestText("");
      return;
    }

    if (interests.length >= 15) {
      setError("You can add up to 15 interests.");
      return;
    }

    setInterests((prev) => [...prev, value]);
    setInterestText("");
    setError("");
  };

  const removeInterest = (value) => {
    setInterests((prev) => prev.filter((i) => i !== value));
  };

  const save = async () => {
    const uname = username.trim().toLowerCase();

    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!USERNAME_RE.test(uname)) {
      setError("Username must contain 3–20 letters, numbers, underscores or dots.");
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
          throw new Error("That username is already taken.");
        }

        const oldName = profile?.usernameLower;
        let oldRef = null;
        let oldSnap = null;

        if (oldName && oldName !== uname) {
          oldRef = doc(db, "usernames", oldName);
          oldSnap = await tx.get(oldRef);
        }

        tx.set(newRef, { uid: user.uid });

        if (
          oldSnap &&
          oldSnap.exists() &&
          oldSnap.data().uid === user.uid
        ) {
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile profile-editor">

      <div className="profile-editor-heading">
        <h2>
          {profile?.profileDone ? "Edit profile" : "Set up your profile"}
        </h2>
        <p>Make your little corner of Tether yours.</p>
      </div>

      {/* Profile photo */}
      <section className="profile-photo-section">
        <div className="profile-photo-preview">
          <Avatar src={photoURL} name={name} size={112} />
        </div>

        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          onChange={pickPhoto}
          style={{ display: "none" }}
        />

        <button
          type="button"
          className="profile-photo-button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading photo..." : "📷 Choose photo"}
        </button>

        <small>Choose a photo that represents you.</small>
      </section>

      {/* Personal information */}
      <section className="profile-section">
        <div className="profile-section-heading">
          <span>01</span>
          <div>
            <h3>Personal information</h3>
            <p>The basics about you.</p>
          </div>
        </div>

        <div className="profile-field">
          <label htmlFor="profile-name">Display name</label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={30}
          />
        </div>

        <div className="profile-field">
          <label htmlFor="profile-username">Username</label>
          <input
            id="profile-username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="like shilpa_123"
            maxLength={20}
          />
          <small>3–20 characters. Letters, numbers, _ and . only.</small>
        </div>

        <label className="profile-email-option">
          <input
            type="checkbox"
            checked={showEmail}
            onChange={(e) => setShowEmail(e.target.checked)}
          />
          <span>
            <b>Show my email address</b>
            <small>Allow other people to see your email.</small>
          </span>
        </label>
      </section>

      {/* Interests */}
      <section className="profile-section">
        <div className="profile-section-heading">
          <span>02</span>
          <div>
            <h3>Your interests</h3>
            <p>Things you enjoy, love or are curious about.</p>
          </div>
        </div>

        <div className="profile-interest-chips">
          {interests.map((interest) => (
            <span className="profile-interest-chip" key={interest}>
              {interest}
              <button
                type="button"
                aria-label={`Remove ${interest}`}
                onClick={() => removeInterest(interest)}
              >
                ×
              </button>
            </span>
          ))}

          {interests.length === 0 && (
            <small className="profile-empty-interests">
              Your interests will appear here.
            </small>
          )}
        </div>

        <div className="profile-interest-input">
          <input
            value={interestText}
            placeholder="Add an interest..."
            maxLength={25}
            onChange={(e) => setInterestText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addInterest();
              }
            }}
          />

          <button type="button" onClick={addInterest}>
            + Add
          </button>
        </div>

        <small className="profile-helper">
          You can add up to 15 interests.
        </small>
      </section>

      {/* Profile details */}
      <section className="profile-section">
        <div className="profile-section-heading">
          <span>03</span>
          <div>
            <h3>Profile details</h3>
            <p>A few more things to make your profile yours.</p>
          </div>
        </div>

        <div className="profile-field">
          <label htmlFor="profile-song">Song for your profile</label>
          <input
            id="profile-song"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="Song title and artist"
            maxLength={60}
          />
          <input
            value={songLink}
            onChange={(e) => setSongLink(e.target.value)}
            placeholder="Spotify or YouTube link (optional)"
          />
        </div>

        <div className="profile-field">
          <label htmlFor="profile-birthday">Birthday</label>
          <input
            id="profile-birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
      </section>

      {/* Actions */}
      {error && (
        <div className="profile-error">
          {error}
        </div>
      )}

      <div className="profile-form-actions">
        {onCancel && (
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>

    </div>
  );
}
