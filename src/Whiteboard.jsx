import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  getDocs, writeBatch, serverTimestamp,
} from "firebase/firestore";

const W = 400;
const H = 400;

function drawStroke(ctx, s) {
  if (!s.points || s.points.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  s.points.forEach((p, i) => {
    const x = p.x * W;
    const y = p.y * H;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (s.points.length === 1) ctx.lineTo(s.points[0].x * W + 0.1, s.points[0].y * H);
  ctx.stroke();
}

export default function Whiteboard() {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const points = useRef([]);
  const [color, setColor] = useState("#ff4d94");
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "strokes"), orderBy("createdAt"));
    return onSnapshot(q, (snap) => setStrokes(snap.docs.map((d) => d.data())));
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    strokes.forEach((s) => drawStroke(ctx, s));
  }, [strokes]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000,
      y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000,
    };
  };

  const down = (e) => {
    drawing.current = true;
    points.current = [pos(e)];
  };

  const move = (e) => {
    if (!drawing.current) return;
    points.current.push(pos(e));
    const ctx = canvasRef.current.getContext("2d");
    drawStroke(ctx, { points: points.current.slice(-2), color, size });
  };

  const up = async () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (points.current.length) {
      await addDoc(collection(db, "strokes"), {
        points: points.current, color, size, createdAt: serverTimestamp(),
      });
    }
    points.current = [];
  };

  const clearAll = async () => {
    const snap = await getDocs(collection(db, "strokes"));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  };

  return (
    <div className="board">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="canvas"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="tools">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          <option value={2}>Thin</option>
          <option value={4}>Medium</option>
          <option value={10}>Thick</option>
        </select>
        <button onClick={() => setColor("#ffffff")}>Eraser</button>
        <button onClick={clearAll}>Clear all</button>
      </div>
    </div>
  );
}