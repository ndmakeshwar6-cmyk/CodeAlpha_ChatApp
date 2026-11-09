
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";

import ProfileSetup from "./ProfileSetup";
import Avatar from "./Avatar";
import Home from "./Home";
import ChatView from "./ChatView";
import Contacts from "./Contacts";
import ProfileView from "./ProfileView";
import AuthScreen from "./AuthScreen";
import Receipts from "./Receipts";
import GroupInvites from "./GroupInvites";
import NewGroup from "./NewGroup";
import GroupInfo from "./GroupInfo";
import Settings from "./Settings";
import { applyAppearance } from "./themeEngine";
import "./App.css";

const chatIdFor = (a, b) => [a, b].sort().join("_");

// Minimal monochrome line icons
function TabIcon({ name }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    chats: (
      <>
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    board: (
      <>
        <path d="M12 3v3" />
        <path d="M5.5 5.5 7.6 7.6" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="M16.4 7.6l2.1-2.1" />
        <path d="M7 16.5 5 19" />
        <path d="M17 16.5 19 19" />
        <path d="M12 9v12" />
        <path d="M8 21h8" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9z" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [prefs, setPrefs] = useState({});
  const [tab, setTab] = useState("chats");
  const [openChat, setOpenChat] = useState(null);
  const [viewUid, setViewUid] = useState(null);
  const [nicks, setNicks] = useState({});
  const [reqCount, setReqCount] = useState(0);
  const [newGroup, setNewGroup] = useState(false);
  const [infoGid, setInfoGid] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setProfile(undefined);
      setOpenChat(null);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setPrefs({});
      applyAppearance({});
      return;
    }

    return onSnapshot(
      doc(db, "users", user.uid, "prefs", "appearance"),
      (s) => {
        const p = s.exists() ? s.data() : {};
        setPrefs(p);
        applyAppearance(p);
      }
    );
  }, [user, authReady]);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(doc(db, "users", user.uid), (s) =>
      setProfile(s.exists() ? s.data() : null)
    );
  }, [user]);

  const ready = !!profile?.profileDone;

  useEffect(() => {
    if (!user || !ready) return;

    return onSnapshot(
      collection(db, "users", user.uid, "nicknames"),
      (snap) => {
        const m = {};
        snap.docs.forEach((d) => (m[d.id] = d.data().name));
        setNicks(m);
      }
    );
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
    setOpenChat({
      id: chatIdFor(user.uid, uid),
      otherUid: uid,
      group: false,
    });
    setTab("chats");
  };

  if (!authReady) return <div className="card">Loading...</div>;

  if (!user) return <AuthScreen />;

  if (profile === undefined) {
    return <div className="card">Loading...</div>;
  }

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

  const tabBtn = (id, label, icon, count = 0) => (
    <button
      key={id}
      className={tab === id ? "tab active" : "tab"}
      onClick={() => setTab(id)}
      aria-label={label}
      aria-current={tab === id ? "page" : undefined}
      title={label}
    >
      <TabIcon name={icon} />
      {count > 0 && <span className="tab-count">{count}</span>}
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
            {profile.username && (
              <small className="handle">@{profile.username}</small>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabBtn("chats", "Chats", "chats")}
        {tabBtn("people", "Contacts", "people", reqCount)}
        {tabBtn("board", "Whiteboard", "board")}
        {tabBtn("settings", "Settings", "settings")}
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
            onGroupInfo={setInfoGid}
          />
        ) : (
          <div className="home-content-scroll">
            <GroupInvites
              user={user}
              onJoined={(gid) =>
                setOpenChat({ id: gid, group: true })
              }
            />

            <Home
              user={user}
              profile={profile}
              nicks={nicks}
              onOpen={setOpenChat}
              onProfile={setViewUid}
              onFindPeople={() => setTab("people")}
              onNewGroup={() => setNewGroup(true)}
            />
          </div>
        ))}

      {tab === "people" && (
        <Contacts
          user={user}
          nicks={nicks}
          onOpen={openPerson}
          onProfile={setViewUid}
        />
      )}

      {tab === "board" && (
        <div className="board-empty">
          <div className="board-empty-icon">
            <TabIcon name="board" />
          </div>
          <h3>Shared Whiteboard</h3>
          <p>
            Open a private or group chat to start drawing together.
            Each conversation has its own whiteboard.
          </p>
          <button onClick={() => setTab("chats")}>
            Go to Chats
          </button>
        </div>
      )}

      {tab === "settings" && (
        <Settings user={user} profile={profile} prefs={prefs} />
      )}

      {newGroup && (
        <NewGroup
          user={user}
          profile={profile}
          onClose={() => setNewGroup(false)}
          onCreated={(gid) => {
            setNewGroup(false);
            setOpenChat(null);
            setTab("chats");
          }}
        />
      )}

      {infoGid && (
        <GroupInfo
          user={user}
          profile={profile}
          gid={infoGid}
          nicks={nicks}
          onClose={() => setInfoGid(null)}
          onLeft={() => {
            setInfoGid(null);
            setOpenChat(null);
          }}
          onProfile={setViewUid}
        />
      )}

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
