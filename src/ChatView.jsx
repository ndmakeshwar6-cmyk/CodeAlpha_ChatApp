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

export default function ChatView({

  user,

  profile,

  chat,

  nicks,

  onBack,

  onProfile,

  onGroupInfo,

}) {

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

      selectMessage(id);

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

      {/* WHATSAPP-STYLE SELECTION TOOLBAR */}

      {selectedIds.length > 0 ? (

        <div className="message-selection-toolbar">

          <button onClick={clearSelection} title="Close selection">

            ←

          </button>

          <b>{selectedIds.length}</b>

          <button onClick={replySelected} title="Reply">

            ↶

          </button>

          <button

            onClick={() => {

              if (selectedMessage) toggleStar(selectedMessage);

            }}

            title="Star message"

          >

            ⭐

          </button>

          <button onClick={showInfo} title="Message info">

            ⓘ

          </button>

          <button onClick={deleteSelected} title="Delete">

            🗑

          </button>

          <button onClick={openForward} title="Forward">

            ➦

          </button>

          <div className="message-more-wrap">

            <button

              onClick={() => setShowMore((v) => !v)}

              title="More options"

            >

              ⋮

            </button>

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

            <span>📌</span>

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
                      <span>{m.replyTo.text || "Sticker"}</span>
                    </div>
                  )}

                  {m.text && <div>{m.text}</div>}

                  {m.stickerUrl && (
                    <div className="tether-chat-sticker">
                      <StickerActions
                        message={m}
                        user={user}
                        chat={chat}
                      />
                    </div>
                  )}

                  {m.fileUrl && m.fileType?.startsWith("image/") && (
                    <img src={m.fileUrl} alt={m.fileName} className="media" />
                  )}

                  {m.fileUrl && m.fileType?.startsWith("video/") && (
                    <video src={m.fileUrl} controls className="media" />
                  )}

                  {m.fileUrl &&
                    !m.fileType?.startsWith("image/") &&
                    !m.fileType?.startsWith("video/") && (
                      <a href={m.fileUrl} target="_blank" rel="noreferrer">
                        📄 {m.fileName}
                      </a>
                    )}

                  <div className="msg-meta">
                    {isPinned && <span title="Pinned">📌</span>}
                    {isStarred && <span title="Starred">⭐</span>}
                    <span>{clock(m.createdAt)}</span>
                    {t && <span className={"tick " + t.cls}>{t.icon}</span>}
                  </div>
                </div>
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

                <small>{replyTo.text || replyTo.fileName || "Attachment"}</small>

              </div>

              <button type="button" onClick={() => setReplyTo(null)}>✕</button>

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

          >

            {uploading ? "⏳" : "📎"}

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

                  width: "min(320px, 85vw)",

                  maxHeight: "260px",

                  overflowY: "auto",

                  padding: "12px",

                  display: "grid",

                  gridTemplateColumns: "repeat(8, minmax(0, 1fr))",

                  gap: "5px",

                  background: "var(--card, #fff)",

                  color: "var(--text, #29232b)",

                  border: "1px solid var(--border, #eadde4)",

                  borderRadius: "16px",

                  boxShadow: "0 10px 35px rgba(35, 20, 30, .18)",

                }}

              >

                {"😀 😃 😄 😁 😆 😅 😂 🤣 🥹 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😔 🥺 😢😭 😤 😠 😡 🤯 🥳 😎 🤓 🧐 🤩 🥲 😴 🤤 🤧 🤒 🤕 🤢 🤮 🫠 🫶 ❤️ 🩷 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 💕 💞 💓 💗 💖 💘 💝 💟 👍 👎 👌 ✌️ 🤞 🫰 🤟 🤘 👏 🙌 🙏 💪 🫂 👋 🤝 🌸 🌷 🌹 🌻 🌼 💐 🍀 ⭐ 🌟 ✨ ⚡ 🔥 🎉 🎊 🎂 🎁 🧸 🐻 🐰 🐱 🐶 🦋 🍓 🍒 🍑 🍉 🍕 🍟 ☕ 🧋".split(" ").map((emoji, index) => (

                  <button

                    key={`${emoji}-${index}`}

                    type="button"

                    onClick={() => insertEmoji(emoji)}

                    aria-label={`Insert ${emoji}`}

                    style={{

                      border: 0,

                      background: "transparent",

                      borderRadius: "8px",

                      padding: "5px 2px",

                      fontSize: "22px",

                      cursor: "pointer",

                      lineHeight: 1.3,

                    }}

                  >

                    {emoji}

                  </button>

                ))}

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

            😊

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
