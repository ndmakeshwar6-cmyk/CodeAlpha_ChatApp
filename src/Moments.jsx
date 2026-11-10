import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import Avatar from "./Avatar";
import "./Moments.css";
import "./MomentsCropper.css";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";
const MAX_PHOTOS = 9;
const MAX_VIDEO = 1;
const MAX_CAPTION = 500;

const formatMomentTime = (timestamp) => {
  if (!timestamp?.toDate) return "Just now";
  const date = timestamp.toDate();
  const now = new Date();
  const elapsed = now - date;
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
};

function MomentPhotoCropper({ src, fileName, onCancel, onApply }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropError, setCropError] = useState("");
  const [applying, setApplying] = useState(false);
  const cropSize = () => frameRef.current?.clientWidth || 300;

  const layout = () => {
    if (!imageSize) return null;
    const size = cropSize();
    const scale = Math.max(size / imageSize.width, size / imageSize.height) * zoom;
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    return {
      scale, width, height,
      left: (size - width) / 2 + offset.x,
      top: (size - height) / 2 + offset.y,
    };
  };

  const pointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const pointerMove = (event) => {
    if (!dragRef.current || dragRef.current.id !== event.pointerId) return;
    const currentLayout = layout();
    if (!currentLayout) return;
    const size = cropSize();
    const maxX = Math.max(0, (currentLayout.width - size) / 2);
    const maxY = Math.max(0, (currentLayout.height - size) / 2);
    setOffset({
      x: Math.max(-maxX, Math.min(maxX, dragRef.current.ox + event.clientX - dragRef.current.x)),
      y: Math.max(-maxY, Math.min(maxY, dragRef.current.oy + event.clientY - dragRef.current.y)),
    });
  };

  const apply = async () => {
    if (!imageSize || applying) return;
    setApplying(true);
    setCropError("");
    try {
    const image = new Image();
    image.src = src;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not read this photo."));
    });
    const currentLayout = layout();
    const size = cropSize();
    const sourceX = Math.max(0, (0 - currentLayout.left) / currentLayout.scale);
    const sourceY = Math.max(0, (0 - currentLayout.top) / currentLayout.scale);
    const sourceSize = size / currentLayout.scale;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the cropped photo.");
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 1024, 1024);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("Could not create the cropped photo.");
    onApply(new File([blob], fileName.replace(/\.[^.]+$/, "") + "-cropped.jpg", { type: "image/jpeg" }));
    } catch (error) {
      setCropError(error.message || "Could not crop this photo.");
    } finally {
      setApplying(false);
    }
  };

  const currentLayout = layout();

  return (
    <div className="tm-crop-backdrop" role="dialog" aria-modal="true" aria-labelledby="tm-crop-title">
      <div className="tm-crop-dialog">
        <div className="tm-crop-heading">
          <div><h3 id="tm-crop-title">Crop photo</h3><p>Drag to reposition · Zoom to adjust</p></div>
          <button type="button" onClick={onCancel} aria-label="Cancel crop">×</button>
        </div>
        <div
          ref={frameRef}
          className="tm-crop-frame"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={(event) => { if (dragRef.current?.id === event.pointerId) dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <img
            src={src}
            alt="Adjust crop"
            draggable="false"
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            style={currentLayout ? {
              width: currentLayout.width,
              height: currentLayout.height,
              left: currentLayout.left,
              top: currentLayout.top,
            } : {}}
          />
        </div>
        <label className="tm-crop-zoom">Zoom
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        {cropError && <p className="tm-crop-error">{cropError}</p>}
        <div className="tm-crop-actions">
          <button type="button" onClick={onCancel} disabled={applying}>Cancel</button>
          <button type="button" onClick={apply} disabled={!imageSize || applying}>{applying ? "Applying…" : "Apply crop"}</button>
        </div>
      </div>
    </div>
  );
}

function MomentHeartIcon({ filled = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M20.8 8.7c0 4.1-5.1 7.9-8.1 10.2a1.1 1.1 0 0 1-1.4 0C8.3 16.6 3.2 12.8 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>;
}
function MomentCommentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M20.2 11.4a8.2 8.2 0 0 1-8.5 8.1 9.2 9.2 0 0 1-3.8-.8L3 20l1.3-4.1a7.8 7.8 0 0 1-1.1-4.5 8.2 8.2 0 0 1 8.5-8.1 8.2 8.2 0 0 1 8.5 8.1Z"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function MomentMediaCarousel({ media, onOpen }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);

  const goTo = (nextIndex) => {
    const bounded = Math.max(0, Math.min(media.length - 1, nextIndex));
    setIndex(bounded);
    const track = trackRef.current;
    if (track) {
      const slide = track.children[bounded];
      slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  };

  if (!media?.length) return null;

  return (
    <div className="tm-carousel">
      <div
        className="tm-carousel-track"
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          const width = track.clientWidth || 1;
          const next = Math.round(track.scrollLeft / width);
          setIndex(Math.max(0, Math.min(media.length - 1, next)));
        }}
      >
        {media.map((item, mediaIndex) => (
          <button
            type="button"
            className="tm-carousel-slide"
            key={`${item.url}-${mediaIndex}`}
            onClick={() => onOpen(mediaIndex)}
            aria-label={`Open ${item.type === "video" ? "video" : "photo"} ${mediaIndex + 1} of ${media.length}`}
          >
            {item.type === "video"
              ? <><video src={item.url} muted playsInline preload="metadata" /><span className="tm-video-play">▶</span></>
              : <img src={item.url} alt={`Moment photo ${mediaIndex + 1}`} loading="lazy" />}
          </button>
        ))}
      </div>
      {media.length > 1 && (
        <>
          {index > 0 && <button type="button" className="tm-carousel-arrow prev" onClick={() => goTo(index - 1)} aria-label="Previous photo">‹</button>}
          {index < media.length - 1 && <button type="button" className="tm-carousel-arrow next" onClick={() => goTo(index + 1)} aria-label="Next photo">›</button>}
          <span className="tm-carousel-count">{index + 1}/{media.length}</span>
          <div className="tm-carousel-dots" aria-label={`Media ${index + 1} of ${media.length}`}>
            {media.map((item, dotIndex) => (
              <button
                type="button"
                key={`dot-${dotIndex}`}
                className={dotIndex === index ? "active" : ""}
                onClick={() => goTo(dotIndex)}
                aria-label={`Show media ${dotIndex + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MediaViewer({ media, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const current = media[index];
  if (!current) return null;

  return (
    <div className="tm-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="tm-viewer-close" onClick={onClose} aria-label="Close media viewer">×</button>
      {media.length > 1 && (
        <>
          <button className="tm-viewer-nav prev" onClick={(event) => { event.stopPropagation(); setIndex((v) => (v - 1 + media.length) % media.length); }} aria-label="Previous media">‹</button>
          <button className="tm-viewer-nav next" onClick={(event) => { event.stopPropagation(); setIndex((v) => (v + 1) % media.length); }} aria-label="Next media">›</button>
        </>
      )}
      <div className="tm-viewer-content" onClick={(event) => event.stopPropagation()}>
        {current.type === "video"
          ? <video src={current.url} controls playsInline />
          : <img src={current.url} alt="Moment media" />}
        {media.length > 1 && <small>{index + 1} / {media.length}</small>}
      </div>
    </div>
  );
}

export default function Moments({ user, profile, onProfile }) {
  const [contacts, setContacts] = useState([]);
  const [feed, setFeed] = useState([]);
  const [hidden, setHidden] = useState(new Set());
  const [muted, setMuted] = useState(new Set());
  const [likes, setLikes] = useState({});
  const [likedByMe, setLikedByMe] = useState(new Set());
  const [comments, setComments] = useState({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState("contacts");
  const [selectedAudience, setSelectedAudience] = useState(new Set());
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [cropIndex, setCropIndex] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [expandedComments, setExpandedComments] = useState(new Set());
  const fileRef = useRef(null);
  const selectedPreviews = useMemo(
    () => selectedFiles.map((file) => URL.createObjectURL(file)),
    [selectedFiles]
  );

  useEffect(() => () => {
    selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedPreviews]);

  // Load accepted contacts and their display profiles.
  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(
      query(collection(db, "contactLinks"), where("members", "array-contains", user.uid)),
      async (snapshot) => {
        const ids = snapshot.docs
          .map((item) => item.data().members.find((uid) => uid !== user.uid))
          .filter(Boolean);
        const loaded = await Promise.all(ids.map(async (uid) => {
          try {
            const person = await getDoc(doc(db, "users", uid));
            return person.exists() ? { uid, ...person.data() } : { uid, name: "Contact" };
          } catch {
            return { uid, name: "Contact" };
          }
        }));
        setContacts(loaded);
        setSelectedAudience(new Set(ids));
      },
      (error) => {
        console.error("Moments contacts listener:", error);
        setMessage("Couldn't load your contacts.");
      }
    );
  }, [user?.uid]);

  // Each Moment carries audienceUids, including its author, so the query can
  // return only documents this signed-in user is permitted to see.
  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(
      query(collection(db, "moments"), where("audienceUids", "array-contains", user.uid)),
      (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setFeed(items);
      },
      (error) => {
        console.error("Moments feed listener:", error);
        setMessage("Moments security rules need to be published before the feed can load.");
      }
    );
  }, [user?.uid]);

  // Personal hide/mute preferences are stored beneath the current user's document.
  useEffect(() => {
    if (!user?.uid) return;
    const stopHidden = onSnapshot(collection(db, "users", user.uid, "hiddenMoments"),
      (snap) => setHidden(new Set(snap.docs.map((item) => item.id))));
    const stopMuted = onSnapshot(collection(db, "users", user.uid, "mutedMomentUsers"),
      (snap) => setMuted(new Set(snap.docs.map((item) => item.id))));
    return () => { stopHidden(); stopMuted(); };
  }, [user?.uid]);

  // Listen for each visible Moment's likes and comments.
  useEffect(() => {
    const stops = [];
    feed.forEach((moment) => {
      stops.push(onSnapshot(collection(db, "moments", moment.id, "likes"), (snap) => {
        setLikes((current) => ({ ...current, [moment.id]: snap.size }));
        setLikedByMe((current) => {
          const next = new Set(current);
          if (snap.docs.some((item) => item.id === user.uid)) next.add(moment.id);
          else next.delete(moment.id);
          return next;
        });
      }, (error) => console.error("Moment likes listener:", error)));
      stops.push(onSnapshot(query(collection(db, "moments", moment.id, "comments")), (snap) => {
        const items = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        setComments((current) => ({ ...current, [moment.id]: items }));
      }, (error) => console.error("Moment comments listener:", error)));
    });
    return () => stops.forEach((stop) => stop());
  }, [feed, user.uid]);

  const visibleFeed = useMemo(
    () => feed.filter((moment) => !hidden.has(moment.id) && !muted.has(moment.ownerUid)),
    [feed, hidden, muted]
  );

  const chooseFiles = (files) => {
    const next = Array.from(files || []);
    const images = next.filter((file) => file.type.startsWith("image/"));
    const videos = next.filter((file) => file.type.startsWith("video/"));
    if (next.length !== images.length + videos.length) {
      setMessage("Choose image or video files only.");
      return;
    }
    if (images.length > MAX_PHOTOS || videos.length > MAX_VIDEO || next.length > MAX_PHOTOS + MAX_VIDEO) {
      setMessage("A Moment can contain up to 9 photos and 1 video.");
      return;
    }
    if (videos.length && images.length && next.findIndex((file) => file.type.startsWith("video/")) < next.findIndex((file) => file.type.startsWith("image/"))) {
      // Keep the selected order while still enforcing the per-type limits.
    }
    setSelectedFiles(next);
    setMessage("");
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
    setCropIndex((current) => current === index ? null : current !== null && current > index ? current - 1 : current);
  };

  const applyPhotoCrop = (croppedFile) => {
    setSelectedFiles((current) => current.map((file, index) => index === cropIndex ? croppedFile : file));
    setCropIndex(null);
  };

  const closeComposer = (force = false) => {
    if (uploading && !force) return;
    setComposerOpen(false);
    setCaption("");
    setSelectedFiles([]);
    setAudience("contacts");
    setSelectedAudience(new Set(contacts.map((person) => person.uid)));
    setMessage("");
  };

  const uploadMedia = async (file) => {
    const resourceType = file.type.startsWith("video/") ? "video" : "image";
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    if (!response.ok || !data.secure_url) {
      throw new Error(data.error?.message || `Couldn't upload ${file.name}.`);
    }
    return {
      url: data.secure_url,
      type: resourceType === "video" ? "video" : "image",
      name: file.name,
      width: data.width || null,
      height: data.height || null,
      duration: data.duration || null,
    };
  };

  const publishMoment = async (event) => {
    event.preventDefault();
    if (uploading) return;
    if (!caption.trim() && selectedFiles.length === 0) {
      setMessage("Add a caption or at least one photo or video.");
      return;
    }
    if (audience === "selected" && selectedAudience.size === 0) {
      setMessage("Choose at least one contact for this audience.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const media = [];
      for (const file of selectedFiles) media.push(await uploadMedia(file));
      const audienceUids = audience === "contacts"
        ? contacts.map((person) => person.uid)
        : Array.from(selectedAudience);
      audienceUids.push(user.uid);
      await addDoc(collection(db, "moments"), {
        ownerUid: user.uid,
        ownerName: profile?.name || user.displayName || "Tether user",
        ownerPhoto: profile?.photoURL || "",
        caption: caption.trim().slice(0, MAX_CAPTION),
        media,
        audience: audience === "contacts" ? "contacts" : "selected",
        audienceUids: [...new Set(audienceUids)],
        createdAt: serverTimestamp(),
      });
      closeComposer(true);
    } catch (error) {
      console.error("Publish Moment error:", error);
      setMessage(error.message || "Couldn't publish this Moment.");
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (moment) => {
    const ref = doc(db, "moments", moment.id, "likes", user.uid);
    try {
      if (likedByMe.has(moment.id)) await deleteDoc(ref);
      else await setDoc(ref, {
        uid: user.uid,
        displayName: profile?.name || "Tether user",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Moment like error:", error);
      setMessage("Couldn't update your like. Check the Moments security rules.");
    }
  };

  const addComment = async (moment) => {
    const text = (commentDrafts[moment.id] || "").trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "moments", moment.id, "comments"), {
        uid: user.uid,
        displayName: profile?.name || "Tether user",
        photoURL: profile?.photoURL || "",
        text: text.slice(0, 500),
        parentId: null,
        createdAt: serverTimestamp(),
      });
      setCommentDrafts((current) => ({ ...current, [moment.id]: "" }));
    } catch (error) {
      console.error("Moment comment error:", error);
      setMessage("Couldn't post your comment. Check the Moments security rules.");
    }
  };

  const addReply = async (moment, parentId, text) => {
    const reply = text.trim();
    if (!reply) return;
    try {
      await addDoc(collection(db, "moments", moment.id, "comments"), {
        uid: user.uid,
        displayName: profile?.name || "Tether user",
        photoURL: profile?.photoURL || "",
        text: reply.slice(0, 500),
        parentId,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Moment reply error:", error);
      setMessage("Couldn't post your reply.");
    }
  };

  const hideMoment = async (moment) => {
    try {
      await setDoc(doc(db, "users", user.uid, "hiddenMoments", moment.id), {
        at: serverTimestamp(),
      });
    } catch (error) {
      console.error("Hide Moment error:", error);
      setMessage("Couldn't hide this Moment.");
    }
  };

  const muteAuthor = async (moment) => {
    if (moment.ownerUid === user.uid) return;
    try {
      await setDoc(doc(db, "users", user.uid, "mutedMomentUsers", moment.ownerUid), {
        at: serverTimestamp(),
      });
    } catch (error) {
      console.error("Mute Moment author error:", error);
      setMessage("Couldn't mute this person.");
    }
  };

  const reportMoment = async (moment) => {
    const reason = window.prompt("Why are you reporting this Moment?\n\nSpam, harassment, inappropriate content, or something else.");
    if (!reason?.trim()) return;
    try {
      await addDoc(collection(db, "reports"), {
        reporter: user.uid,
        reported: moment.ownerUid,
        momentId: moment.id,
        reason: reason.trim().slice(0, 120),
        createdAt: serverTimestamp(),
      });
      setMessage("Report submitted. Thank you.");
    } catch (error) {
      console.error("Report Moment error:", error);
      setMessage("Couldn't submit your report.");
    }
  };

  const deleteMoment = async (moment) => {
    if (!window.confirm("Delete this Moment? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "moments", moment.id));
    } catch (error) {
      console.error("Delete Moment error:", error);
      setMessage("Couldn't delete this Moment.");
    }
  };

  const openMedia = (moment, index) => setViewer({ media: moment.media || [], index });

  return (
    <div className="tm-page">
      <div className="tm-header">
        <div>
          <h2>Moments</h2>
          <p>Little updates from your people.</p>
        </div>
        <button type="button" className="tm-create-button" onClick={() => setComposerOpen(true)}>
          <span aria-hidden="true">＋</span> Create Moment
        </button>
      </div>

      {message && <div className="tm-notice" role="status">{message}</div>}

      {composerOpen && (
        <div className="tm-composer-backdrop" onClick={closeComposer}>
          <form className="tm-composer" onSubmit={publishMoment} onClick={(event) => event.stopPropagation()}>
            <div className="tm-composer-head">
              <div><h3>Create a Moment</h3><p>Share a little update with your people.</p></div>
              <button type="button" onClick={closeComposer} aria-label="Close">×</button>
            </div>
            <div className="tm-composer-author">
              <Avatar src={profile?.photoURL} name={profile?.name || "You"} size={42} />
              <div><b>{profile?.name || "You"}</b><small>Posting to your audience</small></div>
            </div>
            <textarea value={caption} maxLength={MAX_CAPTION} onChange={(event) => setCaption(event.target.value)} placeholder="What's happening?" rows={4} />
            <div className="tm-media-toolbar">
              <button type="button" className="tm-secondary" onClick={() => fileRef.current?.click()}>＋ Add photos or video</button>
              <small>{selectedFiles.filter((file) => file.type.startsWith("image/")).length}/9 photos · {selectedFiles.filter((file) => file.type.startsWith("video/")).length}/1 video</small>
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => chooseFiles(event.target.files)} />
            </div>
            {selectedFiles.length > 0 && (
              <div className="tm-selected-media">
                {selectedFiles.map((file, index) => (
                  <div className="tm-selected-item" key={`${file.name}-${file.lastModified}-${index}`}>
                    {file.type.startsWith("video/")
                      ? <video src={selectedPreviews[index]} muted playsInline />
                      : <img src={selectedPreviews[index]} alt={file.name} />}
                    <button type="button" onClick={() => removeSelectedFile(index)} aria-label={`Remove ${file.name}`}>×</button>
                    {file.type.startsWith("image/") && (
                      <button type="button" className="tm-selected-crop" onClick={() => setCropIndex(index)}>Crop</button>
                    )}
                    <small>{file.type.startsWith("video/") ? "Video" : "Photo"}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="tm-audience">
              <label htmlFor="tm-audience">Who can see this?</label>
              <select id="tm-audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
                <option value="contacts">All my contacts</option>
                <option value="selected">Selected contacts</option>
              </select>
            </div>
            {audience === "selected" && (
              <div className="tm-audience-list">
                {contacts.length === 0 ? <p>You don't have any contacts yet.</p> : contacts.map((person) => (
                  <label key={person.uid}>
                    <input type="checkbox" checked={selectedAudience.has(person.uid)} onChange={(event) => {
                      setSelectedAudience((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(person.uid);
                        else next.delete(person.uid);
                        return next;
                      });
                    }} />
                    <Avatar src={person.photoURL} name={person.name || "Contact"} size={30} />
                    <span>{person.name || person.username || "Contact"}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="tm-composer-footer">
              <small>{caption.length}/{MAX_CAPTION}</small>
              <button type="submit" disabled={uploading}>{uploading ? "Uploading…" : "Share Moment"}</button>
            </div>
          </form>
        </div>
      )}

      {visibleFeed.length === 0 ? (
        <div className="tm-empty">
          <div className="tm-empty-icon">◌</div>
          <h3>Your Moments feed is quiet</h3>
          <p>Share a photo, a video or a little update. Moments from your contacts will appear here.</p>
          <button type="button" onClick={() => setComposerOpen(true)}>Create your first Moment</button>
        </div>
      ) : (
        <div className="tm-feed">
          {visibleFeed.map((moment) => {
            const momentComments = comments[moment.id] || [];
            const topLevel = momentComments.filter((comment) => !comment.parentId);
            return (
              <article className="tm-card" key={moment.id}>
                <div className="tm-card-head">
                  <button className="tm-author" type="button" onClick={() => onProfile?.(moment.ownerUid)}>
                    <Avatar src={moment.ownerPhoto} name={moment.ownerName || "Tether user"} size={42} />
                    <span><b>{moment.ownerName || "Tether user"}</b><small>{formatMomentTime(moment.createdAt)}</small></span>
                  </button>
                  <div className="tm-menu-wrap">
                    <details>
                      <summary aria-label="Moment options">•••</summary>
                      <div className="tm-menu">
                        {moment.ownerUid === user.uid
                          ? <button type="button" onClick={() => deleteMoment(moment)}>Delete Moment</button>
                          : <>
                              <button type="button" onClick={() => hideMoment(moment)}>Hide this Moment</button>
                              <button type="button" onClick={() => muteAuthor(moment)}>Mute this person</button>
                              <button type="button" onClick={() => reportMoment(moment)}>Report Moment</button>
                            </>}
                      </div>
                    </details>
                  </div>
                </div>
                {moment.caption && <p className="tm-caption">{moment.caption}</p>}
                {moment.media?.length > 0 && (
                  <MomentMediaCarousel
                    media={moment.media.slice(0, 10)}
                    onOpen={(index) => openMedia(moment, index)}
                  />
                )}
                <div className="tm-actions" aria-label="Moment actions">
                  <button
                    type="button"
                    className={`tm-action-like${likedByMe.has(moment.id) ? " liked" : ""}`}
                    onClick={() => toggleLike(moment)}
                    aria-label={likedByMe.has(moment.id) ? "Unlike this Moment" : "Like this Moment"}
                    aria-pressed={likedByMe.has(moment.id)}
                    title={likedByMe.has(moment.id) ? "Unlike" : "Like"}
                  >
                    <MomentHeartIcon filled={likedByMe.has(moment.id)} />
                    <span className="tm-action-count">{likes[moment.id] || 0}</span>
                  </button>
                  <button
                    type="button"
                    className="tm-action-comments"
                    onClick={() => setExpandedComments((current) => {
                      const next = new Set(current);
                      if (next.has(moment.id)) next.delete(moment.id);
                      else next.add(moment.id);
                      return next;
                    })}
                    aria-label={expandedComments.has(moment.id) ? "Hide comments" : "View comments"}
                    aria-expanded={expandedComments.has(moment.id)}
                    title="Comments"
                  >
                    <MomentCommentIcon />
                    <span className="tm-action-count">{momentComments.length}</span>
                  </button>
                </div>
                {expandedComments.has(moment.id) && (
                  <div className="tm-comments">
                    {topLevel.map((comment) => (
                      <div className="tm-comment" key={comment.id}>
                        <Avatar name={comment.displayName || "Friend"} size={28} />
                        <div className="tm-comment-body">
                          <b>{comment.displayName || "Friend"}</b>
                          <p>{comment.text}</p>
                          <button type="button" onClick={() => {
                            const reply = window.prompt(`Reply to ${comment.displayName || "this comment"}:`);
                            if (reply) addReply(moment, comment.id, reply);
                          }}>Reply</button>
                          {momentComments.filter((item) => item.parentId === comment.id).map((reply) => (
                            <div className="tm-reply" key={reply.id}><b>{reply.displayName || "Friend"}</b><p>{reply.text}</p></div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <form className="tm-comment-form" onSubmit={(event) => { event.preventDefault(); addComment(moment); }}>
                      <input value={commentDrafts[moment.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [moment.id]: event.target.value }))} placeholder="Write a comment…" maxLength={500} />
                      <button type="submit">Post</button>
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {cropIndex !== null && selectedFiles[cropIndex] && (
        <MomentPhotoCropper
          src={selectedPreviews[cropIndex]}
          fileName={selectedFiles[cropIndex].name}
          onCancel={() => setCropIndex(null)}
          onApply={applyPhotoCrop}
        />
      )}
      {viewer && <MediaViewer media={viewer.media} initialIndex={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  );
}
