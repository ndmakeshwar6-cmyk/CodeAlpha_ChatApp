import React, { useEffect, useState } from "react";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import "./StickerActions.css";

export default function StickerActions({ message, user, chat }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [packPickerOpen, setPackPickerOpen] = useState(false);
  const [packs, setPacks] = useState([]);
  const [creatingPack, setCreatingPack] = useState(false);
  const [packName, setPackName] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the user's own sticker packs.
  useEffect(() => {
    if (!user?.uid) return undefined;

    return onSnapshot(
      collection(db, "users", user.uid, "stickerPacks"),
      (snapshot) => {
        setPacks(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
              packId: item.data().packId || item.id,
            }))
            .filter((pack) => pack.ownerUid === user.uid)
        );
      },
      (error) => {
        console.error("Load sticker packs:", error);
      }
    );
  }, [user?.uid]);

  const stickerData = {
    url: message.stickerUrl,
    name: message.stickerName || "Sticker",
    format: message.stickerFormat || "gif",
    animated: !!message.stickerAnimated,
    source: message.stickerSourceId ? "giphy-or-shared" : "tether",
    sourceMessageId: message.id,
  };

  // Favorites is independent from Recent.
  // Recent is updated when a sticker is selected and sent from StickerPicker.
  const addToFavorites = async () => {
    if (!message?.stickerUrl || busy) return;

    setBusy(true);

    try {
      const favoriteId = `${chat.id}_${message.id}`;

      await setDoc(
        doc(db, "users", user.uid, "savedStickers", favoriteId),
        {
          ...stickerData,
          sourceChatId: chat.id,
          sourceMessageId: message.id,
          savedFrom: message.uid || "",
          savedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMenuOpen(false);
    } catch (error) {
      console.error("Add sticker to Favorites:", error);
    } finally {
      setBusy(false);
    }
  };

  // Add the selected sticker to an existing pack.
  const addStickerToPack = async (pack) => {
    if (!message?.stickerUrl || busy) return;

    const packId = pack.packId || pack.id;
    setBusy(true);

    try {
      await setDoc(
        doc(db, "stickerPacks", packId, "stickers", `${message.id}_${Date.now()}`),
        {
          url: stickerData.url,
          name: stickerData.name,
          format: stickerData.format,
          animated: stickerData.animated,
          source: stickerData.source,
          sourceMessageId: message.id,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        }
      );

      await setDoc(
        doc(db, "stickerPacks", packId),
        {
          stickerCount: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setPackPickerOpen(false);
      setMenuOpen(false);
    } catch (error) {
      console.error("Add sticker to existing pack:", error);
    } finally {
      setBusy(false);
    }
  };

  // Create a new pack and add the selected sticker.
  const createPackWithSticker = async (event) => {
    event.preventDefault();

    const name = packName.trim();
    if (!name || busy) return;

    setBusy(true);

    try {
      const packRef = doc(collection(db, "stickerPacks"));
      const stickerRef = doc(
        collection(db, "stickerPacks", packRef.id, "stickers")
      );
      const batch = writeBatch(db);

      batch.set(packRef, {
        name,
        createdBy: user.uid,
        createdByName: user.displayName || "Tether user",
        coverUrl: stickerData.url,
        stickerCount: 1,
        visibility: "public",
        createdAt: serverTimestamp(),
      });

      batch.set(stickerRef, {
        url: stickerData.url,
        name: stickerData.name,
        format: stickerData.format,
        animated: stickerData.animated,
        source: stickerData.source,
        sourceMessageId: message.id,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      batch.set(
        doc(db, "users", user.uid, "stickerPacks", packRef.id),
        {
          packId: packRef.id,
          name,
          coverUrl: stickerData.url,
          ownerUid: user.uid,
          installedAt: serverTimestamp(),
        }
      );

      await batch.commit();

      setPackName("");
      setCreatingPack(false);
      setPackPickerOpen(false);
      setMenuOpen(false);
    } catch (error) {
      console.error("Create sticker pack:", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="tether-sticker-actions"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="tether-sticker-image-trigger"
        onClick={() => {
          setMenuOpen((open) => !open);
          setPackPickerOpen(false);
        }}
        aria-label="Sticker options"
        aria-expanded={menuOpen}
        title="Sticker options"
      >
        <img
          src={message.stickerUrl}
          alt={message.stickerName || "Sticker"}
          loading="lazy"
        />
      </button>

      {menuOpen && (
        <div className="tether-sticker-action-menu">
          <button
            type="button"
            disabled={busy}
            onClick={addToFavorites}
          >
            Add to favourites
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPackPickerOpen(true);
              setCreatingPack(false);
            }}
          >
            Add to sticker pack
          </button>
        </div>
      )}

      {packPickerOpen && (
        <div
          className="tether-sticker-pack-backdrop"
          onClick={() => !busy && setPackPickerOpen(false)}
        >
          <div
            className="tether-sticker-pack-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Add sticker to pack"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tether-sticker-pack-dialog-heading">
              <strong>Add sticker to</strong>
              <button
                type="button"
                onClick={() => setPackPickerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {!creatingPack ? (
              <>
                <div className="tether-sticker-pack-options">
                  {packs.length > 0 ? (
                    packs.map((pack) => (
                      <button
                        type="button"
                        key={pack.id}
                        disabled={busy}
                        onClick={() => addStickerToPack(pack)}
                      >
                        {pack.coverUrl ? (
                          <img src={pack.coverUrl} alt="" />
                        ) : (
                          <span className="tether-pack-placeholder" />
                        )}

                        <span>{pack.name || "Untitled pack"}</span>
                        <span className="tether-pack-chevron">›</span>
                      </button>
                    ))
                  ) : (
                    <p className="tether-sticker-no-packs">
                      You don't have any sticker packs yet.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="tether-create-pack-choice"
                  onClick={() => setCreatingPack(true)}
                >
                  Create a new sticker pack
                </button>
              </>
            ) : (
              <form
                className="tether-create-pack-form"
                onSubmit={createPackWithSticker}
              >
                <label htmlFor={`sticker-pack-name-${message.id}`}>
                  Sticker pack name
                </label>

                <input
                  id={`sticker-pack-name-${message.id}`}
                  value={packName}
                  onChange={(event) => setPackName(event.target.value)}
                  placeholder="e.g. Cute reactions"
                  maxLength={40}
                  autoFocus
                  required
                />

                <div>
                  <button
                    type="button"
                    onClick={() => setCreatingPack(false)}
                    disabled={busy}
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={busy || !packName.trim()}
                  >
                    {busy ? "Creating..." : "Create pack"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
