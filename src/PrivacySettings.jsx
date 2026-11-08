
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import Avatar from "./Avatar";

const MODES = [
  ["everyone", "Everyone", "🌍"],
  ["contacts", "My contacts", "👥"],
  ["nobody", "Nobody", "🔒"],
];

export default function PrivacySettings({ user, profile }) {
  const [blocked, setBlocked] = useState([]);
  const [people, setPeople] = useState({});

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [pwMsg, setPwMsg] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const mode = profile.groupInvites || "contacts";

  // Listen for blocked users
  useEffect(() => {
    return onSnapshot(
      collection(db, "users", user.uid, "blocked"),
      (snap) => {
        setBlocked(snap.docs.map((d) => d.id));
      }
    );
  }, [user.uid]);

  // Fetch blocked user profiles
  useEffect(() => {
    let active = true;

    const loadPeople = async () => {
      const missing = blocked.filter((id) => !people[id]);

      if (!missing.length) return;

      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const s = await getDoc(doc(db, "users", id));
            return s.exists() ? [id, s.data()] : [id, null];
          } catch {
            return [id, null];
          }
        })
      );

      if (active) {
        setPeople((prev) => {
          const next = { ...prev };
          results.forEach(([id, data]) => {
            next[id] = data;
          });
          return next;
        });
      }
    };

    loadPeople();

    return () => {
      active = false;
    };
  }, [blocked, people]);

  // Group invitation preferences
  const setMode = async (value) => {
    setMsg("");

    try {
      await updateDoc(doc(db, "users", user.uid), {
        groupInvites: value,
      });

      setMsg("Your invitation preferences have been saved.");
    } catch (error) {
      console.error(error);
      setMsg("Couldn't save your preferences. Please try again.");
    }
  };

  // Unblock user
  const unblock = async (id) => {
    try {
      await deleteDoc(doc(db, "users", user.uid, "blocked", id));
    } catch (error) {
      console.error(error);
      setMsg("Couldn't unblock this person. Please try again.");
    }
  };

  // Change password
  const changePw = async () => {
    setPwMsg("");

    if (!oldPw) {
      setPwMsg("Please enter your current password.");
      return;
    }

    if (newPw.length < 8) {
      setPwMsg("Your new password needs at least 8 characters.");
      return;
    }

    if (newPw !== confirmPw) {
      setPwMsg("Your new passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const cred = EmailAuthProvider.credential(user.email, oldPw);

      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPw);

      setOldPw("");
      setNewPw("");
      setConfirmPw("");

      setPwMsg("Your password has been changed successfully.");
    } catch (error) {
      const code = error.code || "";

      setPwMsg(
        code.includes("invalid-credential") ||
        code.includes("wrong-password")
          ? "Your current password is incorrect."
          : "Couldn't change your password. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  // Send password reset email
  const sendReset = async () => {
    setPwMsg("");
    setBusy(true);

    try {
      await sendPasswordResetEmail(auth, user.email);
      setPwMsg("Reset link sent! Please check your email and spam folder.");
    } catch (error) {
      console.error(error);
      setPwMsg("Couldn't send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-block privacy-page">

      {/* PAGE INTRO */}
      <div className="privacy-intro">
        <h2>Your privacy matters</h2>
        <p>Manage who can contact you and keep your account secure.</p>
      </div>

      {/* GROUP INVITATIONS */}
      <section className="privacy-card">

        <div className="privacy-card-heading">
          <span className="privacy-icon">👥</span>
          <div>
            <h3>Group invitations</h3>
            <p>Choose who can add you to groups.</p>
          </div>
        </div>

        <div className="privacy-modes">
          {MODES.map(([id, label, emoji]) => (
            <button
              type="button"
              key={id}
              className={mode === id ? "privacy-mode active" : "privacy-mode"}
              onClick={() => setMode(id)}
            >
              <span>{emoji}</span>
              {label}
              {mode === id && <span className="privacy-check">✓</span>}
            </button>
          ))}
        </div>

        <p className="privacy-note">
          Even when someone is allowed to invite you, you always choose whether to join.
        </p>

        {msg && (
          <div className="privacy-feedback">
            {msg}
          </div>
        )}
      </section>

      {/* BLOCKED PEOPLE */}
      <section className="privacy-card">

        <div className="privacy-card-heading">
          <span className="privacy-icon">🚫</span>
          <div>
            <h3>Blocked people</h3>
            <p>Manage people you have blocked.</p>
          </div>
        </div>

        {blocked.length > 0 ? (
          <div className="privacy-blocked-list">
            {blocked.map((id) => {
              const person = people[id];

              return (
                <div className="privacy-blocked-person" key={id}>
                  <Avatar
                    src={person?.photoURL}
                    name={person?.name || "?"}
                    size={46}
                  />

                  <div className="privacy-person-info">
                    <b>{person?.name || "Loading profile..."}</b>
                    <small>
                      {person?.username ? `@${person.username}` : "Blocked account"}
                    </small>
                  </div>

                  <button
                    type="button"
                    className="privacy-unblock"
                    onClick={() => unblock(id)}
                  >
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="privacy-empty">
            <span>🌷</span>
            <b>No blocked people</b>
            <p>You haven't blocked anyone. Everyone is welcome here!</p>
          </div>
        )}
      </section>

      {/* PASSWORD */}
      <section className="privacy-card">

        <div className="privacy-card-heading">
          <span className="privacy-icon">🔐</span>
          <div>
            <h3>Password & security</h3>
            <p>Keep your account safe with a strong password.</p>
          </div>
        </div>

        <div className="privacy-password-fields">

          <div className="privacy-field">
            <label htmlFor="old-password">Current password</label>
            <input
              id="old-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter current password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
            />
          </div>

          <div className="privacy-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>

          <div className="privacy-field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter your new password again"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>

        </div>

        {pwMsg && (
          <div className="privacy-feedback">
            {pwMsg}
          </div>
        )}

        <div className="privacy-password-actions">
          <button
            type="button"
            onClick={changePw}
            disabled={busy}
          >
            {busy ? "Please wait..." : "Change password"}
          </button>

          <button
            type="button"
            className="privacy-reset-button"
            onClick={sendReset}
            disabled={busy}
          >
            Email me a reset link
          </button>
        </div>

      </section>

      <p className="privacy-footer">
        💗 Your account, your boundaries, your choice.
      </p>

    </div>
  );
}
