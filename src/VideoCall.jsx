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
  updateDoc,
} from "firebase/firestore";
import "./VideoCall.css";

const ICE = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function CallIcon({ name, size = 19 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    mic: <><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" /></>,
    micOff: <><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9V5.5a3 3 0 0 0-5.8-1M5.5 11.5a6.5 6.5 0 0 0 11 4.6M12 18v3M8.5 21h7M3 3l18 18" /></>,
    camera: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>,
    cameraOff: <><path d="M10 6h4a2 2 0 0 1 2 2v2l5-3v10l-5-3v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M3 3l18 18" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    leave: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function Tile({ stream, muted = false, label, photoURL, cameraOn = true }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // The video element is unmounted while the camera is off and
    // mounted again when it turns on. Reattach the existing stream
    // whenever cameraOn changes as well as whenever the stream changes.
    video.srcObject = stream || null;
  }, [stream, cameraOn]);

  const hasVideo = !!stream?.getVideoTracks?.().length;

  return (
    <div className={`vc-tile ${!cameraOn || !hasVideo ? "vc-tile-camera-off" : ""}`}>
      {cameraOn && hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={muted} />
      ) : (
        <div className="vc-camera-placeholder">
          {photoURL ? (
            <img src={photoURL} alt={`${label} profile`} />
          ) : (
            <div className="vc-avatar-fallback">
              {(label || "F").trim().charAt(0).toUpperCase()}
            </div>
          )}
          <span>Camera off</span>
        </div>
      )}
      <div className="vc-nameplate">{label}</div>
    </div>
  );
}

export default function VideoCall({ user, chat, displayName }) {
  const myId = user.uid;

  const roomPath = chat.group
    ? ["groups", chat.id]
    : ["chats", chat.id];

  const participantsPath = [...roomPath, "callParticipants"];
  const signalsPath = [...roomPath, "callSignals"];

  const [joined, setJoined] = useState(false);
  const [localView, setLocalView] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [participants, setParticipants] = useState({});
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

  const participantRef = () => doc(db, ...participantsPath, myId);

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
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setNote("Camera unavailable — you joined with audio only.");
        return audioOnly;
      } catch {
        setNote("Camera and microphone unavailable — you can watch only.");
        return new MediaStream();
      }
    }
  };

  const attachLocal = (id) => {
    const peer = peers.current[id];
    if (!peer || !local.current) return;

    peer.pc.getTransceivers().forEach((transceiver) => {
      const kind = transceiver.receiver.track.kind;
      const track = local.current.getTracks().find((item) => item.kind === kind);
      transceiver.direction = "sendrecv";

      if (track) transceiver.sender.replaceTrack(track).catch(() => {});

      if (kind === "video") {
        peer.videoSender = transceiver.sender;
        const screenTrack = screen.current?.getVideoTracks()[0];
        if (screenTrack) transceiver.sender.replaceTrack(screenTrack).catch(() => {});
      }
    });
  };

  const getPeer = (id) => {
    if (peers.current[id]) return peers.current[id];

    const pc = new RTCPeerConnection(ICE);
    peers.current[id] = { pc, videoSender: null, pending: [] };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(id, "candidate", event.candidate.toJSON()).catch(() => {});
      }
    };

    pc.ontrack = (event) => {
      const stream = streams.current[id] || (streams.current[id] = new MediaStream());
      if (!stream.getTracks().some((track) => track.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      setRemotes((current) => ({ ...current, [id]: stream }));
    };

    return peers.current[id];
  };

  const closePeer = (id) => {
    const peer = peers.current[id];
    if (peer) {
      peer.pc.close();
      delete peers.current[id];
    }
    delete streams.current[id];
    setRemotes((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const flush = async (peer) => {
    for (const candidate of peer.pending) {
      await peer.pc.addIceCandidate(candidate);
    }
    peer.pending = [];
  };

  const callPeer = async (id) => {
    if (id === myId || peers.current[id]) return;
    const peer = getPeer(id);
    peer.pc.addTransceiver("audio", { direction: "sendrecv" });
    peer.pc.addTransceiver("video", { direction: "sendrecv" });
    attachLocal(id);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await sendSignal(id, "offer", { type: offer.type, sdp: offer.sdp });
  };

  const handleSignal = async (signal) => {
    try {
      const data = JSON.parse(signal.payload);
      if (signal.type === "offer" && peers.current[signal.from]?.pc.remoteDescription) {
        closePeer(signal.from);
      }

      const peer = getPeer(signal.from);
      if (signal.type === "offer") {
        await peer.pc.setRemoteDescription(data);
        attachLocal(signal.from);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        await sendSignal(signal.from, "answer", { type: answer.type, sdp: answer.sdp });
        await flush(peer);
      } else if (signal.type === "answer") {
        await peer.pc.setRemoteDescription(data);
        await flush(peer);
      } else if (signal.type === "candidate") {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data);
        else peer.pending.push(data);
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

      const audioTrack = local.current.getAudioTracks()[0];
      const videoTrack = local.current.getVideoTracks()[0];
      setMicOn(!!audioTrack?.enabled);
      setCamOn(!!videoTrack?.enabled);

      const mine = query(
        collection(db, ...signalsPath),
        where("to", "==", myId)
      );

      const old = await getDocs(mine);
      await Promise.all(old.docs.map((item) => deleteDoc(item.ref)));

      unsubs.current.push(
        onSnapshot(mine, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type !== "added") return;
            const signal = change.doc.data();
            deleteDoc(change.doc.ref).catch(() => {});
            handleSignal(signal);
          });
        })
      );

      const participantsRef = collection(db, ...participantsPath);
      const existing = await getDocs(participantsRef);

      await setDoc(participantRef(), {
        uid: myId,
        name: displayName || user.displayName || "Friend",
        photoURL: user.photoURL || "",
        cameraOn: !!videoTrack?.enabled,
        joinedAt: serverTimestamp(),
      });

      unsubs.current.push(
        onSnapshot(participantsRef, (snapshot) => {
          const next = {};
          snapshot.docs.forEach((item) => {
            next[item.id] = item.data();
          });
          setParticipants(next);

          snapshot.docChanges().forEach((change) => {
            if (change.type === "removed") closePeer(change.doc.id);
          });
        })
      );

      joinedRef.current = true;
      setJoined(true);

      for (const item of existing.docs) {
        if (item.id !== myId) await callPeer(item.id);
      }
    } catch (error) {
      console.error("Unable to join call:", error);
      setNote("Couldn't join this call. Check your connection and permissions.");
      unsubs.current.forEach((unsubscribe) => unsubscribe());
      unsubs.current = [];
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
      setLocalView(null);
      joinedRef.current = false;
      setJoined(false);
    }
  };

  const leave = async () => {
    unsubs.current.forEach((unsubscribe) => unsubscribe());
    unsubs.current = [];
    Object.keys(peers.current).forEach((id) => closePeer(id));
    local.current?.getTracks().forEach((track) => track.stop());
    screen.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    screen.current = null;
    streams.current = {};
    joinedRef.current = false;
    setJoined(false);
    setLocalView(null);
    setRemotes({});
    setParticipants({});
    setSharing(false);

    try {
      await deleteDoc(participantRef());
    } catch (error) {
      console.error("Couldn't remove call participant:", error);
    }
  };

  useEffect(() => {
    return () => {
      unsubs.current.forEach((unsubscribe) => unsubscribe());
      Object.values(peers.current).forEach((peer) => peer.pc.close());
      peers.current = {};
      local.current?.getTracks().forEach((track) => track.stop());
      screen.current?.getTracks().forEach((track) => track.stop());
      if (joinedRef.current) {
        deleteDoc(doc(db, ...participantsPath, myId)).catch(() => {});
      }
    };
  }, [chat.id, chat.group, myId]);

  const toggle = async (kind) => {
    if (!local.current) return;
    const tracks = local.current.getTracks().filter((track) => track.kind === kind);
    tracks.forEach((track) => { track.enabled = !track.enabled; });

    if (kind === "audio") setMicOn((value) => !value);
    else {
      const nextCameraState = tracks.length ? tracks[0].enabled : false;
      setCamOn(nextCameraState);
      try {
        await setDoc(participantRef(), { cameraOn: nextCameraState }, { merge: true });
      } catch (error) {
        console.error("Couldn't update camera status:", error);
      }
    }
  };

  const stopShare = () => {
    if (!screen.current) return;
    screen.current.getTracks().forEach((track) => track.stop());
    screen.current = null;
    const cameraTrack = local.current?.getVideoTracks()[0] || null;
    Object.values(peers.current).forEach((peer) => {
      peer.videoSender?.replaceTrack(cameraTrack).catch(() => {});
    });
    setLocalView(local.current);
    setSharing(false);
  };

  const startShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screen.current = stream;
      const track = stream.getVideoTracks()[0];
      Object.values(peers.current).forEach((peer) => {
        peer.videoSender?.replaceTrack(track).catch(() => {});
      });
      setLocalView(stream);
      setSharing(true);
      track.onended = stopShare;
    } catch {
      // The user cancelled screen sharing.
    }
  };

  const resetRoom = async () => {
    try {
      const [participantsSnapshot, signalsSnapshot] = await Promise.all([
        getDocs(collection(db, ...participantsPath)),
        getDocs(collection(db, ...signalsPath)),
      ]);
      await Promise.all([
        ...participantsSnapshot.docs.map((item) => deleteDoc(item.ref)),
        ...signalsSnapshot.docs.map((item) => deleteDoc(item.ref)),
      ]);
      setNote("This conversation's call room was reset.");
    } catch (error) {
      console.error("Room reset failed:", error);
      setNote("Couldn't reset this call room.");
    }
  };

  if (!joined) {
    return (
      <div className="vc-call vc-prejoin">
        <div className="vc-prejoin-icon"><CallIcon name="camera" size={26} /></div>
        <h3>Video call</h3>
        <p>
          Join the call for <b>{chat.group ? "this group" : "this chat"}</b>.
          Only people in this conversation can join.
        </p>
        {note && <p className="vc-note">{note}</p>}
        <button className="vc-primary-action" onClick={join}>
          <CallIcon name="camera" /> Join call
        </button>
        <button className="vc-text-action" onClick={resetRoom}>Reset call room</button>
      </div>
    );
  }

  const remoteEntries = Object.entries(remotes);

  return (
    <div className="vc-call">
      <div className="vc-grid">
        <Tile
          stream={sharing ? localView : local.current}
          muted
          label="You"
          photoURL={user.photoURL}
          cameraOn={sharing || camOn}
        />
        {remoteEntries.map(([id, stream]) => (
          <Tile
            key={id}
            stream={stream}
            label={participants[id]?.name || "Friend"}
            photoURL={participants[id]?.photoURL}
            cameraOn={participants[id]?.cameraOn !== false}
          />
        ))}
      </div>

      {remoteEntries.length === 0 && (
        <div className="vc-waiting">Waiting for someone to join…</div>
      )}
      {note && <p className="vc-note">{note}</p>}

      <div className="vc-controls" aria-label="Call controls">
        <button
          className={`vc-control ${!micOn ? "is-off" : ""}`}
          onClick={() => toggle("audio")}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          title={micOn ? "Mute" : "Unmute"}
        >
          <CallIcon name={micOn ? "mic" : "micOff"} />
          <span>{micOn ? "Mute" : "Unmute"}</span>
        </button>

        <button
          className={`vc-control ${!camOn ? "is-off" : ""}`}
          onClick={() => toggle("video")}
          aria-label={camOn ? "Turn camera off" : "Turn camera on"}
          title={camOn ? "Turn camera off" : "Turn camera on"}
        >
          <CallIcon name={camOn ? "camera" : "cameraOff"} />
          <span>{camOn ? "Camera off" : "Camera on"}</span>
        </button>

        <button
          className={`vc-control ${sharing ? "is-active" : ""}`}
          onClick={sharing ? stopShare : startShare}
          aria-label={sharing ? "Stop sharing screen" : "Share screen"}
          title={sharing ? "Stop sharing" : "Share screen"}
        >
          <CallIcon name="screen" />
          <span>{sharing ? "Stop share" : "Share screen"}</span>
        </button>

        <button className="vc-control vc-leave" onClick={leave} title="Leave call">
          <CallIcon name="leave" />
          <span>Leave</span>
        </button>
      </div>
    </div>
  );
}
