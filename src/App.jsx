import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, query, where,
} from "firebase/firestore";
import Whiteboard from "./Whiteboard";
import VideoCall from "./VideoCall";
import ProfileSetup from "./ProfileSetup";
import Avatar from "./Avatar";
import Home from "./Home";
import ChatView from "./ChatView";
import Contacts from "./Contacts";
import ProfileView from "./ProfileView";
import AuthScreen from "./AuthScreen";
import Receipts from "./Receipts";
import "./App.css";

const chatIdFor = (a, b) => [a, b].sort().join("_");

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [tab, setTab] = useState("chats");
  const [openChat, setOpenChat] = useState(null);
  const [viewUid, setViewUid] = useState(null);
  const [nicks, setNicks] = useState({});
  const [reqCount, setReqCount] = useState(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setProfile(undefined);
        setOpenChat(null);
        setAuthReady(true);
      }),
    []
  );

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) =>
      setProfile(s.exists() ? s.data() : null)
    );
  }, [user]);

  const ready = !!profile?.profileDone;

  useEffect(() => {
    if (!user || !ready) return;
    return onSnapshot(collection(db, "users", user.uid, "nicknames"), (snap) => {
      const m = {};
      snap.docs.forEach((d) => (m[d.id] = d.data().name));
      setNicks(m);
    });
  }, [user, ready]);

  useEffect(() => {
    if (!user || !ready) return;
    const q = query(
      collection(db, "contactRequests"),
      where("to", "==", user.uid),
      where("status", "==", "pending")
    );
    return onSnapshot(q, (s) => setReqCount(s.size));
  }, [user, ready]);

  const saveNick = async (uid, name) => {
    const ref = doc(db, "users", user.uid, "nicknames", uid);
    if (name) await setDoc(ref, { name });
    else await deleteDoc(ref);
  };

  const openPerson = (uid) => {
    setOpenChat({ id: chatIdFor(user.uid, uid), otherUid: uid, group: false });
    setTab("chats");
  };

  if (!authReady) return <div className="card">Loading...</div>;

  if (!user) return <AuthScreen />;

  if (profile === undefined) return <div className="card">Loading...</div>;

  if (!ready) {
    return (
      <div className="card">
        <ProfileSetup
          key={profile?.username || "new"}
          user={user}
          profile={profile}
          onSaved={setProfile}
        />
      </div>
    );
  }

  const tabBtn = (id, label) => (
    <button className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div className="card">
      <Receipts user={user} />

      <div className="top">
        <div className="who">
          <Avatar src={profile.photoURL} name={profile.name} size={38} />
          <div>
            <h2>{profile.name}</h2>
            {profile.username && <small className="handle">@{profile.username}</small>}
          </div>
        </div>
        <button onClick={() => signOut(auth)}>Log out</button>
      </div>

      <div className="tabs">
        {tabBtn("chats", "💬")}
        {tabBtn("people", reqCount > 0 ? `👥 ${reqCount}` : "👥")}
        {tabBtn("board", "🎨")}
        {tabBtn("video", "📹")}
        {tabBtn("me", "👤")}
      </div>

      {tab === "chats" &&
        (openChat ? (
          <ChatView
            key={openChat.id}
            user={user}
            profile={profile}
            chat={openChat}
            nicks={nicks}
            onBack={() => setOpenChat(null)}
            onProfile={setViewUid}
          />
        ) : (
          <Home
            user={user}
            profile={profile}
            nicks={nicks}
            onOpen={setOpenChat}
            onProfile={setViewUid}
            onFindPeople={() => setTab("people")}
          />
        ))}

      {tab === "people" && (
        <Contacts user={user} nicks={nicks} onOpen={openPerson} onProfile={setViewUid} />
      )}

      {tab === "board" && <Whiteboard />}

      {tab === "me" && (
        <ProfileSetup
          user={user}
          profile={profile}
          onSaved={() => setTab("chats")}
          onCancel={() => setTab("chats")}
        />
      )}

      <div style={{ display: tab === "video" ? "block" : "none" }}>
        <VideoCall user={user} />
      </div>

      {viewUid && (
        <ProfileView
          uid={viewUid}
          myUid={user.uid}
          nick={nicks[viewUid]}
          onSaveNick={saveNick}
          onClose={() => setViewUid(null)}
        />
      )}
    </div>
  );
}