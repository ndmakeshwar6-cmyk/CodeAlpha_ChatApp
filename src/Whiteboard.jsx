
import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";

import {
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";

const W = 600;
const H = 600;

function drawStroke(ctx, stroke) {
  if (!stroke.points?.length) return;

  ctx.save();
  ctx.lineWidth = stroke.size || 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";

  ctx.strokeStyle = stroke.color || "#ff4d94";
  ctx.beginPath();

  stroke.points.forEach((p, i) => {
    const x = p.x * W;
    const y = p.y * H;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.lineTo(p.x * W + 0.1, p.y * H);
  }

  ctx.stroke();
  ctx.restore();
}

function formatDateTime(timestamp) {
  if (!timestamp?.toDate) return "Date unavailable";

  return timestamp.toDate().toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Whiteboard({ chat, user, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const points = useRef([]);
  const redoStack = useRef([]);

  const [strokes, setStrokes] = useState([]);
  const [boards, setBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState(null);

  const [color, setColor] = useState("#ff4d94");
  const [size, setSize] = useState(5);
  const [tool, setTool] = useState("pen");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");

  // Rename states
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const basePath = chat.group
    ? ["groups", chat.id]
    : ["chats", chat.id];

  const boardsRef = collection(db, ...basePath, "whiteboards");

  const selectedBoard = boards.find(
    (board) => board.id === selectedBoardId
  );

  const strokesRef = selectedBoardId
    ? collection(
        db,
        ...basePath,
        "whiteboards",
        selectedBoardId,
        "strokes"
      )
    : null;

  // Load history and preserve existing drawings.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    setLoading(true);
    setBoards([]);
    setStrokes([]);
    setSelectedBoardId(null);
    setError("");
    redoStack.current = [];

    async function loadWhiteboards() {
      try {
        const historyQuery = query(
          boardsRef,
          orderBy("updatedAt", "desc")
        );

        let historySnapshot = await getDocs(historyQuery);

        if (historySnapshot.empty) {
          const legacyRef = doc(
            db,
            ...basePath,
            "whiteboards",
            "legacy"
          );

          const legacyDoc = await getDoc(legacyRef);

          if (!legacyDoc.exists()) {
            const oldStrokesRef = collection(
              db,
              ...basePath,
              "whiteboardStrokes"
            );

            const oldSnapshot = await getDocs(
              query(oldStrokesRef, orderBy("createdAt"))
            );

            const oldStrokes = oldSnapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));

            // Only create a previous board if old drawings exist.
            if (oldStrokes.length > 0) {
              const firstDate = oldStrokes[0]?.createdAt;
              const lastDate =
                oldStrokes[oldStrokes.length - 1]?.createdAt;

              await setDoc(legacyRef, {
                title: "Previous Whiteboard",
                createdBy: user.uid,
                createdAt: firstDate || serverTimestamp(),
                updatedAt: lastDate || serverTimestamp(),
                legacyImported: true,
              });

              // Copy old drawings without deleting originals.
              for (let i = 0; i < oldStrokes.length; i += 450) {
                const batch = writeBatch(db);

                oldStrokes.slice(i, i + 450).forEach((stroke) => {
                  const { id, ...data } = stroke;

                  const newStrokeRef = doc(
                    db,
                    ...basePath,
                    "whiteboards",
                    "legacy",
                    "strokes",
                    id
                  );

                  batch.set(newStrokeRef, data);
                });

                await batch.commit();
              }
            }
          }

          historySnapshot = await getDocs(historyQuery);
        }

        if (cancelled) return;

        const loadedBoards = historySnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setBoards(loadedBoards);

        if (loadedBoards.length > 0) {
          setSelectedBoardId(loadedBoards[0].id);
        }

        setLoading(false);

        unsubscribe = onSnapshot(
          historyQuery,
          (snapshot) => {
            const updatedBoards = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));

            setBoards(updatedBoards);

            setSelectedBoardId((current) => {
              if (
                current &&
                updatedBoards.some((board) => board.id === current)
              ) {
                return current;
              }

              return updatedBoards[0]?.id || null;
            });
          },
          (err) => {
            console.error("WHITEBOARD HISTORY ERROR:", err);
            setError(
              `History error: ${err.code || err.message}`
            );
          }
        );
      } catch (err) {
        console.error("WHITEBOARD LOAD ERROR:", err);

        if (!cancelled) {
          setError(
            `Couldn't load whiteboards: ${err.code || err.message}`
          );
          setLoading(false);
        }
      }
    }

    loadWhiteboards();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [chat.id, chat.group, user.uid]);

  // Listen to selected board's strokes.
  useEffect(() => {
    if (!strokesRef) {
      setStrokes([]);
      return;
    }

    setStrokes([]);
    redoStack.current = [];
    setError("");

    const q = query(strokesRef, orderBy("createdAt"));

    return onSnapshot(
      q,
      (snapshot) => {
        setStrokes(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );

        setError("");
      },
      (err) => {
        console.error("WHITEBOARD STROKES ERROR:", err);
        setError(
          `Drawing error: ${err.code || err.message}`
        );
      }
    );
  }, [chat.id, chat.group, selectedBoardId]);

  // Redraw canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    strokes.forEach((stroke) => drawStroke(ctx, stroke));
  }, [strokes]);

  const getPosition = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();

    return {
      x: Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      ),
      y: Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height)
      ),
    };
  };

  const startDrawing = (e) => {
    if (!selectedBoardId || !canvasRef.current) return;

    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);

    drawing.current = true;
    points.current = [getPosition(e)];
  };

  const draw = (e) => {
    if (!drawing.current) return;

    e.preventDefault();

    const point = getPosition(e);
    const previous = points.current[points.current.length - 1];

    points.current.push(point);

    const ctx = canvasRef.current.getContext("2d");

    drawStroke(ctx, {
      points: [previous, point],
      color,
      size,
      tool,
    });
  };

  // Save strokes.
  const stopDrawing = async () => {
    if (!drawing.current) return;

    drawing.current = false;

    const savedPoints = [...points.current];
    points.current = [];

    if (!savedPoints.length || !strokesRef || !selectedBoardId) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await addDoc(strokesRef, {
        uid: user.uid,
        points: savedPoints,
        color,
        size,
        tool,
        createdAt: serverTimestamp(),
      });

      await updateDoc(
        doc(db, ...basePath, "whiteboards", selectedBoardId),
        {
          updatedAt: serverTimestamp(),
          lastEditedBy: user.uid,
        }
      );

      redoStack.current = [];
    } catch (err) {
      console.error("SAVE DRAWING ERROR:", err);
      setError(
        `Drawing couldn't be saved: ${err.code || err.message}`
      );
    } finally {
      setSaving(false);
    }
  };

  // Undo.
  const undo = async () => {
    const mine = [...strokes]
      .reverse()
      .find((stroke) => stroke.uid === user.uid);

    if (!mine || !strokesRef) return;

    try {
      await deleteDoc(doc(strokesRef, mine.id));
      redoStack.current.push(mine);

      await updateDoc(
        doc(db, ...basePath, "whiteboards", selectedBoardId),
        {
          updatedAt: serverTimestamp(),
          lastEditedBy: user.uid,
        }
      );

      setError("");
    } catch (err) {
      console.error("UNDO ERROR:", err);
      setError(`Couldn't undo: ${err.code || err.message}`);
    }
  };

  // Redo.
  const redo = async () => {
    const stroke = redoStack.current.pop();

    if (!stroke || !strokesRef) return;

    try {
      const { id, ...data } = stroke;

      await addDoc(strokesRef, {
        ...data,
        uid: user.uid,
        createdAt: serverTimestamp(),
      });

      await updateDoc(
        doc(db, ...basePath, "whiteboards", selectedBoardId),
        {
          updatedAt: serverTimestamp(),
          lastEditedBy: user.uid,
        }
      );

      setError("");
    } catch (err) {
      redoStack.current.push(stroke);
      console.error("REDO ERROR:", err);
      setError(`Couldn't redo: ${err.code || err.message}`);
    }
  };

  // Clear current board.
  const clearAll = async () => {
    if (!window.confirm("Clear this whiteboard's drawings?")) return;
    if (!strokesRef) return;

    try {
      setError("");

      const snapshot = await getDocs(strokesRef);

      for (let i = 0; i < snapshot.docs.length; i += 450) {
        const batch = writeBatch(db);

        snapshot.docs.slice(i, i + 450).forEach((item) => {
          batch.delete(item.ref);
        });

        await batch.commit();
      }

      redoStack.current = [];

      await updateDoc(
        doc(db, ...basePath, "whiteboards", selectedBoardId),
        {
          updatedAt: serverTimestamp(),
          lastEditedBy: user.uid,
        }
      );
    } catch (err) {
      console.error("CLEAR WHITEBOARD ERROR:", err);
      setError(
        `Couldn't clear the whiteboard: ${err.code || err.message}`
      );
    }
  };

  // Create a new board.
  const createNewBoard = async () => {
    if (creating) return;

    try {
      setCreating(true);
      setError("");

      const boardNumber = boards.length + 1;

      const newBoard = await addDoc(boardsRef, {
        title: `Whiteboard ${boardNumber}`,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastEditedBy: user.uid,
        legacyImported: false,
      });

      setSelectedBoardId(newBoard.id);
      setShowHistory(false);
      setEditingBoardId(null);
      redoStack.current = [];
    } catch (err) {
      console.error("CREATE WHITEBOARD ERROR:", err);
      setError(
        `Couldn't create a new board: ${err.code || err.message}`
      );
    } finally {
      setCreating(false);
    }
  };

  // Start renaming a board.
  const startRename = (board) => {
    setEditingBoardId(board.id);
    setEditingTitle(board.title || "Whiteboard");
    setError("");
  };

  // Save renamed board.
  const saveRename = async (boardId) => {
    const cleanTitle = editingTitle.trim();

    if (!cleanTitle) {
      setError("Please enter a whiteboard name.");
      return;
    }

    if (cleanTitle.length > 40) {
      setError("Whiteboard names must be 40 characters or fewer.");
      return;
    }

    try {
      setRenaming(true);
      setError("");

      await updateDoc(
        doc(db, ...basePath, "whiteboards", boardId),
        {
          title: cleanTitle,
        }
      );

      setEditingBoardId(null);
      setEditingTitle("");
    } catch (err) {
      console.error("RENAME WHITEBOARD ERROR:", err);
      setError(
        `Couldn't rename whiteboard: ${err.code || err.message}`
      );
    } finally {
      setRenaming(false);
    }
  };

  const cancelRename = () => {
    setEditingBoardId(null);
    setEditingTitle("");
    setError("");
  };

  const openBoard = (boardId) => {
    setSelectedBoardId(boardId);
    setShowHistory(false);
    setEditingBoardId(null);
    redoStack.current = [];
  };

  return (
    <div className="board whiteboard-panel">
      <div className="whiteboard-title">
        <div>
          <b>🎨 Shared Whiteboard</b>
          <small>
            {chat.group
              ? "Group collaboration"
              : "Private collaboration"}
          </small>
        </div>

        {onClose && (
          <button className="secondary" onClick={onClose}>
            ← Back to chat
          </button>
        )}
      </div>

      <div className="whiteboard-history-actions">
        <button
          className="secondary"
          onClick={() => setShowHistory((value) => !value)}
        >
          🕘 History ({boards.length})
        </button>

        <button onClick={createNewBoard} disabled={creating || loading}>
          {creating ? "Creating..." : "＋ New Whiteboard"}
        </button>
      </div>

      {showHistory && (
        <div className="whiteboard-history">
          <div className="whiteboard-history-heading">
            <b>Whiteboard History</b>
            <small>Newest activity first</small>
          </div>

          {boards.length === 0 ? (
            <p className="hint">No whiteboards yet.</p>
          ) : (
            boards.map((board) => (
              <div
                key={board.id}
                className={`whiteboard-history-item ${
                  selectedBoardId === board.id ? "active" : ""
                }`}
                style={{ cursor: "default" }}
              >
                {editingBoardId === board.id ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                      width: "100%",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                      }}
                    >
                      Rename whiteboard
                    </label>

                    <input
                      autoFocus
                      type="text"
                      maxLength={40}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(board.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      placeholder="Enter a name"
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />

                    <small
                      style={{
                        color: "var(--muted)",
                        fontSize: "0.72rem",
                      }}
                    >
                      {editingTitle.length}/40 characters
                    </small>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => saveRename(board.id)}
                        disabled={renaming}
                        style={{ padding: "7px 13px", fontSize: "0.8rem" }}
                      >
                        {renaming ? "Saving..." : "Save"}
                      </button>

                      <button
                        className="secondary"
                        onClick={cancelRename}
                        disabled={renaming}
                        style={{ padding: "7px 13px", fontSize: "0.8rem" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => openBoard(board.id)}
                      style={{
                        display: "flex",
                        flex: 1,
                        minWidth: 0,
                        alignItems: "flex-start",
                        gap: 10,
                        padding: 0,
                        background: "transparent",
                        color: "var(--text)",
                        textAlign: "left",
                      }}
                    >
                      <span className="whiteboard-history-icon">🎨</span>

                      <span className="whiteboard-history-info">
                        <b>{board.title || "Whiteboard"}</b>

                        <small>
                          Created: {formatDateTime(board.createdAt)}
                        </small>

                        <small>
                          Last edited: {formatDateTime(board.updatedAt)}
                        </small>
                      </span>

                      {selectedBoardId === board.id && (
                        <span className="whiteboard-history-current">
                          Open
                        </span>
                      )}
                    </button>

                    <button
                      className="secondary"
                      onClick={() => startRename(board)}
                      title="Edit whiteboard name"
                      aria-label={`Rename ${board.title || "whiteboard"}`}
                      style={{
                        flexShrink: 0,
                        padding: "7px 10px",
                        fontSize: "0.8rem",
                        alignSelf: "center",
                      }}
                    >
                      ✏️ Edit
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {loading ? (
        <p className="hint">Loading your whiteboards...</p>
      ) : !selectedBoardId ? (
        <p className="hint">Create a whiteboard to get started.</p>
      ) : (
        <>
          <div className="whiteboard-current-info">
            <b>{selectedBoard?.title || "Whiteboard"}</b>
            <small>
              Created {formatDateTime(selectedBoard?.createdAt)}
            </small>
          </div>

          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="canvas"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onLostPointerCapture={stopDrawing}
          />

          <div className="tools">
            <label>Colour</label>

            <input
              type="color"
              value={color}
              disabled={tool === "eraser"}
              onChange={(e) => setColor(e.target.value)}
            />

            <label>Brush</label>

            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              <option value={2}>Thin</option>
              <option value={5}>Medium</option>
              <option value={10}>Thick</option>
              <option value={18}>Extra thick</option>
            </select>

            <button
              className={tool === "pen" ? "" : "secondary"}
              onClick={() => setTool("pen")}
            >
              ✏️ Pen
            </button>

            <button
              className={tool === "eraser" ? "" : "secondary"}
              onClick={() => setTool("eraser")}
            >
              🧽 Eraser
            </button>

            <button
              className="secondary"
              onClick={undo}
              disabled={!strokes.some((s) => s.uid === user.uid)}
            >
              ↶ Undo
            </button>

            <button
              className="secondary"
              onClick={redo}
              disabled={redoStack.current.length === 0}
            >
              ↷ Redo
            </button>

            <button className="secondary" onClick={clearAll}>
              🗑 Clear all
            </button>
          </div>

          {saving && <small>Saving drawing...</small>}

          <small className="hint">
            {strokes.length} saved strokes · Drawings sync with chat members
          </small>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
