

import { useRef, useState } from "react";

import { auth, db } from "./firebase";

import { doc, runTransaction } from "firebase/firestore";

import { updateProfile } from "firebase/auth";

import Avatar from "./Avatar";



const CLOUD_NAME = "n7saeady";

const UPLOAD_PRESET = "chatapp_upload";

const USERNAME_RE = /^[a-z0-9\_.]{3,20}$/;



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
  const cropFrameRef = useRef(null);
  const [cropSource, setCropSource] = useState("");
  const [cropImageSize, setCropImageSize] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const getCropSize = () => cropFrameRef.current?.clientWidth || 280;

  const closeCropper = () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource("");
    setCropImageSize(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    dragRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      e.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setCropSource(objectUrl);
    setCropImageSize(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setError("");
  };

  const handleCropImageLoad = (e) => {
    setCropImageSize({
      width: e.currentTarget.naturalWidth,
      height: e.currentTarget.naturalHeight,
    });
  };

  const getCropImageLayout = () => {
    if (!cropImageSize) return null;
    const cropSize = getCropSize();
    const scale = Math.max(
      cropSize / cropImageSize.width,
      cropSize / cropImageSize.height
    ) * cropZoom;
    const width = cropImageSize.width * scale;
    const height = cropImageSize.height * scale;
    return {
      scale,
      width,
      height,
      left: (cropSize - width) / 2 + cropOffset.x,
      top: (cropSize - height) / 2 + cropOffset.y,
    };
  };

  const handleCropPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y,
    };
  };

  const handleCropPointerMove = (e) => {
    const cropSize = getCropSize();
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const layout = getCropImageLayout();
    if (!layout) return;
    const maxX = Math.max(0, (layout.width - cropSize) / 2);
    const maxY = Math.max(0, (layout.height - cropSize) / 2);
    setCropOffset({
      x: Math.max(-maxX, Math.min(maxX, dragRef.current.originX + e.clientX - dragRef.current.startX)),
      y: Math.max(-maxY, Math.min(maxY, dragRef.current.originY + e.clientY - dragRef.current.startY)),
    });
  };

  const handleCropPointerUp = (e) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const uploadCroppedPhoto = async () => {
    if (!cropImageSize || !cropSource) return;
    const cropSize = getCropSize();
    setUploading(true);
    setError("");

    try {
      const image = new Image();
      image.src = cropSource;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not read this image."));
      });

      const layout = getCropImageLayout();
      const sourceX = Math.max(0, (0 - layout.left) / layout.scale);
      const sourceY = Math.max(0, (0 - layout.top) / layout.scale);
      const sourceSize = cropSize / layout.scale;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the cropped image.");

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        512,
        512
      );

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Could not create the cropped image.");

      const form = new FormData();
      form.append("file", blob, "tether-profile.jpg");
      form.append("upload_preset", UPLOAD_PRESET);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok || !data.secure_url) {
        throw new Error(data.error?.message || "Photo upload failed");
      }

      setPhotoURL(data.secure_url);
      closeCropper();
    } catch (err) {
      setError(err.message || "Photo upload failed.");
    } finally {
      setUploading(false);
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

          {uploading ? (

            "Uploading photo..."

          ) : (

            <>

              <svg

                className="profile-photo-button-icon"

                viewBox="0 0 24 24"

                width="17"

                height="17"

                fill="none"

                stroke="currentColor"

                strokeWidth="1.8"

                strokeLinecap="round"

                strokeLinejoin="round"

                aria-hidden="true"

              >

                <path d="M4 7.5h3l1.5-2h7l1.5 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" />

                <circle cx="12" cy="13.5" r="3.5" />

              </svg>

              Choose photo

            </>

          )}

        </button>



        <small>Choose a photo that represents you.</small>
      </section>

      {cropSource && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-crop-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(25, 22, 24, 0.58)",
          }}
        >
          <div
            style={{
              width: "min(100%, 390px)",
              maxHeight: "92dvh",
              overflowY: "auto",
              padding: 22,
              borderRadius: 22,
              background: "var(--surface, #fffdfb)",
              color: "var(--text, #393239)",
              boxShadow: "0 18px 55px rgba(0,0,0,.22)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <h3 id="profile-crop-title" style={{ margin: 0 }}>Adjust your photo</h3>
                <p style={{ margin: "5px 0 0", color: "var(--muted, #91858b)", fontSize: 13 }}>
                  Move and zoom to choose what appears in your profile.
                </p>
              </div>
              <button type="button" onClick={closeCropper} disabled={uploading} aria-label="Close crop editor"
                style={{ border: 0, background: "transparent", fontSize: 24, cursor: "pointer", color: "inherit" }}>×</button>
            </div>

            <div style={{ display: "grid", placeItems: "center", margin: "20px 0 16px" }}>
              <div
                ref={cropFrameRef}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
                style={{
                  position: "relative",
                  width: "min(280px, 76vw)",
                  height: "min(280px, 76vw)",
                  overflow: "hidden",
                  borderRadius: 14,
                  background: "#eee9e6",
                  touchAction: "none",
                  cursor: "grab",
                  userSelect: "none",
                }}
              >
                {cropImageSize && (() => {
                  const layout = getCropImageLayout();
                  return (
                    <img
                      src={cropSource}
                      alt="Crop preview"
                      draggable="false"
                      style={{
                        position: "absolute",
                        width: layout.width,
                        height: layout.height,
                        maxWidth: "none",
                        left: layout.left,
                        top: layout.top,
                        pointerEvents: "none",
                        userSelect: "none",
                      }}
                    />
                  );
                })()}
                {!cropImageSize && (
                  <img
                    src={cropSource}
                    alt=""
                    onLoad={handleCropImageLoad}
                    style={{ display: "none" }}
                  />
                )}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  border: "1px solid rgba(255,255,255,.95)",
                  boxShadow: "0 0 0 999px rgba(0,0,0,.12)",
                  pointerEvents: "none",
                }} />
              </div>
              <small style={{ marginTop: 10, color: "var(--muted, #91858b)" }}>
                Drag the image to reposition it
              </small>
            </div>

            <label style={{ display: "block", fontSize: 13, marginBottom: 7 }} htmlFor="profile-crop-zoom">
              Zoom
            </label>
            <input
              id="profile-crop-zoom"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={cropZoom}
              onChange={(e) => {
                setCropZoom(Number(e.target.value));
                setCropOffset({ x: 0, y: 0 });
              }}
              style={{ width: "100%", accentColor: "var(--accent, #e9a5b9)" }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button type="button" onClick={closeCropper} disabled={uploading}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border, #eee4e8)", background: "transparent", color: "inherit" }}>
                Cancel
              </button>
              <button type="button" onClick={uploadCroppedPhoto} disabled={uploading || !cropImageSize}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: 0, borderRadius: 12, background: "var(--accent, #e9a5b9)", color: "#33272c", opacity: uploading ? .65 : 1 }}>
                {uploading ? "Uploading..." : "Use photo"}
              </button>
            </div>
          </div>
        </div>
      )}



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
