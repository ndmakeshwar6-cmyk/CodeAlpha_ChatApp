import React, { useEffect, useRef, useState } from "react";

import { db } from "./firebase";

import {

  collection,

  doc,

  getDoc,

  getDocs,

  setDoc,

  deleteDoc,

  addDoc,

  onSnapshot,

  query,

  where,

  orderBy,

  serverTimestamp,

  increment,

} from "firebase/firestore";

import Avatar from "./Avatar";

import Whiteboard from "./Whiteboard";

import VideoCall from "./VideoCall";
import StickerPicker from "./StickerPicker";
import StickerActions from "./StickerActions";
import EmojiPicker from "emoji-picker-react";
import VoiceNoteComposer, { VoiceNotePlayer } from "./VoiceNotes";

const CLOUD_NAME = "n7saeady";

const UPLOAD_PRESET = "chatapp_upload";

const FAIL =

  "Message couldn't be sent. Check your connection, or you may not be able to message here.";

const clock = (ts) =>

  ts?.toDate

    ? ts.toDate().toLocaleTimeString([], {

        hour: "numeric",

        minute: "2-digit",

      })

    : "";

const ms = (x) => (x?.toMillis ? x.toMillis() : 0);

// Return a local-calendar date key for a Firestore timestamp.
const getDateKey = (timestamp) => {
  if (!timestamp?.toDate) return null;
  const date = timestamp.toDate();
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

// WhatsApp-style labels for message date separators.
const getDateLabel = (timestamp) => {
  if (!timestamp?.toDate) return "";

  const date = timestamp.toDate();
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const key = getDateKey(timestamp);
  const todayKey = getDateKey({ toDate: () => today });
  const yesterdayKey = getDateKey({ toDate: () => yesterday });

  if (key === todayKey) return "TODAY";
  if (key === yesterdayKey) return "YESTERDAY";

  return date.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
};

// Use Apple's emoji artwork everywhere instead of the computer's native emoji font.
const appleEmojiUrl = (emoji) => {
  const code = Array.from(emoji)
    .map((character) => character.codePointAt(0).toString(16))
    .filter((code) => code !== "fe0f")
    .join("-");
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${code}.png`;
};

const renderAppleEmojiText = (value) => {
  if (!value) return value;
  if (typeof Intl.Segmenter !== "function") return value;

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(value), ({ segment }, index) => {
    if (!/\p{Extended_Pictographic}/u.test(segment)) return segment;
    return (
      <img
        key={`${index}-${segment}`}
        src={appleEmojiUrl(segment)}
        alt={segment}
        title={segment}
        className="tether-apple-emoji"
        onError={(event) => {
          event.currentTarget.replaceWith(document.createTextNode(segment));
        }}
      />
    );
  });
};

const AppleEmoji = ({ emoji, size = 24 }) => (
  <img
    src={appleEmojiUrl(emoji)}
    alt={emoji}
    title={emoji}
    className="tether-apple-emoji"
    style={{ width: size, height: size, objectFit: "contain", verticalAlign: "middle", marginInlineEnd: 3, flex: "0 0 auto" }}
    onError={(event) => {
      event.currentTarget.replaceWith(document.createTextNode(emoji));
    }}
  />
);

// Line icons for the message-selection toolbar (same style as the other chat icons).
const TOOLBAR_ICON_PATHS = {
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  reply: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v3" />,
  star: (
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2M12 7.8h.01" />
    </>
  ),
  trash: (
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12M9 7V4.5h6V7" />
  ),
  forward: <path d="m15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6v2" />,
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.2" fill="currentColor" />
    </>
  ),
};

const ToolbarIcon = ({ name, filled = false }) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: "block", flexShrink: 0 }}
  >
    {TOOLBAR_ICON_PATHS[name]}
  </svg>
);

export default function ChatView({

  user,

  profile,

  chat,

  nicks,

  onBack,

  onProfile,

  onGroupInfo,

}) {

  // Keep the app's available height in sync with Android's visible viewport.
  // This matters when the on-screen keyboard opens or closes.
  useEffect(() => {
    const viewport = window.visualViewport;

    const updateVisibleHeight = () => {
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty(
        "--tether-visual-height",
        `${Math.round(height)}px`
      );
    };

    updateVisibleHeight();
    viewport?.addEventListener("resize", updateVisibleHeight);
    window.addEventListener("resize", updateVisibleHeight);

    return () => {
      viewport?.removeEventListener("resize", updateVisibleHeight);
      window.removeEventListener("resize", updateVisibleHeight);
      document.documentElement.style.removeProperty("--tether-visual-height");
    };
  }, []);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const messageInputRef = useRef(null);

  const [other, setOther] = useState(null);

  const [groupDoc, setGroupDoc] = useState(null);

  const [noAccess, setNoAccess] = useState(false);

  const [messages, setMessages] = useState([]);

  const [chatDoc, setChatDoc] = useState(null);

  const [iBlocked, setIBlocked] = useState(false);

  const [text, setText] = useState("");

  const [uploading, setUploading] = useState(false);

  const [err, setErr] = useState("");

  const [showWhiteboard, setShowWhiteboard] = useState(false);

  const [showVideoCall, setShowVideoCall] = useState(false);

  // Message selection and actions

  const [selectedIds, setSelectedIds] = useState([]);
  const [messageReactions, setMessageReactions] = useState([]);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [reactionDetailsFor, setReactionDetailsFor] = useState(null);
  const [customizingReactions, setCustomizingReactions] = useState(false);
  const [quickReactions, setQuickReactions] = useState(["❤️", "😂", "🥹", "😍", "👍", "🎉"]);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  const [showMore, setShowMore] = useState(false);

  const [replyTo, setReplyTo] = useState(null);

  const [starredIds, setStarredIds] = useState(new Set());

  const [pinnedMessages, setPinnedMessages] = useState([]);

  const [infoMessage, setInfoMessage] = useState(null);

  const [forwardOpen, setForwardOpen] = useState(false);

  const [forwardTargets, setForwardTargets] = useState([]);

  const [forwardLoading, setForwardLoading] = useState(false);

  const [forwarding, setForwarding] = useState(false);

  const [pinning, setPinning] = useState("");

  const [, tick] = useState(0);

  const fileRef = useRef(null);

  const endRef = useRef(null);

  const lastTyping = useRef(0);

  const readMarked = useRef("");

  const messageRefs = useRef({});

  const pressTimer = useRef(null);

  const longPressed = useRef(false);

  const path = chat.group

    ? ["groups", chat.id, "messages"]

    : ["chats", chat.id, "messages"];

  const pinPath = chat.group

    ? ["groups", chat.id, "pinnedMessages"]

    : ["chats", chat.id, "pinnedMessages"];

  const reactionPath = chat.group
    ? ["groups", chat.id, "messageReactions"]
    : ["chats", chat.id, "messageReactions"];

  const title = chat.group

    ? groupDoc?.name || "Group"

    : nicks[chat.otherUid] || other?.name || "Chat";

  const selectedMessages = messages.filter((m) =>

    selectedIds.includes(m.id)

  );

  const selectedMessage = selectedMessages[0];

  // Load private chat partner profile.

  useEffect(() => {

    setShowEmojiPicker(false);

  }, [chat.id, chat.group]);

  useEffect(() => {

    if (!chat.otherUid) return;

    getDoc(doc(db, "users", chat.otherUid)).then((s) =>

      setOther(s.exists() ? s.data() : null)

    );

  }, [chat.otherUid]);

  // Listen to group information.

  useEffect(() => {

    if (!chat.group) return;

    return onSnapshot(

      doc(db, "groups", chat.id),

      (s) => {

        if (s.exists()) {

          setGroupDoc(s.data());

          setNoAccess(false);

        } else {

          setNoAccess(true);

        }

      },

      () => setNoAccess(true)

    );

  }, [chat.group, chat.id]);

  // Listen to messages.

  useEffect(() => {

    const q = query(collection(db, ...path), orderBy("createdAt"));

    return onSnapshot(

      q,

      (snap) =>

        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),

      () => setNoAccess(true)

    );

  }, [chat.id, chat.group]);

  // Listen to reactions in this conversation in real time.
  useEffect(() => {
    setMessageReactions([]);
    return onSnapshot(
      collection(db, ...reactionPath),
      (snap) => setMessageReactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (error) => console.error("Message reactions error:", error)
    );
  }, [chat.id, chat.group]);

  // Load this user's saved quick reactions.
  useEffect(() => {
    return onSnapshot(doc(db, "users", user.uid, "prefs", "reactions"), (snap) => {
      const saved = snap.data()?.emojis;
      if (Array.isArray(saved) && saved.length) setQuickReactions(saved.slice(0, 6));
    });
  }, [user.uid]);

  // Listen to private chat metadata.

  useEffect(() => {

    if (chat.group) return;

    return onSnapshot(doc(db, "chats", chat.id), (s) =>

      setChatDoc(s.exists() ? s.data() : { none: true })

    );

  }, [chat.group, chat.id]);

  // Listen to block status.

  useEffect(() => {

    if (!chat.otherUid) return;

    return onSnapshot(

      doc(db, "users", user.uid, "blocked", chat.otherUid),

      (s) => setIBlocked(s.exists())

    );

  }, [chat.otherUid, user.uid]);

  // Listen to pinned messages.

  useEffect(() => {

    const q = query(

      collection(db, ...pinPath),

      orderBy("pinnedAt", "desc")

    );

    return onSnapshot(

      q,

      (snap) =>

        setPinnedMessages(

          snap.docs.map((d) => ({ id: d.id, ...d.data() }))

        ),

      (error) => console.error("Pinned messages error:", error)

    );

  }, [chat.id, chat.group]);

  // Listen to this user's personal starred messages.

  useEffect(() => {

    const ref = collection(db, "users", user.uid, "starredMessages");

    return onSnapshot(ref, (snap) => {

      const ids = new Set(

        snap.docs

          .filter((d) => d.data().chatId === chat.id)

          .map((d) => d.data().messageId)

      );

      setStarredIds(ids);

    });

  }, [user.uid, chat.id]);

  useEffect(() => {

    const t = setInterval(() => tick((n) => n + 1), 2000);

    return () => clearInterval(t);

  }, []);

  // Scroll to latest message and update group unread count.

  useEffect(() => {

    endRef.current?.scrollIntoView({ behavior: "smooth" });

    if (chat.group && groupDoc && messages.length > 0) {

      const last = messages[messages.length - 1];

      if (last.uid !== user.uid && (groupDoc.unread?.[user.uid] || 0) > 0) {

        setDoc(

          doc(db, "groups", chat.id),

          { unread: { [user.uid]: 0 } },

          { merge: true }

        ).catch(() => {});

      }

    }

  }, [messages, groupDoc, chat.group, chat.id, user.uid]);

  const markRead = () => {

    if (chat.group || !chatDoc || chatDoc.none) return;

    if (document.visibilityState !== "visible") return;

    const last = messages[messages.length - 1];

    if (!last || last.uid === user.uid || !last.createdAt?.toMillis) return;

    const unread = chatDoc.unread?.[user.uid] || 0;

    const needs =

      ms(chatDoc.lastRead?.[user.uid]) < ms(last.createdAt) || unread > 0;

    if (!needs || readMarked.current === last.id) return;

    readMarked.current = last.id;

    setDoc(

      doc(db, "chats", chat.id),

      {

        lastRead: { [user.uid]: serverTimestamp() },

        unread: { [user.uid]: 0 },

      },

      { merge: true }

    ).catch(() => {

      readMarked.current = "";

    });

  };

  useEffect(() => {

    markRead();

    document.addEventListener("visibilitychange", markRead);

    window.addEventListener("focus", markRead);

    return () => {

      document.removeEventListener("visibilitychange", markRead);

      window.removeEventListener("focus", markRead);

    };

  }, [messages, chatDoc]);

  const onType = (v) => {

    setText(v);

    if (chat.group || iBlocked || !v || !chatDoc || chatDoc.none) return;

    const now = Date.now();

    if (now - lastTyping.current < 2500) return;

    lastTyping.current = now;

    setDoc(

      doc(db, "chats", chat.id),

      { typing: { [user.uid]: now } },

      { merge: true }

    ).catch(() => {});

  };

  const insertEmoji = (emoji) => {

    const input = messageInputRef.current;

    const start = input?.selectionStart ?? text.length;

    const end = input?.selectionEnd ?? text.length;

    const updatedText = text.slice(0, start) + emoji + text.slice(end);

    onType(updatedText);

    setShowEmojiPicker(false);

    requestAnimationFrame(() => {

      if (!input) return;

      input.focus();

      const cursor = start + emoji.length;

      input.setSelectionRange(cursor, cursor);

    });

  };

  const post = async (extra, preview) => {

    await addDoc(collection(db, ...path), {

      ...extra,

      uid: user.uid,

      senderName: profile.name,

      senderPhoto: profile.photoURL || "",

      createdAt: serverTimestamp(),

    });

    if (chat.group) {

      const unread = {};

      (groupDoc?.members || [])

        .filter((m) => m !== user.uid)

        .forEach((u) => {

          unread[u] = increment(1);

        });

      await setDoc(

        doc(db, "groups", chat.id),

        {

          lastMessage: preview,

          lastSender: user.uid,

          lastAt: serverTimestamp(),

          unread,

        },

        { merge: true }

      );

    } else {

      await setDoc(

        doc(db, "chats", chat.id),

        {

          members: chat.id.split("_"),

          lastMessage: preview,

          lastSender: user.uid,

          lastAt: serverTimestamp(),

          unread: { [chat.otherUid]: increment(1) },

        },

        { merge: true }

      );

    }

  };

  const send = async () => {

    const t = text.trim();

    if (!t) return;

    setText("");

    setErr("");

    try {

      await post(

        {

          text: t,

          ...(replyTo

            ? {

                replyTo: {

                  messageId: replyTo.id,

                  text: replyTo.text || replyTo.fileName || "Attachment",

                  senderName: replyTo.senderName || "Friend",

                },

              }

            : {}),

        },

        t

      );

      setReplyTo(null);

    } catch {

      setText(t);

      setErr(FAIL);

    }

  };

  // Convert browser-recorded WebM/Opus audio into broadly supported PCM WAV.
  // Cloudinary's video endpoint accepts WAV audio; this avoids unsupported WebM audio uploads.
  const convertVoiceToWav = async (recordedBlob) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Audio conversion is not supported by this browser.");
    }

    const audioContext = new AudioContextClass();
    try {
      const decoded = await audioContext.decodeAudioData(await recordedBlob.arrayBuffer());
      const targetRate = 16000;
      const ratio = decoded.sampleRate / targetRate;
      const outputLength = Math.ceil(decoded.length / ratio);
      const mono = new Float32Array(outputLength);

      for (let i = 0; i < outputLength; i += 1) {
        const sourceIndex = Math.min(decoded.length - 1, Math.floor(i * ratio));
        let sum = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          sum += decoded.getChannelData(channel)[sourceIndex] || 0;
        }
        mono[i] = sum / decoded.numberOfChannels;
      }

      const bytesPerSample = 2;
      const dataSize = mono.length * bytesPerSample;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);
      const writeText = (offset, value) => {
        for (let i = 0; i < value.length; i += 1) {
          view.setUint8(offset + i, value.charCodeAt(i));
        }
      };

      writeText(0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeText(8, "WAVE");
      writeText(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, targetRate, true);
      view.setUint32(28, targetRate * bytesPerSample, true);
      view.setUint16(32, bytesPerSample, true);
      view.setUint16(34, 16, true);
      writeText(36, "data");
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let i = 0; i < mono.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, mono[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }

      return new Blob([buffer], { type: "audio/wav" });
    } finally {
      await audioContext.close();
    }
  };

  const sendVoiceNote = async (blob, duration) => {
    setUploading(true);
    setErr("");
    try {
      const wavBlob = await convertVoiceToWav(blob);
      const file = new File([wavBlob], "voice-message.wav", { type: "audio/wav" });
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
        { method: "POST", body: form }
      );
      const data = await response.json();

      if (!response.ok || !data.secure_url) {
        throw new Error(data.error?.message || "Cloudinary couldn't accept the converted voice recording.");
      }

      await post(
        {
          type: "audio",
          text: "",
          fileUrl: data.secure_url,
          fileName: file.name,
          fileType: "audio/wav",
          duration,
        },
        "Voice message"
      );
    } catch (error) {
      console.error("Voice note upload failed:", error);
      throw new Error(error.message || FAIL);
    } finally {
      setUploading(false);
    }
  };

  const sendSticker = async (sticker) => {
    if (!sticker?.url) return;

    setErr("");

    try {
      await post(
        {
          type: "sticker",
          text: "",
          stickerUrl: sticker.url,
          stickerName: sticker.name || "Sticker",
          stickerFormat: sticker.format || "",
          stickerAnimated: !!sticker.animated,
          stickerPackId: sticker.packId || "",
          stickerSourceId: sticker.stickerId || "",
          ...(replyTo
            ? {
                replyTo: {
                  messageId: replyTo.id,
                  text: replyTo.text || replyTo.fileName || "Sticker",
                  senderName: replyTo.senderName || "Friend",
                },
              }
            : {}),
        },
        "Sticker"
      );

      setReplyTo(null);
      setShowStickerPicker(false);
    } catch (error) {
      console.error("Send sticker error:", error);
      setErr(FAIL);
    }
  };

  const sendFile = async (e) => {

    const file = e.target.files[0];

    if (!file) return;

    setUploading(true);

    setErr("");

    try {

      const form = new FormData();

      form.append("file", file);

      form.append("upload_preset", UPLOAD_PRESET);

      const res = await fetch(

        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,

        { method: "POST", body: form }

      );

      const data = await res.json();

      if (!data.secure_url) throw new Error("Upload failed");

      await post(

        {

          text: "",

          fileUrl: data.secure_url,

          fileName: file.name,

          fileType: file.type,

          ...(replyTo

            ? {

                replyTo: {

                  messageId: replyTo.id,

                  text: replyTo.text || replyTo.fileName || "Attachment",

                  senderName: replyTo.senderName || "Friend",

                },

              }

            : {}),

        },

        "📎 " + file.name

      );

      setReplyTo(null);

    } catch (error) {

      setErr(

        error.message === "Upload failed" ? "Upload failed. Try again." : FAIL

      );

    }

    setUploading(false);

    e.target.value = "";

  };

  const unblock = () =>

    deleteDoc(doc(db, "users", user.uid, "blocked", chat.otherUid));

  const tickFor = (m) => {

    if (chat.group || m.uid !== user.uid) return null;

    const t = ms(m.createdAt);

    if (!t) return { icon: "🕓", cls: "" };

    if (ms(chatDoc?.lastRead?.[chat.otherUid]) >= t) {

      return { icon: "✓✓", cls: "read" };

    }

    if (ms(chatDoc?.delivered?.[chat.otherUid]) >= t) {

      return { icon: "✓✓", cls: "" };

    }

    return { icon: "✓", cls: "" };

  };

  // Selection controls.

  const clearSelection = () => {

    setSelectedIds([]);

    setShowMore(false);

  };

  const toggleSelection = (id) => {

    setSelectedIds((current) =>

      current.includes(id)

        ? current.filter((x) => x !== id)

        : [...current, id]

    );

  };

  const selectMessage = (id) => {

    setSelectedIds((current) =>

      current.length ? [...new Set([...current, id])] : [id]

    );

  };

  const startPress = (id) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setReactionPickerFor(id);
    }, 500);
  };

  const endPress = () => {

    if (pressTimer.current) {

      clearTimeout(pressTimer.current);

      pressTimer.current = null;

    }

  };

  const handleMessageClick = (id) => {

    if (longPressed.current) {

      longPressed.current = false;

      return;

    }

    if (selectedIds.length) toggleSelection(id);

  };

  const handleContextMenu = (e, id) => {

    e.preventDefault();

    selectMessage(id);

  };

  const reactionDocId = (messageId) => `${messageId}_${user.uid}`;

  const reactionsFor = (messageId) =>
    messageReactions.filter((reaction) => reaction.messageId === messageId);

  const groupedReactionsFor = (messageId) => {
    const grouped = new Map();
    reactionsFor(messageId).forEach((reaction) => {
      const current = grouped.get(reaction.emoji) || [];
      current.push(reaction);
      grouped.set(reaction.emoji, current);
    });
    return Array.from(grouped.entries()).map(([emoji, people]) => ({ emoji, people }));
  };

  const toggleReaction = async (messageId, emoji) => {
    const existing = messageReactions.find(
      (reaction) => reaction.messageId === messageId && reaction.uid === user.uid
    );
    const ref = doc(db, ...reactionPath, reactionDocId(messageId));
    setReactionPickerFor(null);
    setCustomizingReactions(false);
    try {
      if (existing?.emoji === emoji) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          messageId,
          uid: user.uid,
          emoji,
          displayName: profile?.name || user.displayName || "Friend",
          photoURL: profile?.photoURL || user.photoURL || "",
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Message reaction error:", error);
      setErr("Couldn't update this reaction. Please try again.");
    }
  };

  const saveQuickReactions = async (next) => {
    if (!next.length || next.length > 6) return;
    setQuickReactions(next);
    try {
      await setDoc(
        doc(db, "users", user.uid, "prefs", "reactions"),
        { emojis: next },
        { merge: true }
      );
    } catch (error) {
      console.error("Save quick reactions error:", error);
      setErr("Couldn't save your quick reactions.");
    }
  };

  // Star / unstar privately for this user.

  const toggleStar = async (message) => {

    const starId = `${chat.id}_${message.id}`;

    const ref = doc(db, "users", user.uid, "starredMessages", starId);

    try {

      if (starredIds.has(message.id)) {

        await deleteDoc(ref);

      } else {

        await setDoc(ref, {

          chatId: chat.id,

          group: !!chat.group,

          messageId: message.id,

          text: message.text || "",

          fileName: message.fileName || "",

          senderName: message.senderName || profile.name,

          starredAt: serverTimestamp(),

        });

      }

    } catch (error) {

      console.error("Star message error:", error);

      setErr("Couldn't update starred message.");

    }

  };

  // Pin / unpin a message for everyone in this conversation.

  const togglePin = async (message) => {

    setPinning(message.id);

    try {

      const ref = doc(db, ...pinPath, message.id);

      const alreadyPinned = pinnedMessages.some((p) => p.id === message.id);

      if (alreadyPinned) {

        await deleteDoc(ref);

      } else {

        await setDoc(ref, {

          messageId: message.id,

          senderUid: message.uid,

          senderName: message.senderName || "Friend",

          pinnedBy: user.uid,

          pinnedAt: serverTimestamp(),

          text: message.text || "",

          fileName: message.fileName || "",

          fileUrl: message.fileUrl || "",

          fileType: message.fileType || "",

        });

      }

    } catch (error) {

      console.error("Pin message error:", error);

      setErr("Couldn't update pinned message.");

    } finally {

      setPinning("");

    }

  };

  const jumpToMessage = (messageId) => {

    const element = messageRefs.current[messageId];

    if (element) {

      element.scrollIntoView({ behavior: "smooth", block: "center" });

    } else {

      setErr("This message is no longer available in the chat.");

    }

  };

  // Reply to the first selected message.

  const replySelected = () => {

    if (!selectedMessage) return;

    setReplyTo(selectedMessage);

    clearSelection();

  };

  // Copy selected message text.

  const copySelected = async () => {

    const content = selectedMessages

      .map((m) => m.text || m.stickerName || (m.stickerUrl ? "Sticker" : "") || m.fileName || "Attachment")

      .join("\n");

    try {

      await navigator.clipboard.writeText(content);

      clearSelection();

    } catch {

      setErr("Couldn't copy the selected message.");

    }

  };

  // Delete only messages sent by the current user.

  const deleteSelected = async () => {

    const own = selectedMessages.filter((m) => m.uid === user.uid);

    if (!own.length) {

      setErr("You can only delete messages you sent.");

      return;

    }

    if (

      !window.confirm(

        `Delete ${own.length} selected message${own.length > 1 ? "s" : ""}?`

      )

    ) {

      return;

    }

    try {

      await Promise.all(

        own.map((m) => deleteDoc(doc(db, ...path, m.id)))

      );

      clearSelection();

    } catch (error) {

      console.error("Delete message error:", error);

      setErr("Couldn't delete the selected messages.");

    }

  };

  // Show message details.

  const showInfo = () => {

    if (!selectedMessage) return;

    setInfoMessage(selectedMessage);

    clearSelection();

  };

  // Load conversations available for forwarding.

  const openForward = async () => {

    setForwardOpen(true);

    setForwardLoading(true);

    try {

      const [privateSnap, groupSnap] = await Promise.all([

        getDocs(

          query(

            collection(db, "chats"),

            where("members", "array-contains", user.uid)

          )

        ),

        getDocs(

          query(

            collection(db, "groups"),

            where("members", "array-contains", user.uid)

          )

        ),

      ]);

      const options = [];

      for (const d of privateSnap.docs) {

        const data = d.data();

        const otherUid = data.members.find((m) => m !== user.uid);

        if (!otherUid) continue;

        const p = await getDoc(doc(db, "users", otherUid));

        options.push({

          id: d.id,

          group: false,

          name: nicks[otherUid] || p.data()?.name || "Private chat",

        });

      }

      groupSnap.docs.forEach((d) => {

        options.push({

          id: d.id,

          group: true,

          name: d.data().name || "Group",

        });

      });

      setForwardTargets(options);

    } catch (error) {

      console.error("Load forwarding destinations:", error);

      setErr("Couldn't load your conversations.");

      setForwardOpen(false);

    } finally {

      setForwardLoading(false);

    }

  };

  const forwardTo = async (target) => {

    if (!selectedMessages.length) return;

    setForwarding(true);

    const targetPath = target.group

      ? ["groups", target.id, "messages"]

      : ["chats", target.id, "messages"];

    try {

      for (const m of selectedMessages) {

        const preview = m.text || (m.stickerUrl ? "Sticker" : `📎 ${m.fileName || "Attachment"}`);

        await addDoc(collection(db, ...targetPath), {

          text: m.text || "",

          fileUrl: m.fileUrl || "",

          fileName: m.fileName || "",

          fileType: m.fileType || "",

          stickerUrl: m.stickerUrl || "",

          stickerName: m.stickerName || "",

          stickerFormat: m.stickerFormat || "",

          stickerAnimated: !!m.stickerAnimated,

          stickerPackId: m.stickerPackId || "",

          stickerId: m.stickerId || "",

          stickerSource: m.stickerSource || "",

          forwarded: true,

          forwardedFrom: m.senderName || "Friend",

          uid: user.uid,

          senderName: profile.name,

          senderPhoto: profile.photoURL || "",

          createdAt: serverTimestamp(),

        });

        if (target.group) {

          await setDoc(

            doc(db, "groups", target.id),

            {

              lastMessage: "Forwarded: " + preview,

              lastSender: user.uid,

              lastAt: serverTimestamp(),

            },

            { merge: true }

          );

        } else {

          const otherUid = target.id.split("_").find((id) => id !== user.uid);

          await setDoc(

            doc(db, "chats", target.id),

            {

              members: target.id.split("_"),

              lastMessage: "Forwarded: " + preview,

              lastSender: user.uid,

              lastAt: serverTimestamp(),

              unread: { [otherUid]: increment(1) },

            },

            { merge: true }

          );

        }

      }

      setForwardOpen(false);

      clearSelection();

    } catch (error) {

      console.error("Forward error:", error);

      setErr("Couldn't forward the selected messages.");

    } finally {

      setForwarding(false);

    }

  };

  const pinnedIds = new Set(pinnedMessages.map((p) => p.id));

  const theirTyping = chatDoc?.typing?.[chat.otherUid];

  const isTyping =

    !chat.group && !!theirTyping && Date.now() - theirTyping < 5000;

  return (

    <div className="chatview">
      <style>{`
        .tether-apple-emoji {
          display: inline-block;
          width: 1em;
          height: 1em;
          max-width: 1em;
          box-sizing: border-box;
          object-fit: contain;
          vertical-align: -0.12em;
          margin-inline: 0 0.18em;
          line-height: 1;
          flex: 0 0 auto;
        }
        /* Keep the time and delivery ticks together, even for emoji-only messages. */
        .chatview .msg:not(.sticker-only-message) {
          min-width: 112px;
          box-sizing: border-box;
        }
        .chatview .msg-meta {
          display: flex;
          flex-wrap: nowrap;
          white-space: nowrap;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
        }
        .chatview .msg-meta > span {
          white-space: nowrap;
          flex-shrink: 0;
        }
        .msg .message-text {
          display: block;
          box-sizing: border-box;
          max-width: 100%;
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: normal;
          line-height: 1.45;
        }
      `}</style>

      {/* WHATSAPP-STYLE SELECTION TOOLBAR */}

      {selectedIds.length > 0 ? (

        <div className="message-selection-toolbar">

          <button onClick={clearSelection} title="Close selection"><ToolbarIcon name="back" /></button>

          <b>{selectedIds.length}</b>

          <button onClick={replySelected} title="Reply"><ToolbarIcon name="reply" /></button>

          <button

            onClick={() => {

              if (selectedMessage) toggleStar(selectedMessage);

            }}

            title="Star message"

          ><ToolbarIcon name="star" filled={!!selectedMessage && starredIds.has(selectedMessage.id)} /></button>

          <button onClick={showInfo} title="Message info"><ToolbarIcon name="info" /></button>

          <button onClick={deleteSelected} title="Delete"><ToolbarIcon name="trash" /></button>

          <button onClick={openForward} title="Forward"><ToolbarIcon name="forward" /></button>

          <div className="message-more-wrap">

            <button

              onClick={() => setShowMore((v) => !v)}

              title="More options"

            ><ToolbarIcon name="more" /></button>

            {showMore && (

              <div className="message-more-menu">

                <button onClick={copySelected}>Copy</button>

                <button

                  onClick={() => {

                    if (selectedMessage) togglePin(selectedMessage);

                    clearSelection();

                  }}

                >

                  {selectedMessage && pinnedIds.has(selectedMessage.id)

                    ? "Unpin message"

                    : "Pin message"}

                </button>

                <button

                  onClick={() => {

                    if (selectedMessage) toggleStar(selectedMessage);

                    clearSelection();

                  }}

                >

                  {selectedMessage && starredIds.has(selectedMessage.id)

                    ? "Unstar message"

                    : "Star message"}

                </button>

              </div>

            )}

          </div>

        </div>

      ) : (

        <div className="chat-head">

          <button className="back" onClick={onBack}>

            ←

          </button>

          {chat.group ? (

            <div

              className="head-person"

              onClick={() => !noAccess && onGroupInfo(chat.id)}

            >

              <Avatar src={groupDoc?.photoURL} name={title} size={40} />

              <div className="head-text">

                <b>{title}</b>

                {groupDoc && (

                  <small>

                    {groupDoc.members?.length || 0} members · tap for info

                  </small>

                )}

              </div>

            </div>

          ) : (

            <div className="head-person" onClick={() => onProfile(chat.otherUid)}>

              <Avatar src={other?.photoURL} name={title} size={40} />

              <b>{title}</b>

            </div>

          )}

          {!noAccess && (

            <>

              <button

                className="whiteboard-toggle"

                onClick={() => setShowWhiteboard(true)}

                title="Open shared whiteboard"

              >

                <svg
                  className="chat-head-tool-icon"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3.5" y="4" width="17" height="13" rx="1.8" />
                  <path d="M8 21h8M12 17v4M7.5 13l3.1-3.1 2.1 2.1 3.8-3.8" />
                </svg>
                <span>Whiteboard</span>

              </button>

              <button

                className="whiteboard-toggle"

                onClick={() => setShowVideoCall(true)}

                title="Start video call"

              >

                <svg
                  className="chat-head-tool-icon"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path d="m16 10 5-3v10l-5-3" />
                </svg>
                <span>Call</span>

              </button>

            </>

          )}

        </div>

      )}

      {/* PINNED MESSAGES BAR */}

      {pinnedMessages.length > 0 && (

        <div className="pinned-messages-bar">

          <div className="pinned-messages-heading">

            <span className="pinned-heading-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
                stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M8 4h8l-1 5 3 3v2H6v-2l3-3-1-5Z" />
                <path d="m12 14-1 7" />
              </svg>
            </span>

            <b>Pinned messages</b>

            <small>{pinnedMessages.length}</small>

          </div>

          <div className="pinned-messages-list">

            {pinnedMessages.map((p) => (

              <button

                key={p.id}

                className="pinned-message-chip"

                onClick={() => jumpToMessage(p.messageId)}

              >

                <span className="pinned-message-sender">{p.senderName}</span>

                <span className="pinned-message-preview">

                  {p.text || p.fileName || "📎 Attachment"}

                </span>

              </button>

            ))}

          </div>

        </div>

      )}

      {/* MESSAGES */}

      <div className="messages">

        {messages.map((m, index) => {
          const mine = m.uid === user.uid;
          const t = tickFor(m);
          const isPinned = pinnedIds.has(m.id);
          const isSelected = selectedIds.includes(m.id);
          const isStarred = starredIds.has(m.id);

          const currentDate = getDateKey(m.createdAt);
          const previousDate =
            index > 0 ? getDateKey(messages[index - 1].createdAt) : null;
          const showDate = currentDate && currentDate !== previousDate;

          return (
            <React.Fragment key={m.id}>
              {showDate && (
                <div className="message-date-divider">
                  <span>{getDateLabel(m.createdAt)}</span>
                </div>
              )}

              <div
                ref={(el) => {
                  messageRefs.current[m.id] = el;
                }}
                className={[
                  "row",
                  mine ? "mine" : "",
                  isSelected ? "message-selected" : "",
                ].join(" ")}
                style={{ position: "relative" }}
                onMouseEnter={() => setHoveredMessageId(m.id)}
                onMouseLeave={() => setHoveredMessageId((current) => current === m.id ? null : current)}
                onTouchStart={() => startPress(m.id)}
                onTouchEnd={endPress}
                onTouchMove={endPress}
                onContextMenu={(e) => handleContextMenu(e, m.id)}
                onClick={() => handleMessageClick(m.id)}
              >
                {chat.group && !mine && (
                  <Avatar
                    src={m.senderPhoto}
                    name={m.senderName || "Guest"}
                    size={32}
                  />
                )}

                <div
                  className="message-bubble-stack"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: mine ? "flex-end" : "flex-start",
                    width: "fit-content",
                    maxWidth: "min(78%, 520px)",
                    minWidth: 0,
                  }}
                >
                <div
                  className={`${mine ? "msg mine" : "msg"} ${
                    m.stickerUrl && !m.text && !m.fileUrl ? "sticker-only-message" : ""
                  }`}
                  style={
                    m.stickerUrl && !m.text && !m.fileUrl
                      ? {
                          background: "transparent",
                          border: "none",
                          boxShadow: "none",
                          padding: 0,
                        }
                      : undefined
                  }
                >
                  {chat.group && !mine && (
                    <small>{nicks[m.uid] || m.senderName || "Guest"}</small>
                  )}

                  {m.forwarded && (
                    <small className="forwarded-label">➦ Forwarded</small>
                  )}

                  {m.replyTo && (
                    <div
                      className="reply-preview"
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToMessage(m.replyTo.messageId);
                      }}
                    >
                      <b>{m.replyTo.senderName}</b>
                      <span>{renderAppleEmojiText(m.replyTo.text || "Sticker")}</span>
                    </div>
                  )}

                  {m.text && (
                    <div className="message-text">
                      {renderAppleEmojiText(m.text)}
                    </div>
                  )}

                  {m.stickerUrl && (
                    <div className="tether-chat-sticker">
                      <StickerActions
                        message={m}
                        user={user}
                        chat={chat}
                      />
                    </div>
                  )}

                  {m.type === "audio" && m.fileUrl && (
                    <VoiceNotePlayer src={m.fileUrl} duration={m.duration || 0} />
                  )}

                  {m.fileUrl && m.fileType?.startsWith("image/") && (
                    <img src={m.fileUrl} alt={m.fileName} className="media" />
                  )}

                  {m.fileUrl && m.fileType?.startsWith("video/") && (
                    <video src={m.fileUrl} controls className="media" />
                  )}

                  {m.fileUrl &&
                    m.type !== "audio" &&
                    !m.fileType?.startsWith("image/") &&
                    !m.fileType?.startsWith("video/") && (
                      <a href={m.fileUrl} target="_blank" rel="noreferrer">
                        <AppleEmoji emoji="📄" size={17} /> {m.fileName}
                      </a>
                    )}

                  <div className="msg-meta">
                    {isPinned && (
                      <span className="message-pin-icon" title="Pinned" aria-label="Pinned">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
                          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
                          strokeLinejoin="round" aria-hidden="true">
                          <path d="M8 4h8l-1 5 3 3v2H6v-2l3-3-1-5Z" />
                          <path d="m12 14-1 7" />
                        </svg>
                      </span>
                    )}
                    {isStarred && <span title="Starred">⭐</span>}
                    <span>{clock(m.createdAt)}</span>
                    {t && <span className={"tick " + t.cls}>{t.icon}</span>}
                  </div>

                </div>

                  {groupedReactionsFor(m.id).length > 0 && (
                    <div
                      className="message-reactions-below"
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 5,
                        marginTop: 5,
                        maxWidth: "100%",
                        justifyContent: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      {groupedReactionsFor(m.id).map(({ emoji, people }) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionDetailsFor({ messageId: m.id, emoji });
                          }}
                          title={people.map((person) => person.displayName || "Friend").join(", ")}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            border: people.some((person) => person.uid === user.uid)
                              ? "1px solid var(--text, #333)" : "1px solid var(--border, #ddd)",
                            borderRadius: 999, padding: "3px 8px",
                            background: people.some((person) => person.uid === user.uid)
                              ? "var(--hover, rgba(0,0,0,.08))" : "var(--card, #fff)",
                            color: "var(--text, #222)", cursor: "pointer", fontSize: 13,
                          }}
                        >
                          <AppleEmoji emoji={emoji} size={20} /><span>{people.length}</span>
                        </button>
                      ))}
                    </div>
                  )}

                </div>

                {(hoveredMessageId === m.id || reactionPickerFor === m.id) && !selectedIds.length && (
                  <button
                    type="button"
                    aria-label="React to message"
                    title="React"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomizingReactions(false);
                      setReactionPickerFor((current) => current === m.id ? null : m.id);
                    }}
                    className="tether-reaction-thought-button"
                    style={{
                      position: "absolute", top: -3, right: mine ? "auto" : 1,
                      left: mine ? 1 : "auto", zIndex: 20, width: 40, height: 43,
                      padding: 0, border: 0, background: "transparent",
                      cursor: "pointer", display: "grid", placeItems: "start center",
                    }}
                  >
                    <span style={{
                      position: "relative", width: 34, height: 32,
                      display: "grid", placeItems: "center",
                      borderRadius: "50%", border: "1px solid var(--border, #eee4e8)",
                      background: "var(--card, #fff)",
                      boxShadow: "0 3px 10px rgba(0,0,0,.12)",
                      transition: "transform 150ms ease, box-shadow 150ms ease",
                    }}>
                      <AppleEmoji emoji="😊" size={19} />
                    </span>
                    <span aria-hidden="true" style={{
                      position: "absolute", left: 7, bottom: 3, width: 8, height: 8,
                      borderRadius: "50%", border: "1px solid var(--border, #eee4e8)",
                      background: "var(--card, #fff)", boxShadow: "0 2px 5px rgba(0,0,0,.09)",
                    }} />
                    <span aria-hidden="true" style={{
                      position: "absolute", left: 2, bottom: 0, width: 4, height: 4,
                      borderRadius: "50%", border: "1px solid var(--border, #eee4e8)",
                      background: "var(--card, #fff)",
                    }} />
                  </button>
                )}

                {reactionPickerFor === m.id && (
                  <div
                    role="dialog"
                    aria-label="React to message"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", zIndex: 40, top: -54,
                      right: mine ? 8 : "auto", left: mine ? "auto" : 8,
                      display: "flex", flexDirection: "row", flexWrap: "nowrap",
                      alignItems: "center", justifyContent: "flex-start", gap: 5,
                      width: "max-content", maxWidth: "calc(100vw - 28px)",
                      overflowX: "auto", whiteSpace: "nowrap", padding: 7,
                      border: "1px solid var(--border, #ddd)", borderRadius: 18,
                      background: "var(--card, #fff)", color: "var(--text, #222)",
                      boxShadow: "0 8px 25px rgba(0,0,0,.16)",
                    }}
                  >
                    {!customizingReactions ? (
                      <>
                        {quickReactions.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => toggleReaction(m.id, emoji)}
                            title={`React ${emoji}`}
                            style={{ flex: "0 0 auto", width: 32, minWidth: 32, height: 34,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              border: 0, background: "transparent", cursor: "pointer", fontSize: 23, padding: 0 }}>
                            <AppleEmoji emoji={emoji} size={25} />
                          </button>
                        ))}
                        <button type="button" onClick={() => setCustomizingReactions(true)}
                          title="Customize quick reactions"
                          style={{ flex: "0 0 auto", width: 34, height: 34, display: "inline-flex",
                            alignItems: "center", justifyContent: "center", border: "1px solid var(--border, #ddd)",
                            borderRadius: 10, background: "transparent", color: "var(--text, #222)", cursor: "pointer", padding: 0 }}>＋</button>
                        <button type="button" onClick={() => { setReactionPickerFor(null); selectMessage(m.id); }}
                          title="More message actions"
                          style={{ flex: "0 0 auto", width: 34, height: 34, display: "inline-flex",
                            alignItems: "center", justifyContent: "center", border: "1px solid var(--border, #ddd)",
                            borderRadius: 10, background: "transparent", color: "var(--text, #222)", cursor: "pointer", padding: 0 }}>⋯</button>
                      </>
                    ) : (
                      <div style={{ width: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 12 }}>
                          <b>Choose quick reactions</b>
                          <button type="button" onClick={() => setCustomizingReactions(false)}
                            style={{ border: 0, background: "transparent", color: "var(--text, #222)", cursor: "pointer" }}>Done</button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3 }}>
                          {"❤️ 😂 🥹 😍 👍 🎉 😭 🥰 😊 😎 🙌 🔥 👏 🫶 😮 😢 🤔 💯 ✨ 🥳 🙏 💀 🥺 😡 💔 🤝 💕 😇 😴 🤗".split(" ").map((emoji) => {
                            const active = quickReactions.includes(emoji);
                            return (
                              <button key={emoji} type="button"
                                onClick={() => {
                                  const next = active
                                    ? quickReactions.filter((item) => item !== emoji)
                                    : quickReactions.length < 6 ? [...quickReactions, emoji] : quickReactions;
                                  if (next.length !== quickReactions.length || active) saveQuickReactions(next);
                                }}
                                title={active ? "Remove from quick reactions" : "Add to quick reactions"}
                                style={{
                                  border: active ? "1px solid var(--text, #333)" : "1px solid transparent",
                                  borderRadius: 8, background: active ? "var(--hover, rgba(0,0,0,.08))" : "transparent",
                                  cursor: "pointer", fontSize: 20, padding: 3,
                                }}><AppleEmoji emoji={emoji} size={24} /></button>
                            );
                          })}
                        </div>
                        <small style={{ display: "block", marginTop: 5, opacity: .7 }}>Select up to six. Your choices are saved to your account.</small>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </React.Fragment>
          );
        })}

        <div ref={endRef} />

      </div>

      {isTyping && <small className="typing">typing…</small>}

      {err && <p className="error">{err}</p>}

      {noAccess ? (

        <div className="blocked-note">

          <span>You can't see this chat anymore. You may have left the group.</span>

        </div>

      ) : iBlocked ? (

        <div className="blocked-note">

          <span>You blocked this person.</span>

          <button onClick={unblock}>Unblock</button>

        </div>

      ) : (

        <div className="send">

          {replyTo && (

            <div className="reply-compose">

              <div>

                <b>Replying to {replyTo.senderName || "message"}</b>

                <small>{renderAppleEmojiText(replyTo.text) || replyTo.fileName || "Attachment"}</small>

              </div>

              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" title="Cancel reply">✕</button>

            </div>

          )}

          <input

            type="file"

            ref={fileRef}

            onChange={sendFile}

            style={{ display: "none" }}

          />

          <button

            type="button"

            onClick={() => fileRef.current?.click()}

            disabled={uploading}

            title="Attach file"

            aria-label="Attach file"

          >

            {uploading ? (
              <span className="upload-spinner" aria-hidden="true" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="21"
                height="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
              </svg>
            )}

          </button>

          <div className="message-input-wrap" style={{ position: "relative", flex: 1, minWidth: 0 }}>

            {showStickerPicker && (
              <StickerPicker
                user={user}
                profile={profile}
                onSendSticker={sendSticker}
                onClose={() => setShowStickerPicker(false)}
              />
            )}

            {showEmojiPicker && (
              <div
                className="tether-emoji-picker"
                role="dialog"
                aria-label="Choose an emoji"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 12px)",
                  left: 0,
                  zIndex: 1000,
                  width: "min(350px, 90vw)",
                  borderRadius: "16px",
                  overflow: "hidden",
                  boxShadow: "0 10px 35px rgba(35, 20, 30, .18)",
                }}
              >
                <EmojiPicker
                  onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                  emojiStyle="apple"
                  width="100%"
                  height={360}
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled={false}
                />
              </div>
            )}

            <input

              ref={messageInputRef}

              placeholder="Type a message"

              value={text}

              onChange={(e) => onType(e.target.value)}

              onKeyDown={(e) => {

                if (e.key === "Enter" && !e.shiftKey) {

                  e.preventDefault();

                  send();

                  setShowEmojiPicker(false);

                }

              }}

            />

          </div>

          <button

            type="button"

            className="emoji-toggle"

            onClick={() => {
              setShowStickerPicker(false);
              setShowEmojiPicker((current) => !current);
            }}

            title="Choose emoji"

            aria-label="Choose emoji"

            aria-expanded={showEmojiPicker}

          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "block", flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M8.5 14.2c.8 1.15 2.02 1.8 3.5 1.8s2.7-.65 3.5-1.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="9" cy="9.5" r="1" fill="currentColor" />
              <circle cx="15" cy="9.5" r="1" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="sticker-toggle"
            onClick={() => {
              setShowEmojiPicker(false);
              setShowStickerPicker((current) => !current);
            }}
            title="Choose stickers"
            aria-label="Choose stickers"
            aria-expanded={showStickerPicker}
          >
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 3.75h14A1.25 1.25 0 0 1 20.25 5v9.5L14 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z" />
              <path d="M14 20v-5.5a.5.5 0 0 1 .5-.5H20M8 8h8M8 11.5h5" />
            </svg>
          </button>

          <button type="button" onClick={() => { send(); setShowEmojiPicker(false); }}>Send</button>

          <VoiceNoteComposer onSend={sendVoiceNote} disabled={uploading || !!text.trim()} />

        </div>

      )}

      {/* WHO REACTED */}
      {reactionDetailsFor && (
        <div className="overlay" onClick={() => setReactionDetailsFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, width: "min(360px, 92vw)" }}>
            <button className="close" onClick={() => setReactionDetailsFor(null)}>✕</button>
            <h3>{reactionDetailsFor.emoji} Reactions</h3>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {reactionsFor(reactionDetailsFor.messageId)
                .filter((reaction) => reaction.emoji === reactionDetailsFor.emoji)
                .map((reaction) => (
                  <div key={reaction.uid} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar src={reaction.photoURL} name={reaction.displayName || "Friend"} size={34} />
                    <span>{reaction.uid === user.uid ? "You" : reaction.displayName || "Friend"}</span>
                    <span style={{ marginLeft: "auto" }}><AppleEmoji emoji={reaction.emoji} size={22} /></span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* MESSAGE INFO */}

      {infoMessage && (

        <div className="overlay" onClick={() => setInfoMessage(null)}>

          <div className="sheet message-info-sheet" onClick={(e) => e.stopPropagation()}>

            <button className="close" onClick={() => setInfoMessage(null)}>

              ✕

            </button>

            <h3>Message info</h3>

            <p>{infoMessage.text || infoMessage.fileName || "Attachment"}</p>

            <div className="message-info-row">

              <b>Sent by</b>

              <span>

                {infoMessage.uid === user.uid

                  ? "You"

                  : infoMessage.senderName || "Friend"}

              </span>

            </div>

            <div className="message-info-row">

              <b>Sent at</b>

              <span>

                {infoMessage.createdAt?.toDate

                  ? infoMessage.createdAt.toDate().toLocaleString()

                  : "Not available"}

              </span>

            </div>

            {!chat.group && infoMessage.uid === user.uid && (

              <>

                <div className="message-info-row">

                  <b>Delivery</b>

                  <span>

                    {ms(chatDoc?.delivered?.[chat.otherUid]) >=

                    ms(infoMessage.createdAt)

                      ? "Delivered"

                      : "Not confirmed"}

                  </span>

                </div>

                <div className="message-info-row">

                  <b>Read</b>

                  <span>

                    {ms(chatDoc?.lastRead?.[chat.otherUid]) >=

                    ms(infoMessage.createdAt)

                      ? "Read"

                      : "Not read yet"}

                  </span>

                </div>

              </>

            )}

          </div>

        </div>

      )}

      {/* FORWARD DESTINATION PICKER */}

      {forwardOpen && (

        <div className="overlay" onClick={() => setForwardOpen(false)}>

          <div className="sheet forward-sheet" onClick={(e) => e.stopPropagation()}>

            <button className="close" onClick={() => setForwardOpen(false)}>

              ✕

            </button>

            <h3>Forward to</h3>

            {forwardLoading ? (

              <p>Loading conversations…</p>

            ) : forwardTargets.length === 0 ? (

              <p>No conversations available.</p>

            ) : (

              <div className="forward-list">

                {forwardTargets.map((target) => (

                  <button

                    key={target.id}

                    disabled={forwarding}

                    onClick={() => forwardTo(target)}

                  >

                    <span>{target.group ? "👥" : "💬"}</span>

                    <b>{target.name}</b>

                    <small>{target.group ? "Group" : "Private chat"}</small>

                  </button>

                ))}

              </div>

            )}

            {forwarding && <p>Forwarding…</p>}

          </div>

        </div>

      )}

      {/* WHITEBOARD */}

      {showWhiteboard && (

        <div className="whiteboard-overlay">

          <div className="whiteboard-window">

            <div className="whiteboard-window-head">

              <div>

                <b>Shared Whiteboard</b>

                <small>{title}</small>

              </div>

              <button

                className="whiteboard-close"

                onClick={() => setShowWhiteboard(false)}

                aria-label="Close whiteboard"

              >

                ✕

              </button>

            </div>

            <Whiteboard

              chat={chat}

              user={user}

              onClose={() => setShowWhiteboard(false)}

            />

          </div>

        </div>

      )}

      {/* VIDEO CALL */}

      {showVideoCall && (

        <div className="whiteboard-overlay">

          <div className="whiteboard-window video-call-window">

            <div className="whiteboard-window-head">

              <div>

                <b>Video call</b>

                <small>{title}</small>

              </div>

              <button

                className="whiteboard-close"

                onClick={() => setShowVideoCall(false)}

                aria-label="Close video call"

              >

                ✕

              </button>

            </div>

            <VideoCall

              user={user}

              chat={chat}

              displayName={profile?.name || user.displayName || "Friend"}

            />

          </div>

        </div>

      )}

    </div>

  );

}
