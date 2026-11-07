import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, addDoc, getDocs,
  onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function Tile({ stream, muted, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className="tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <small>{label}</small>
    </div>
  );
}

export default function VideoCall({ user }) {
  const myId = user.uid;
  const [joined, setJoined] = useState(false);
  const [localView, setLocalView] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [names, setNames] = useState({});
  const [sharing, setSharing] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [note, setNote] = useState("");

  const local = useRef(null);
  const screen = useRef(null);
  const peers = useRef({});
  const streams = useRef({});
  const unsubs = useRef([]);

  useEffect(() => () => { if (local.current) leave(); }, []);

  const getMedia = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        setNote("Camera not available - joined with audio only");
        return s;
      } catch {
        setNote("No camera or mic - you can watch only");
        return new MediaStream();
      }
    }
  };

  const sendSignal = (to, type, payload) =>
    addDoc(collection(db, "callSignals"), {
      from: myId, to, type, payload: JSON.stringify(payload), createdAt: serverTimestamp(),
    });

  const attachLocal = (id) => {
    const p = peers.current[id];
    p.pc.getTransceivers().forEach((t) => {
      const kind = t.receiver.track.kind;
      const track = local.current.getTracks().find((x) => x.kind === kind);
      t.direction = "sendrecv";
      if (track) t.sender.replaceTrack(track);
      if (kind === "video") {
        p.videoSender = t.sender;
        if (screen.current) t.sender.replaceTrack(screen.current.getVideoTracks()[0]);
      }
    });
  };

  const getPeer = (id) => {
    if (peers.current[id]) return peers.current[id];
    const pc = new RTCPeerConnection(ICE);
    peers.current[id] = { pc, videoSender: null, pending: [] };
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(id, "candidate", e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      const s = streams.current[id] || (streams.current[id] = new MediaStream());
      s.addTrack(e.track);
      setRemotes((r) => ({ ...r, [id]: s }));
    };
    return peers.current[id];
  };

  const closePeer = (id) => {
    const p = peers.current[id];
    if (p) { p.pc.close(); delete peers.current[id]; }
    delete streams.current[id];
    setRemotes((r) => { const n = { ...r }; delete n[id]; return n; });
  };

  const flush = async (p) => {
    for (const c of p.pending) await p.pc.addIceCandidate(c);
    p.pending = [];
  };

  const callPeer = async (id) => {
    const p = getPeer(id);
    p.pc.addTransceiver("audio", { direction: "sendrecv" });
    p.pc.addTransceiver("video", { direction: "sendrecv" });
    attachLocal(id);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    sendSignal(id, "offer", { type: offer.type, sdp: offer.sdp });
  };

  const handleSignal = async (s) => {
    const data = JSON.parse(s.payload);
    if (s.type === "offer" && peers.current[s.from]?.pc.remoteDescription) {
      closePeer(s.from);
    }
    const p = getPeer(s.from);
    if (s.type === "offer") {
      await p.pc.setRemoteDescription(data);
      attachLocal(s.from);
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      sendSignal(s.from, "answer", { type: answer.type, sdp: answer.sdp });
      await flush(p);
    } else if (s.type === "answer") {
      await p.pc.setRemoteDescription(data);
      await flush(p);
    } else if (s.type === "candidate") {
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(data);
      else p.pending.push(data);
    }
  };

  const join = async () => {
    setNote("");
    local.current = await getMedia();
    setLocalView(local.current);
    setMicOn(true);
    setCamOn(true);

    const mine = query(collection(db, "callSignals"), where("to", "==", myId));
    const old = await getDocs(mine);
    await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
    unsubs.current.push(
      onSnapshot(mine, (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type !== "added") return;
          const s = c.doc.data();
          deleteDoc(c.doc.ref);
          handleSignal(s);
        });
      })
    );

    const existing = await getDocs(collection(db, "callParticipants"));
    await setDoc(doc(db, "callParticipants", myId), {
    email: user.displayName || "Friend", joinedAt: serverTimestamp(),
    });
    unsubs.current.push(
      onSnapshot(collection(db, "callParticipants"), (snap) => {
        const n = {};
        snap.docs.forEach((d) => (n[d.id] = d.data().email));
        setNames(n);
        snap.docChanges().forEach((c) => {
          if (c.type === "removed") closePeer(c.doc.id);
        });
      })
    );
    setJoined(true);
    for (const d of existing.docs) {
      if (d.id !== myId) callPeer(d.id);
    }
  };

  const leave = async () => {
    unsubs.current.forEach((u) => u());
    unsubs.current = [];
    Object.keys(peers.current).forEach((id) => closePeer(id));
    local.current?.getTracks().forEach((t) => t.stop());
    screen.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    screen.current = null;
    streams.current = {};
    setJoined(false);
    setLocalView(null);
    setRemotes({});
    setSharing(false);
    await deleteDoc(doc(db, "callParticipants", myId));
  };

  const toggle = (kind) => {
    local.current.getTracks()
      .filter((t) => t.kind === kind)
      .forEach((t) => (t.enabled = !t.enabled));
    if (kind === "audio") setMicOn((v) => !v);
    else setCamOn((v) => !v);
  };

  const stopShare = () => {
    if (!screen.current) return;
    screen.current.getTracks().forEach((t) => t.stop());
    screen.current = null;
    const cam = local.current?.getVideoTracks()[0] || null;
    Object.values(peers.current).forEach((p) => p.videoSender?.replaceTrack(cam));
    setLocalView(local.current);
    setSharing(false);
  };

  const startShare = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screen.current = s;
      const track = s.getVideoTracks()[0];
      Object.values(peers.current).forEach((p) => p.videoSender?.replaceTrack(track));
      setLocalView(s);
      setSharing(true);
      track.onended = stopShare;
    } catch {
      /* cancelled */
    }
  };

  const resetRoom = async () => {
    const [a, b] = await Promise.all([
      getDocs(collection(db, "callParticipants")),
      getDocs(collection(db, "callSignals")),
    ]);
    await Promise.all([...a.docs, ...b.docs].map((d) => deleteDoc(d.ref)));
    setNote("Room reset");
  };

  if (!joined) {
    return (
      <div className="call">
        <p>Join the call. Open the app in another window to add more people.</p>
        {note && <p className="error">{note}</p>}
        <button onClick={join}>📹 Join call</button>
        <button className="secondary" onClick={resetRoom}>Reset room</button>
      </div>
    );
  }

  return (
    <div className="call">
      <div className="grid">
        <Tile stream={localView} muted label={sharing ? "You (screen)" : "You"} />
        {Object.entries(remotes).map(([id, s]) => (
          <Tile key={id} stream={s} label={names[id] || "Friend"} />
        ))}
      </div>
      {note && <p className="error">{note}</p>}
      <div className="tools">
        <button onClick={() => toggle("audio")}>{micOn ? "🎤 Mute" : "🔇 Unmute"}</button>
        <button onClick={() => toggle("video")}>{camOn ? "📷 Cam off" : "📷 Cam on"}</button>
        <button onClick={sharing ? stopShare : startShare}>
          {sharing ? "Stop share" : "🖥️ Share screen"}
        </button>
        <button onClick={leave}>Leave</button>
      </div>
    </div>
  );
}