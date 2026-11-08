
import { useState } from "react";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import Avatar from "./Avatar";
import ProfileSetup from "./ProfileSetup";
import Appearance from "./Appearance";
import PrivacySettings from "./PrivacySettings";

const moodOn = (m) =>
  !!m?.expiresAt?.toMillis &&
  m.expiresAt.toMillis() > Date.now();

export default function Settings({ user, profile, prefs }) {
  const [page, setPage] = useState("menu");

  const header = (title, onBack) => (
    <div className="set-head">
      <button className="back" onClick={onBack}>←</button>
      <h3 style={{ margin: 0 }}>{title}</h3>
    </div>
  );

  const toMenu = () => setPage("menu");

  if (page === "edit") {
    return (
      <div className="settings">
        {header("Edit profile", () => setPage("profile"))}
        <ProfileSetup
          user={user}
          profile={profile}
          onSaved={() => setPage("profile")}
          onCancel={() => setPage("profile")}
        />
      </div>
    );
  }

  if (page === "profile") {
    return (
      <div className="settings">
        {header("My profile", toMenu)}

        <div className="me-card">
          <Avatar
            src={profile.photoURL}
            name={profile.name}
            size={96}
          />

          <h2 style={{ margin: 0 }}>{profile.name}</h2>
          <small>@{profile.username}</small>

          {moodOn(profile.mood) && (
            <small>
              {profile.mood.emoji} {profile.mood.text}
            </small>
          )}

          {profile.interests?.length > 0 && (
            <div
              className="chips"
              style={{ justifyContent: "center" }}
            >
              {profile.interests.map((i) => (
                <span className="chip" key={i}>{i}</span>
              ))}
            </div>
          )}

          {profile.songTitle && (
            <small>🎵 {profile.songTitle}</small>
          )}

          {profile.birthday && (
            <small>🎂 {profile.birthday}</small>
          )}
        </div>

        <button onClick={() => setPage("edit")}>
          ✏️ Edit profile
        </button>

        <button
          className="secondary"
          onClick={() => setPage("privacy")}
        >
          🔒 Privacy
        </button>
      </div>
    );
  }

  if (page === "appearance") {
    return (
      <div className="settings">
        {header("Appearance", toMenu)}
        <Appearance user={user} prefs={prefs} />
      </div>
    );
  }

  if (page === "privacy") {
    return (
      <div className="settings">
        {header("Privacy & Security", toMenu)}
        <PrivacySettings user={user} profile={profile} />
      </div>
    );
  }

  return (
    <div className="settings settings-menu-stage">
      <div className="settings-cloud">
        <div className="settings-cloud-content">

          <div className="settings-cloud-heading">
            <span>☁️</span>
            <h2>Settings</h2>
            <small>Your little space</small>
          </div>

          <button
            className="menu-item"
            onClick={() => setPage("profile")}
          >
            <span className="menu-icon">👤</span>
            <b>My Profile</b>
            <span className="menu-arrow">›</span>
          </button>

          <button
            className="menu-item"
            onClick={() => setPage("appearance")}
          >
            <span className="menu-icon">🎨</span>
            <b>Appearance</b>
            <span className="menu-arrow">›</span>
          </button>

          <button
            className="menu-item"
            onClick={() => setPage("privacy")}
          >
            <span className="menu-icon">🔒</span>
            <b>Privacy & Security</b>
            <span className="menu-arrow">›</span>
          </button>

          <button
            className="menu-item logout-item"
            onClick={() => signOut(auth)}
          >
            <span className="menu-icon">🚪</span>
            <b>Log out</b>
            <span className="menu-arrow">›</span>
          </button>

        </div>
      </div>
    </div>
  );
}
