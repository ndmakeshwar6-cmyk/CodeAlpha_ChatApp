import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection, query, where, limit, getDocs, getDoc, doc,
  setDoc, updateDoc, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";

const pairId = (a, b) => [a, b].sort().join("_");

export default function Contacts({ user, nicks, onOpen, onProfile }) {
  const [links, setLinks] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [people, setPeople] = useState({});
  const [mySearch, setMySearch] = useState("");
  const [find, setFind] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [composeFor, setComposeFor] = useState(null);
  const [intro, setIntro] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, "contactLinks"), where("members", "array-contains", user.uid)),
      (snap) => setLinks(snap.docs.map((d) => d.data().members.find((m) => m !== user.uid)))
    );
    const u2 = onSnapshot(
      query(collection(db, "contactRequests"), where("to", "==", user.uid), where("status", "==", "pending")),
      (snap) => setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const u3 = onSnapshot(
      query(collection(db, "contactRequests"), where("from", "==", user.uid)),
      (snap) => setOutgoing(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); u3(); };
  }, [user.uid]);

  useEffect(() => {
    const ids = [...links, ...incoming.map((r) => r.from)];
    ids.forEach((id) => {
      if (!people[id]) {
        getDoc(doc(db, "users", id)).then((s) => {
          if (s.exists()) setPeople((p) => ({ ...p, [id]: s.data() }));
        });
      }
    });
  }, [links, incoming]);

  const runSearch = async () => {
    const t = find.trim().toLowerCase().replace(/^@/, "");
    if (t.length < 2) {
      setMsg("Type at least 2 letters of a username");
      setResults([]);
      return;
    }
    setMsg("");
    setSearching(true);
    try {
      const q = query(
        collection(db, "users"),
        where("usernameLower", ">=", t),
        where("usernameLower", "<=", t + "\uf8ff"),
        limit(10)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((p) => p.uid !== user.uid && p.profileDone);
      setResults(list);
      if (list.length === 0) setMsg("No one found with that username");
    } catch (e) {
      setMsg(e.message);
    }
    setSearching(false);
  };

  const sendRequest = async (toUid) => {
    if (toUid === user.uid) return;
    const ref = doc(db, "contactRequests", user.uid + "_" + toUid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      setMsg("You already sent a request to this person");
      setComposeFor(null);
      return;
    }
    await setDoc(ref, {
      from: user.uid,
      to: toUid,
      message: intro.trim().slice(0, 120),
      status: "pending",
      createdAt: serverTimestamp(),
    });
    setComposeFor(null);
    setIntro("");
  };

  const accept = async (r) => {
    await setDoc(doc(db, "contactLinks", pairId(r.from, r.to)), {
      members: [r.from, r.to],
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "contactRequests", r.id), { status: "accepted" });
  };

  const decline = async (r) => {
    await updateDoc(doc(db, "contactRequests", r.id), { status: "declined" });
  };

  const q = mySearch.trim().toLowerCase();
  const myContacts = links.filter((uid) => {
    const p = people[uid];
    if (!q) return true;
    const label = ((nicks[uid] || "") + " " + (p?.name || "") + " " + (p?.username || "")).toLowerCase();
    return label.includes(q);
  });

  const statusOf = (p) => {
    if (links.includes(p.uid)) return { kind: "contact" };
    const inc = incoming.find((r) => r.from === p.uid);
    if (inc) return { kind: "incoming", req: inc };
    const out = outgoing.find((r) => r.to === p.uid);
    if (out) return { kind: out.status };
    return { kind: "none" };
  };

  return (
    <div className="list">
      {incoming.length > 0 && (
        <>
          <h4 className="sec">Requests ({incoming.length})</h4>
          {incoming.map((r) => {
            const p = people[r.from];
            return (
              <div className="req" key={r.id}>
                <span onClick={() => onProfile(r.from)} style={{ cursor: "pointer" }}>
                  <Avatar src={p?.photoURL} name={p?.name || "?"} size={46} />
                </span>
                <div className="item-text">
                  <b>{p?.name || "..."}</b>
                  <small>@{p?.username}</small>
                  {r.message && <em>“{r.message}”</em>}
                </div>
                <div className="req-btns">
                  <button onClick={() => accept(r)}>Accept</button>
                  <button className="secondary" onClick={() => decline(r)}>Decline</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <h4 className="sec">My contacts</h4>
      <input placeholder="🔍 Search my contacts" value={mySearch} onChange={(e) => setMySearch(e.target.value)} />
      {myContacts.map((uid) => {
        const p = people[uid];
        const shown = nicks[uid] || p?.name || "...";
        return (
          <div className="item" key={uid} onClick={() => onOpen(uid)}>
            <span onClick={(e) => { e.stopPropagation(); onProfile(uid); }}>
              <Avatar src={p?.photoURL} name={shown} size={46} />
            </span>
            <div className="item-text">
              <b>{shown}</b>
              <small>@{p?.username}</small>
            </div>
          </div>
        );
      })}
      {links.length === 0 && (
        <p className="hint">No contacts yet. Find people below by their @username.</p>
      )}

      <h4 className="sec">Find people</h4>
      <div className="row-inline">
        <input placeholder="@username" value={find} onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()} />
        <button onClick={runSearch} disabled={searching}>{searching ? "..." : "Search"}</button>
      </div>
      {msg && <p className="hint">{msg}</p>}

      {results.map((p) => {
        const st = statusOf(p);
        return (
          <div key={p.uid}>
            <div className="item" style={{ cursor: "default" }}>
              <Avatar src={p.photoURL} name={p.name} size={46} />
              <div className="item-text">
                <b>{p.name}</b>
                <small>@{p.username}</small>
              </div>
              {st.kind === "none" && (
                <button className="tag-btn" onClick={() => { setComposeFor(p.uid); setIntro(""); }}>Add</button>
              )}
              {st.kind === "pending" && <span className="tag">Request sent</span>}
              {st.kind === "declined" && <span className="tag">Declined</span>}
              {st.kind === "incoming" && (
                <button className="tag-btn" onClick={() => accept(st.req)}>Accept</button>
              )}
              {(st.kind === "contact" || st.kind === "accepted") && (
                <button className="tag-btn" onClick={() => onOpen(p.uid)}>Message</button>
              )}
            </div>
            {composeFor === p.uid && (
              <div className="compose">
                <input placeholder="Say hi (optional)" value={intro} maxLength={120}
                  onChange={(e) => setIntro(e.target.value)} />
                <div className="row-inline">
                  <button onClick={() => sendRequest(p.uid)}>Send request</button>
                  <button className="secondary" onClick={() => setComposeFor(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}