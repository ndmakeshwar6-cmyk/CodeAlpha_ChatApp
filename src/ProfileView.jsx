import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot, addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const REASONS = ["Spam", "Harassment", "Fake account", "Inappropriate content", "Something else"];

function embedFor(link) {
  try {
    const u = new URL(link);
    const host = u.hostname.replace("www.", "");
    if (host === "youtu.be") {
      return { url: `https://www.youtube.com/embed/${u.pathname.slice(1)}`, height: 190 };
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return { url: `https://www.youtube.com/embed/${v}`, height: 190 };
      const m = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
      if (m) return { url: `https://www.youtube.com/embed/${m[2]}`, height: 190 };
    }
    if (host === "open.spotify.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => ["track", "album", "playlist", "episode"].includes(p));
      if (i >= 0 && parts[i + 1]) {
        return { url: `https://open.spotify.com/embed/${parts[i]}/${parts[i + 1]}`, height: 152 };
      }
    }
  } catch {
    /* not a link */
  }
  return null;
}

export default function ProfileView({ uid, myUid, nick, onSaveNick, onClose }) {
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

  useEffect(() => {
    getDoc(doc(db, "users", uid)).then((s) => setP(s.exists() ? s.data() : null));
  }, [uid]);

  useEffect(() => {
    if (isMe) return;
    return onSnapshot(doc(db, "users", myUid, "blocked", uid), (s) => setBlocked(s.exists()));
  }, [uid]);

  const shown = nick || p?.name || "";
  const embed = p?.songLink ? embedFor(p.songLink) : null;
  const moodOn = p?.mood?.expiresAt?.toMillis && p.mood.expiresAt.toMillis() > Date.now();

  const saveNick = async () => {
    await onSaveNick(uid, nickText.trim());
    setEditing(false);
  };

  const block = async () => {
    await setDoc(doc(db, "users", myUid, "blocked", uid), { at: Date.now() });
    setConfirmBlock(false);
  };

  const unblock = () => deleteDoc(doc(db, "users", myUid, "blocked", uid));

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
    } catch {
      setMsg("Couldn't send the report. Please try again.");
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        {!p ? (
          <p>Loading...</p>
        ) : (
          <>
            <Avatar src={p.photoURL} name={shown} size={110} />
            <h2 style={{ margin: 0 }}>{shown}</h2>
            {p.username && <small>@{p.username}</small>}
            {nick && <small>Their name: {p.name}</small>}
            {moodOn && <small>{p.mood.emoji} {p.mood.text}</small>}

            {!isMe && (
              editing ? (
                <div className="row-inline" style={{ width: "100%" }}>
                  <input value={nickText} maxLength={30} placeholder="Name for this person"
                    onChange={(e) => setNickText(e.target.value)} />
                  <button onClick={saveNick}>Save</button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)}>✏️ Rename</button>
              )
            )}

            {p.email && <p>✉️ {p.email}</p>}

            {p.interests?.length > 0 && (
              <div className="chips" style={{ justifyContent: "center" }}>
                {p.interests.map((i) => (
                  <span className="chip" key={i}>{i}</span>
                ))}
              </div>
            )}

            {p.songTitle && (
              <div className="song">
                <b>🎵 {p.songTitle}</b>
                {embed ? (
                  <iframe src={embed.url} height={embed.height} allow="autoplay; encrypted-media" title="song" />
                ) : (
                  p.songLink && <a href={p.songLink} target="_blank" rel="noreferrer">Open song link</a>
                )}
              </div>
            )}

            {!isMe && (
              <>
                <div className="danger-row">
                  {blocked ? (
                    <button className="secondary" onClick={unblock}>✅ Unblock</button>
                  ) : confirmBlock ? (
                    <div className="confirm-box">
                      <small>Block {shown}? They won't be able to message you or send you requests.</small>
                      <div className="row-inline">
                        <button onClick={block}>Yes, block</button>
                        <button className="secondary" onClick={() => setConfirmBlock(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="secondary" onClick={() => setConfirmBlock(true)}>🚫 Block</button>
                  )}
                  {!reportOpen && !sent && (
                    <button className="secondary" onClick={() => setReportOpen(true)}>🚩 Report</button>
                  )}
                </div>
                {sent && <small>Report sent. Thank you for helping keep Tether safe.</small>}
                {msg && <small className="error">{msg}</small>}

                {reportOpen && reportStep === 0 && (
                  <div className="confirm-box">
                    <select value={reason} onChange={(e) => setReason(e.target.value)}>
                      {REASONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <textarea rows={3} maxLength={500} placeholder="Tell us more (optional)"
                      value={details} onChange={(e) => setDetails(e.target.value)} />
                    <div className="row-inline">
                      <button onClick={() => setReportStep(1)}>Review</button>
                      <button className="secondary" onClick={() => setReportOpen(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                {reportOpen && reportStep === 1 && (
                  <div className="confirm-box">
                    <small>Send a report about {shown} for “{reason}”?</small>
                    <div className="row-inline">
                      <button onClick={sendReport}>Yes, send</button>
                      <button className="secondary" onClick={() => setReportStep(0)}>Back</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}