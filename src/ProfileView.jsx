
import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const REASONS = [
  "Spam",
  "Harassment",
  "Fake account",
  "Inappropriate content",
  "Something else",
];

function embedFor(link) {
  try {
    const u = new URL(link);
    const host = u.hostname.replace("www.", "");

    if (host === "youtu.be") {
      return {
        url: `https://www.youtube.com/embed/${u.pathname.slice(1)}`,
        height: 190,
      };
    }

    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");

      if (v) {
        return {
          url: `https://www.youtube.com/embed/${v}`,
          height: 190,
        };
      }

      const m = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);

      if (m) {
        return {
          url: `https://www.youtube.com/embed/${m[2]}`,
          height: 190,
        };
      }
    }

    if (host === "open.spotify.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) =>
        ["track", "album", "playlist", "episode"].includes(p)
      );

      if (i >= 0 && parts[i + 1]) {
        return {
          url: `https://open.spotify.com/embed/${parts[i]}/${parts[i + 1]}`,
          height: 152,
        };
      }
    }
  } catch {
    // Invalid or unsupported link
  }

  return null;
}

function formatBirthday(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ProfileView({
  uid,
  myUid,
  nick,
  onSaveNick,
  onClose,
}) {
  const [p, setP] = useState(null);
  const [editing, setEditing] = useState(false);
  const [nickText, setNickText] = useState(nick || "");
  const [blocked, setBlocked] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStep, setReportStep] = useState(0);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  const isMe = uid === myUid;

  // Load profile
  useEffect(() => {
    setP(null);

    getDoc(doc(db, "users", uid))
      .then((snapshot) => {
        setP(snapshot.exists() ? snapshot.data() : null);
      })
      .catch(() => {
        setMsg("Couldn't load this profile.");
      });
  }, [uid]);

  // Listen for blocked status
  useEffect(() => {
    if (isMe) return;

    return onSnapshot(
      doc(db, "users", myUid, "blocked", uid),
      (snapshot) => setBlocked(snapshot.exists()),
      () => setBlocked(false)
    );
  }, [uid, myUid, isMe]);

  // Keep nickname synchronized
  useEffect(() => {
    setNickText(nick || "");
  }, [nick, uid]);

  const shown = nick || p?.name || "";
  const embed = p?.songLink ? embedFor(p.songLink) : null;

  const moodOn =
    p?.mood?.expiresAt?.toMillis &&
    p.mood.expiresAt.toMillis() > Date.now();

  // Rename contact
  const saveNick = async () => {
    const value = nickText.trim();

    if (!value) {
      setMsg("Please enter a name.");
      return;
    }

    try {
      await onSaveNick(uid, value);
      setEditing(false);
      setMsg("");
    } catch {
      setMsg("Couldn't save the name. Please try again.");
    }
  };

  // Block
  const block = async () => {
    try {
      await setDoc(
        doc(db, "users", myUid, "blocked", uid),
        { at: Date.now() }
      );

      setConfirmBlock(false);
      setMsg("");
    } catch {
      setMsg("Couldn't block this person. Please try again.");
    }
  };

  // Unblock
  const unblock = async () => {
    try {
      await deleteDoc(doc(db, "users", myUid, "blocked", uid));
      setMsg("");
    } catch {
      setMsg("Couldn't unblock this person. Please try again.");
    }
  };

  // Report
  const sendReport = async () => {
    try {
      await addDoc(collection(db, "reports"), {
        reporter: myUid,
        reported: uid,
        reason,
        details: details.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });

      setSent(true);
      setReportOpen(false);
      setReportStep(0);
      setDetails("");
      setMsg("");
    } catch {
      setMsg("Couldn't send the report. Please try again.");
    }
  };

  if (!p) {
    return (
      <div className="profile-id-overlay" onClick={onClose}>
        <div
          className="profile-id-card loading"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="profile-id-close"
            onClick={onClose}
          >
            ×
          </button>
          <p>{msg || "Loading Tether ID..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-id-overlay" onClick={onClose}>
      <div
        className="profile-id-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          className="profile-id-close"
          onClick={onClose}
          aria-label="Close profile"
        >
          ×
        </button>

        {/* ID header */}
        <div className="profile-id-top">
          <div className="profile-id-brand">
            <span>♡</span>

            <div>
              <h2>Tether ID</h2>
              <small>YOUR LITTLE CONNECTION CARD</small>
            </div>
          </div>

          <span className="profile-id-number">
            NO. {uid.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Main profile details */}
        <div className="profile-id-main">
          <div className="profile-id-photo">
            <Avatar
              src={p.photoURL}
              name={shown}
              size={142}
            />

            <span className="profile-id-photo-decoration">
              ♡
            </span>
          </div>

          <div className="profile-id-details">
            <span className="profile-id-label">NAME</span>

            <h1>{shown}</h1>

            {p.username && (
              <p className="profile-id-username">
                @{p.username}
              </p>
            )}

            {nick && p.name && (
              <p className="profile-id-realname">
                Their name: {p.name}
              </p>
            )}

            {moodOn && (
              <div className="profile-id-mood">
                {p.mood.text}
              </div>
            )}

            {p.birthday && (
              <div className="profile-id-field">
                <span>DATE OF BIRTH</span>
                <b>{formatBirthday(p.birthday)}</b>
              </div>
            )}

            {p.showEmail && p.email && (
              <div className="profile-id-field">
                <span>EMAIL</span>
                <b className="profile-id-email">
                  {p.email}
                </b>
              </div>
            )}
          </div>
        </div>

        {/* Interests */}
        {p.interests?.length > 0 && (
          <div className="profile-id-section">
            <div className="profile-id-section-icon">
              ♡
            </div>

            <div>
              <span className="profile-id-label">
                INTERESTS
              </span>

              <div className="profile-id-interests">
                {p.interests.map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Favourite song */}
        {p.songTitle && (
          <div className="profile-id-section">
            <div className="profile-id-section-icon">
              ♫
            </div>

            <div className="profile-id-song">
              <span className="profile-id-label">
                FAVOURITE SONG
              </span>

              <b>{p.songTitle}</b>

              {embed ? (
                <iframe
                  src={embed.url}
                  height={embed.height}
                  allow="autoplay; encrypted-media"
                  title="Profile song"
                />
              ) : (
                p.songLink && (
                  <a
                    href={p.songLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Listen to song ↗
                  </a>
                )
              )}
            </div>
          </div>
        )}

        {/* Safety and privacy */}
        {!isMe && (
          <div className="profile-id-actions">
            <div className="profile-id-section-heading">
              <b>Safety & privacy</b>
              <small>
                Manage your interaction with this person
              </small>
            </div>

            {/* Rename */}
            {editing ? (
              <div className="profile-id-rename">
                <input
                  value={nickText}
                  maxLength={30}
                  placeholder="Name for this person"
                  onChange={(e) => setNickText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && saveNick()
                  }
                />

                <button onClick={saveNick}>Save</button>

                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(false);
                    setNickText(nick || "");
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="profile-id-rename-button"
                onClick={() => {
                  setNickText(nick || "");
                  setEditing(true);
                  setMsg("");
                }}
              >
                <><svg className="profile-id-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg> Rename in your contacts</>
              </button>
            )}

            {/* Block and report */}
            <div className="profile-id-danger-row">
              {blocked ? (
                <button
                  className="secondary"
                  onClick={unblock}
                >
                  <><svg className="profile-id-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> Unblock</>
                </button>
              ) : (
                <button
                  className="secondary"
                  onClick={() => setConfirmBlock(true)}
                >
                  <><svg className="profile-id-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg> Block</>
                </button>
              )}

              {!sent && (
                <button
                  className="secondary"
                  onClick={() => {
                    setReportOpen(true);
                    setReportStep(0);
                    setMsg("");
                  }}
                >
                  <><svg className="profile-id-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4" /><path d="M5 4c5-3 9 3 14 0v11c-5 3-9-3-14 0" /></svg> Report</>
                </button>
              )}
            </div>

            {/* Block confirmation */}
            {confirmBlock && (
              <div className="profile-id-confirm">
                <p>
                  Block {shown}? They won't be able to message
                  you or send you requests.
                </p>

                <div>
                  <button onClick={block}>
                    Yes, block
                  </button>

                  <button
                    className="secondary"
                    onClick={() => setConfirmBlock(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Report form */}
            {reportOpen && (
              <div className="profile-id-confirm">
                {reportStep === 0 ? (
                  <>
                    <label>
                      Why are you reporting this person?
                    </label>

                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    >
                      {REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>

                    <textarea
                      rows={3}
                      maxLength={500}
                      placeholder="Tell us more (optional)"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                    />

                    <div>
                      <button
                        onClick={() => setReportStep(1)}
                      >
                        Review report
                      </button>

                      <button
                        className="secondary"
                        onClick={() => setReportOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      Send a report about {shown} for "{reason}"?
                    </p>

                    <div>
                      <button onClick={sendReport}>
                        Yes, send report
                      </button>

                      <button
                        className="secondary"
                        onClick={() => setReportStep(0)}
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {sent && (
              <small className="profile-id-success">
                ✓ Report sent. Thank you for helping keep Tether safe.
              </small>
            )}

            {msg && (
              <small className="error">{msg}</small>
            )}
          </div>
        )}



        <style>{`
          .profile-id-action-icon {
            width: 16px;
            height: 16px;
            display: inline-block;
            vertical-align: -3px;
            margin-right: 5px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
        `}</style>

        {/* Decorative ID footer */}
        <div className="profile-id-footer">
          <span>♡ TETHER • CONNECTED BY YOU</span>
          <span>MADE WITH LOVE</span>
        </div>
      </div>
    </div>
  );
}
