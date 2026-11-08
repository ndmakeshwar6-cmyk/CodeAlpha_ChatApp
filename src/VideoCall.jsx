import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

const ICE = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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

export default function VideoCall({ user, chat, displayName }) {
  const myId = user.uid;

  // Every conversation gets its own participant and signal collections.
  const roomPath = chat.group
    ? ["groups", chat.id]
    : ["chats", chat.id];

  const participantsPath = [...roomPath, "callParticipants"];
  const signalsPath = [...roomPath, "callSignals"];

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
  const joinedRef = useRef(false);

  const participantRef = () =>
    doc(db, ...participantsPath, myId);

  const sendSignal = async (to, type, payload) => {
    await addDoc(collection(db, ...signalsPath), {
      from: myId,
      to,
      type,
      payload: JSON.stringify(payload),
      createdAt: serverTimestamp(),
    });
  };

  const getMedia = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        setNote("Camera not available - joined with audio only");
        return s;
      } catch {
        setNote("No camera or mic - you can watch only");
        return new MediaStream();
      }
    }
  };

  const attachLocal = (id) => {
    const p = peers.current[id];

    if (!p || !local.current) return;

    p.pc.getTransceivers().forEach((t) => {
      const kind = t.receiver.track.kind;
      const track = local.current.getTracks().find((x) => x.kind === kind);

      t.direction = "sendrecv";

      if (track) {
        t.sender.replaceTrack(track).catch(() => {});
      }

      if (kind === "video") {
        p.videoSender = t.sender;

        if (screen.current) {
          const screenTrack = screen.current.getVideoTracks()[0];
          if (screenTrack) {
            t.sender.replaceTrack(screenTrack).catch(() => {});
          }
        }
      }
    });
  };

  const getPeer = (id) => {
    if (peers.current[id]) return peers.current[id];

    const pc = new RTCPeerConnection(ICE);

    peers.current[id] = {
      pc,
      videoSender: null,
      pending: [],
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(id, "candidate", e.candidate.toJSON()).catch(() => {});
      }
    };

    pc.ontrack = (e) => {
      const s =
        streams.current[id] || (streams.current[id] = new MediaStream());

      if (!s.getTracks().some((t) => t.id === e.track.id)) {
        s.addTrack(e.track);
      }

      setRemotes((r) => ({ ...r, [id]: s }));
    };

    return peers.current[id];
  };

  const closePeer = (id) => {
    const p = peers.current[id];

    if (p) {
      p.pc.close();
      delete peers.current[id];
    }

    delete streams.current[id];

    setRemotes((r) => {
      const n = { ...r };
      delete n[id];
      return n;
    });
  };

  const flush = async (p) => {
    for (const c of p.pending) {
      await p.pc.addIceCandidate(c);
    }

    p.pending = [];
  };

  const callPeer = async (id) => {
    if (id === myId || peers.current[id]) return;

    const p = getPeer(id);

    p.pc.addTransceiver("audio", { direction: "sendrecv" });
    p.pc.addTransceiver("video", { direction: "sendrecv" });

    attachLocal(id);

    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);

    await sendSignal(id, "offer", {
      type: offer.type,
      sdp: offer.sdp,
    });
  };

  const handleSignal = async (s) => {
    try {
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

        await sendSignal(s.from, "answer", {
          type: answer.type,
          sdp: answer.sdp,
        });

        await flush(p);
      } else if (s.type === "answer") {
        await p.pc.setRemoteDescription(data);
        await flush(p);
      } else if (s.type === "candidate") {
        if (p.pc.remoteDescription) {
          await p.pc.addIceCandidate(data);
        } else {
          p.pending.push(data);
        }
      }
    } catch (error) {
      console.error("Call signal error:", error);
    }
  };

  const join = async () => {
    if (joinedRef.current) return;

    setNote("");

    try {
      local.current = await getMedia();
      setLocalView(local.current);
      setMicOn(true);
      setCamOn(true);

      // Listen only to signals sent to this user in this conversation.
      const mine = query(
        collection(db, ...signalsPath),
        where("to", "==", myId)
      );

      // Remove only this user's old signals in this conversation.
      const old = await getDocs(mine);
      await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));

      unsubs.current.push(
        onSnapshot(mine, (snap) => {
          snap.docChanges().forEach((c) => {
            if (c.type !== "added") return;

            const signal = c.doc.data();

            deleteDoc(c.doc.ref).catch(() => {});
            handleSignal(signal);
          });
        })
      );

      // Read only participants in this conversation.
      const participantsRef = collection(db, ...participantsPath);
      const existing = await getDocs(participantsRef);

      await setDoc(participantRef(), {
        uid: myId,
        name: displayName || user.displayName || "Friend",
        joinedAt: serverTimestamp(),
      });

      unsubs.current.push(
        onSnapshot(participantsRef, (snap) => {
          const n = {};

          snap.docs.forEach((d) => {
            n[d.id] = d.data().name || "Friend";
          });

          setNames(n);

          snap.docChanges().forEach((c) => {
            if (c.type === "removed") {
              closePeer(c.doc.id);
            }
          });
        })
      );

      joinedRef.current = true;
      setJoined(true);

      // Connect to people who were already in this conversation's call.
      for (const d of existing.docs) {
        if (d.id !== myId) {
          await callPeer(d.id);
        }
      }
    } catch (error) {
      console.error("Unable to join call:", error);
      setNote("Couldn't join this call. Check your connection and permissions.");

      unsubs.current.forEach((u) => u());
      unsubs.current = [];

      local.current?.getTracks().forEach((t) => t.stop());
      local.current = null;
      setLocalView(null);

      joinedRef.current = false;
      setJoined(false);
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

    joinedRef.current = false;
    setJoined(false);
    setLocalView(null);
    setRemotes({});
    setNames({});
    setSharing(false);

    try {
      await deleteDoc(participantRef());
    } catch (error) {
      console.error("Couldn't remove call participant:", error);
    }
  };

  // Clean up the call if the user closes the call window or leaves the chat.
  useEffect(() => {
    return () => {
      unsubs.current.forEach((u) => u());

      Object.values(peers.current).forEach((p) => p.pc.close());
      peers.current = {};

      local.current?.getTracks().forEach((t) => t.stop());
      screen.current?.getTracks().forEach((t) => t.stop());

      if (joinedRef.current) {
        deleteDoc(doc(db, ...participantsPath, myId)).catch(() => {});
      }
    };
  }, [chat.id, chat.group, myId]);

  const toggle = (kind) => {
    if (!local.current) return;

    local.current
      .getTracks()
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

    Object.values(peers.current).forEach((p) => {
      p.videoSender?.replaceTrack(cam).catch(() => {});
    });

    setLocalView(local.current);
    setSharing(false);
  };

  const startShare = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      screen.current = s;

      const track = s.getVideoTracks()[0];

      Object.values(peers.current).forEach((p) => {
        p.videoSender?.replaceTrack(track).catch(() => {});
      });

      setLocalView(s);
      setSharing(true);

      track.onended = stopShare;
    } catch {
      // The user cancelled screen sharing.
    }
  };

  const resetRoom = async () => {
    try {
      const [participants, signals] = await Promise.all([
        getDocs(collection(db, ...participantsPath)),
        getDocs(collection(db, ...signalsPath)),
      ]);

      await Promise.all([
        ...participants.docs.map((d) => deleteDoc(d.ref)),
        ...signals.docs.map((d) => deleteDoc(d.ref)),
      ]);

      setNote("This conversation's call room was reset.");
    } catch (error) {
      console.error("Room reset failed:", error);
      setNote("Couldn't reset this call room.");
    }
  };

  if (!joined) {
    return (
      <div className="call">
        <p>
          Join the call for <b>{chat.group ? "this group" : "this chat"}</b>.
          Only people in this conversation can join.
        </p>

        {note && <p className="error">{note}</p>}

        <button onClick={join}>📹 Join call</button>
        <button className="secondary" onClick={resetRoom}>
          Reset this call room
        </button>
      </div>
    );
  }

  return (
    <div className="call">
      <div className="grid">
        <Tile
          stream={localView}
          muted
          label={sharing ? "You (screen)" : "You"}
        />

        {Object.entries(remotes).map(([id, s]) => (
          <Tile key={id} stream={s} label={names[id] || "Friend"} />
        ))}
      </div>

      {note && <p className="error">{note}</p>}

      <div className="tools">
        <button onClick={() => toggle("audio")}>
          {micOn ? "🎤 Mute" : "🔇 Unmute"}
        </button>

        <button onClick={() => toggle("video")}>
          {camOn ? "📷 Cam off" : "📷 Cam on"}
        </button>

        <button onClick={sharing ? stopShare : startShare}>
          {sharing ? "Stop share" : "🖥️ Share screen"}
        </button>

        <button onClick={leave}>Leave</button>
      </div>
    </div>
  );
}