
import { useState } from "react";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import Avatar from "./Avatar";
import ProfileSetup from "./ProfileSetup";
import Appearance from "./Appearance";
import PrivacySettings from "./PrivacySettings";

// Minimal monochrome outline icons
function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const icons = {
    cloud: (
      <path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.6 1.8A4.5 4.5 0 0 0 7 18h11a4 4 0 0 0 2-1.8Z" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.4-3h1.4A4.5 4.5 0 0 0 22 10.2C22 6.2 17.5 3 12 3Z" />
        <circle cx="7.5" cy="10" r=".8" />
        <circle cx="10" cy="6.8" r=".8" />
        <circle cx="15" cy="7" r=".8" />
        <circle cx="17.5" cy="10.5" r=".8" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    music: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
    cake: (
      <>
        <path d="M5 11h14v10H5z" />
        <path d="M5 15h14" />
        <path d="M9 11V7" />
        <path d="M15 11V7" />
        <path d="M9 7c-1-1-1-2 0-3" />
        <path d="M15 7c-1-1-1-2 0-3" />
        <path d="M5 21h14" />
      </>
    ),
    edit: (
      <>
        <path d="m15 5 4 4" />
        <path d="M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15v5Z" />
      </>
    ),
    heart: (
      <path d="M20.8 8.8c0 4.2-8.8 10-8.8 10S3.2 13 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" />
    ),
    external: (
      <>
        <path d="M14 4h6v6" />
        <path d="M20 4 11 13" />
        <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      </>
    ),
  };

  return <svg {...common}>{icons[name]}</svg>;
}

const moodOn = (m) =>
  !!m?.expiresAt?.toMillis &&
  m.expiresAt.toMillis() > Date.now();

export default function Settings({ user, profile, prefs }) {
  const [page, setPage] = useState("menu");

  const header = (title, onBack) => (
    <div className="set-head">
      <button
        className="back"
        onClick={onBack}
        aria-label="Go back"
      >
        <Icon name="chevronLeft" />
      </button>
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

        <div className="my-profile-page">
          <div className="my-profile-card">

            {/* Profile introduction */}
            <div className="my-profile-top">
              <div className="my-profile-avatar">
                <Avatar
                  src={profile.photoURL}
                  name={profile.name}
                  size={112}
                />
              </div>

              <h2>{profile.name}</h2>

              <span className="my-profile-username">
                @{profile.username}
              </span>

              {moodOn(profile.mood) && (
                <span className="my-profile-mood">
                  {profile.mood.emoji} {profile.mood.text}
                </span>
              )}
            </div>

            {/* Interests */}
            {profile.interests?.length > 0 && (
              <div className="my-profile-section">
                <h4>
                  <Icon name="heart" size={16} />
                  {" "}Interests
                </h4>

                <div className="my-profile-chips">
                  {profile.interests.map((interest) => (
                    <span
                      className="my-profile-chip"
                      key={interest}
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Profile song */}
            {profile.songTitle && (
              <div className="my-profile-section my-profile-info">
                <span className="my-profile-icon">
                  <Icon name="music" />
                </span>

                <div>
                  <small>Profile song</small>
                  <p>{profile.songTitle}</p>

                  {profile.songLink && (
                    <a
                      href={profile.songLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Listen to song
                      {" "}
                      <Icon name="external" size={13} />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Birthday */}
            {profile.birthday && (
              <div className="my-profile-section my-profile-info">
                <span className="my-profile-icon">
                  <Icon name="cake" />
                </span>

                <div>
                  <small>Birthday</small>
                  <p>{profile.birthday}</p>
                </div>
              </div>
            )}

            {/* Empty profile message */}
            {!profile.interests?.length &&
              !profile.songTitle &&
              !profile.birthday && (
                <div className="my-profile-empty">
                  Your profile is waiting for a little personality.
                  Add interests, a song or your birthday!
                </div>
              )}
          </div>

          {/* Profile actions */}
          <div className="my-profile-actions">
            <button
              className="my-profile-edit"
              onClick={() => setPage("edit")}
            >
              <Icon name="edit" size={17} />
              {" "}Edit profile
            </button>

            <button
              className="my-profile-privacy"
              onClick={() => setPage("privacy")}
            >
              <Icon name="shield" size={17} />
              {" "}Privacy & Security
            </button>
          </div>
        </div>
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
            <span className="settings-cloud-icon">
              <Icon name="cloud" size={34} />
            </span>
            <h2>Settings</h2>
            <small>Your little space</small>
          </div>

          <button
            className="menu-item"
            onClick={() => setPage("profile")}
          >
            <span className="menu-icon">
              <Icon name="user" />
            </span>
            <b>My Profile</b>
            <span className="menu-arrow">
              <Icon name="chevronRight" size={18} />
            </span>
          </button>

          <button
            className="menu-item"
            onClick={() => setPage("appearance")}
          >
            <span className="menu-icon">
              <Icon name="palette" />
            </span>
            <b>Appearance</b>
            <span className="menu-arrow">
              <Icon name="chevronRight" size={18} />
            </span>
          </button>

          <button
            className="menu-item"
            onClick={() => setPage("privacy")}
          >
            <span className="menu-icon">
              <Icon name="shield" />
            </span>
            <b>Privacy & Security</b>
            <span className="menu-arrow">
              <Icon name="chevronRight" size={18} />
            </span>
          </button>

          <button
            className="menu-item logout-item"
            onClick={() => signOut(auth)}
          >
            <span className="menu-icon">
              <Icon name="logout" />
            </span>
            <b>Log out</b>
            <span className="menu-arrow">
              <Icon name="chevronRight" size={18} />
            </span>
          </button>

        </div>
      </div>
    </div>
  );
}
