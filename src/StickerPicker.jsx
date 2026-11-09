import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import "./StickerPicker.css";

const CLOUD_NAME = "n7saeady";
const UPLOAD_PRESET = "chatapp_upload";
const MAX_STICKER_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/webp", "image/gif"];
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;
const GIPHY_BASE_URL = "https://api.giphy.com/v1/stickers";
const GIPHY_RESULT_LIMIT = 24;

function isAnimatedSticker(file) {
  return (
    file.type === "image/gif" ||
    /\.gif$/i.test(file.name) ||
    /\.webp$/i.test(file.name)
  );
}

async function uploadSticker(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`${file.name}: Use PNG, WebP, or GIF files.`);
  }

  if (file.size > MAX_STICKER_SIZE) {
    throw new Error(`${file.name}: Stickers must be 5 MB or smaller.`);
  }

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "tether/stickers");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: "POST", body: form }
  );

  const data = await response.json();

  if (!response.ok || !data.secure_url) {
    throw new Error(data.error?.message || `Couldn't upload ${file.name}.`);
  }

  return {
    url: data.secure_url,
    format: (data.format || file.name.split(".").pop() || "").toLowerCase(),
    animated: isAnimatedSticker(file),
    fileName: file.name,
    bytes: file.size,
  };
}

function mapGiphySticker(item) {
  const images = item.images || {};
  const url =
    images.fixed_height?.url ||
    images.fixed_width?.url ||
    images.original?.url ||
    images.downsized?.url;

  if (!url) return null;

  return {
    id: `giphy-${item.id}`,
    giphyId: item.id,
    source: "giphy",
    url,
    name: item.title || "GIPHY sticker",
    format: "gif",
    animated: true,
    packId: "",
  };
}

export default function StickerPicker({ user, profile, onSendSticker, onClose }) {
  const [activeTab, setActiveTab] = useState("recent");
  const [packs, setPacks] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);
  const [packStickers, setPackStickers] = useState([]);
  const [selectedPack, setSelectedPack] = useState(null);
  const [packName, setPackName] = useState("");
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busyPack, setBusyPack] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [giphyStickers, setGiphyStickers] = useState([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [giphyError, setGiphyError] = useState("");
  const fileInputRef = useRef(null);

  // Existing Tether sticker collections remain synced through Firestore.
  useEffect(() => {
    if (!user?.uid) return undefined;

    const packsQuery = query(
      collection(db, "stickerPacks"),
      where("visibility", "==", "public")
    );

    const stopPacks = onSnapshot(
      packsQuery,
      (snapshot) => {
        setPacks(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort(
              (a, b) =>
                (b.createdAt?.toMillis?.() || 0) -
                (a.createdAt?.toMillis?.() || 0)
            )
        );
      },
      (error) => {
        console.error("Sticker pack catalogue:", error);
        setNotice("Couldn't load the sticker catalogue.");
      }
    );

    const stopInstalled = onSnapshot(
      collection(db, "users", user.uid, "stickerPacks"),
      (snapshot) => {
        setInstalled(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (error) => {
        console.error("Installed sticker packs:", error);
        setNotice("Couldn't load your sticker packs.");
      }
    );

    const stopFavorites = onSnapshot(
      collection(db, "users", user.uid, "savedStickers"),
      (snapshot) => {
        setFavorites(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (error) => {
        console.error("Saved stickers:", error);
        setNotice("Couldn't load your saved stickers.");
      }
    );

    const recentQuery = query(
      collection(db, "users", user.uid, "recentStickers"),
      orderBy("usedAt", "desc")
    );

    const stopRecent = onSnapshot(
      recentQuery,
      (snapshot) => {
        setRecent(
          snapshot.docs.slice(0, 30).map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (error) => {
        console.error("Recent stickers:", error);
      }
    );

    return () => {
      stopPacks();
      stopInstalled();
      stopFavorites();
      stopRecent();
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function loadInstalledStickers() {
      const packsToLoad = [...installed];

      if (
        selectedPack &&
        !packsToLoad.some((pack) => (pack.packId || pack.id) === selectedPack.id)
      ) {
        packsToLoad.push(selectedPack);
      }

      if (!packsToLoad.length) {
        setPackStickers([]);
        return;
      }

      try {
        const results = await Promise.all(
          packsToLoad.map(async (pack) => {
            const packId = pack.packId || pack.id;
            const snapshot = await getDocs(
              collection(db, "stickerPacks", packId, "stickers")
            );

            return snapshot.docs.map((item) => ({
              id: item.id,
              packId,
              packName: pack.name || "Sticker pack",
              ...item.data(),
            }));
          })
        );

        if (!cancelled) setPackStickers(results.flat());
      } catch (error) {
        console.error("Load installed stickers:", error);
        if (!cancelled) setNotice("Couldn't load stickers from your packs.");
      }
    }

    loadInstalledStickers();

    return () => {
      cancelled = true;
    };
  }, [installed, selectedPack]);

  // GIPHY calls are made directly from the browser, as required by GIPHY.
  // An empty search loads trending stickers; a typed query searches stickers.
  useEffect(() => {
    if (activeTab !== "discover" || selectedPack) return undefined;

    if (!GIPHY_API_KEY) {
      setGiphyStickers([]);
      setGiphyError(
        "GIPHY API key not found. Check that .env.local is in the project root and restart Vite."
      );
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    const queryText = search.trim();

    const timer = window.setTimeout(async () => {
      setGiphyLoading(true);
      setGiphyError("");

      try {
        const endpoint = queryText
          ? `${GIPHY_BASE_URL}/search`
          : `${GIPHY_BASE_URL}/trending`;

        const params = new URLSearchParams({
          api_key: GIPHY_API_KEY,
          limit: String(GIPHY_RESULT_LIMIT),
          rating: "pg",
        });

        if (queryText) params.set("q", queryText.slice(0, 50));

        const response = await fetch(`${endpoint}?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok || payload.meta?.status !== 200) {
          const message =
            payload.meta?.msg || `GIPHY request failed (${response.status}).`;
          throw new Error(message);
        }

        const results = (payload.data || [])
          .map(mapGiphySticker)
          .filter(Boolean);

        if (!cancelled) setGiphyStickers(results);
      } catch (error) {
        if (error.name !== "AbortError" && !cancelled) {
          console.error("GIPHY stickers:", error);
          setGiphyStickers([]);
          setGiphyError(
            error.message?.includes("401") || error.message?.includes("403")
              ? "GIPHY rejected the API key. Check that you created an API key (not an SDK key) and copied it correctly."
              : "Couldn't load GIPHY stickers. Please try again."
          );
        }
      } finally {
        if (!cancelled) setGiphyLoading(false);
      }
    }, queryText ? 450 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, selectedPack, search]);

  const filteredPacks = useMemo(() => {
    const installedIds = new Set(
      installed.map((pack) => pack.packId || pack.id)
    );

    return packs.filter((pack) => {
      const matchesSearch = (pack.name || "")
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      return matchesSearch && !installedIds.has(pack.id);
    });
  }, [packs, installed, search]);

  const visibleStickers = useMemo(() => {
    let items = [];

    if (activeTab === "recent") items = recent;
    if (activeTab === "favorites") items = favorites;
    if (activeTab === "my") items = packStickers;

    if (selectedPack) {
      items = packStickers.filter((item) => item.packId === selectedPack.id);
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      items = items.filter((item) =>
        `${item.name || ""} ${item.packName || ""} ${item.fileName || ""}`
          .toLowerCase()
          .includes(term)
      );
    }

    return items;
  }, [activeTab, recent, favorites, packStickers, selectedPack, search]);

  const addToRecent = async (sticker) => {
    try {
      await addDoc(collection(db, "users", user.uid, "recentStickers"), {
        url: sticker.url,
        name: sticker.name || sticker.fileName || "Sticker",
        format: sticker.format || "",
        animated: !!sticker.animated,
        packId: sticker.packId || "",
        usedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Save recent sticker:", error);
    }
  };

  const chooseSticker = async (sticker) => {
    // Every sticker the user chooses to send is automatically added to Recent.
    // Favorites remains separate and is only updated when explicitly selected.
    await addToRecent(sticker);

    onSendSticker({
      url: sticker.url,
      name: sticker.name || sticker.fileName || "Sticker",
      format: sticker.format || "",
      animated: !!sticker.animated,
      packId: sticker.packId || "",
      stickerId: sticker.giphyId || sticker.id || "",
      source: sticker.source || "tether",
    });
  };

  const installPack = async (pack) => {
    setBusyPack(pack.id);
    setNotice("");

    try {
      await setDoc(doc(db, "users", user.uid, "stickerPacks", pack.id), {
        packId: pack.id,
        name: pack.name || "Sticker pack",
        coverUrl: pack.coverUrl || "",
        ownerUid: pack.createdBy || "",
        installedAt: serverTimestamp(),
      });

      setNotice(`Added "${pack.name}" to your stickers.`);
    } catch (error) {
      console.error("Install sticker pack:", error);
      setNotice("Couldn't add this sticker pack. Check your Firestore rules.");
    } finally {
      setBusyPack("");
    }
  };

  const removePack = async (pack) => {
    const packId = pack.packId || pack.id;
    setBusyPack(packId);
    setNotice("");

    try {
      await deleteDoc(doc(db, "users", user.uid, "stickerPacks", packId));
      if (selectedPack?.id === packId) setSelectedPack(null);
      setNotice("Sticker pack removed from your collection.");
    } catch (error) {
      console.error("Remove sticker pack:", error);
      setNotice("Couldn't remove this sticker pack.");
    } finally {
      setBusyPack("");
    }
  };

  const saveUploadedPack = async (event) => {
    event.preventDefault();

    const files = Array.from(uploadFiles);
    const name = packName.trim();

    if (!name) {
      setNotice("Give your sticker pack a name first.");
      return;
    }

    if (!files.length) {
      setNotice("Choose at least one PNG, WebP, or GIF sticker.");
      return;
    }

    if (files.length > 30) {
      setNotice("A sticker pack can contain up to 30 stickers.");
      return;
    }

    setUploading(true);
    setNotice("");

    try {
      const uploadedStickers = [];

      for (const file of files) {
        uploadedStickers.push({
          ...(await uploadSticker(file)),
          name: file.name.replace(/\.[^.]+$/, ""),
        });
      }

      const packRef = doc(collection(db, "stickerPacks"));
      const batch = writeBatch(db);
      const coverUrl = uploadedStickers[0].url;

      batch.set(packRef, {
        name,
        createdBy: user.uid,
        createdByName: profile?.name || user.displayName || "Tether user",
        coverUrl,
        stickerCount: uploadedStickers.length,
        visibility: "public",
        createdAt: serverTimestamp(),
      });

      uploadedStickers.forEach((sticker) => {
        const stickerRef = doc(
          collection(db, "stickerPacks", packRef.id, "stickers")
        );

        batch.set(stickerRef, {
          ...sticker,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      });

      batch.set(doc(db, "users", user.uid, "stickerPacks", packRef.id), {
        packId: packRef.id,
        name,
        coverUrl,
        ownerUid: user.uid,
        installedAt: serverTimestamp(),
      });

      await batch.commit();

      setPackName("");
      setUploadFiles([]);
      setShowCreatePack(false);
      setActiveTab("my");
      setNotice(`"${name}" is ready in your sticker collection.`);
    } catch (error) {
      console.error("Create sticker pack:", error);
      setNotice(error.message || "Couldn't create the sticker pack.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openPack = (pack) => {
    setSelectedPack(pack);
    setActiveTab("my");
    setNotice("");
    setSearch("");
  };

  const selectTab = (tab) => {
    setSelectedPack(null);
    setSearch("");
    setNotice("");
    setActiveTab(tab);
  };

  return (
    <div className="tether-sticker-picker" role="dialog" aria-label="Stickers">
      <div className="tether-sticker-header">
        <div>
          <strong>Stickers</strong>
          <span>Your sticker collection</span>
        </div>
        <button
          type="button"
          className="tether-sticker-close"
          onClick={onClose}
          aria-label="Close stickers"
        >
          ×
        </button>
      </div>

      <div className="tether-sticker-search">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            activeTab === "discover"
              ? "Search GIPHY stickers and packs"
              : "Search stickers and packs"
          }
          aria-label="Search stickers and packs"
        />
      </div>

      <div className="tether-sticker-tabs">
        <button
          type="button"
          className={activeTab === "recent" && !selectedPack ? "active" : ""}
          onClick={() => selectTab("recent")}
        >
          Recent
        </button>
        <button
          type="button"
          className={activeTab === "favorites" && !selectedPack ? "active" : ""}
          onClick={() => selectTab("favorites")}
        >
          Favorites
        </button>
        <button
          type="button"
          className={activeTab === "my" && !selectedPack ? "active" : ""}
          onClick={() => selectTab("my")}
        >
          My stickers
        </button>
        <button
          type="button"
          className={activeTab === "discover" ? "active" : ""}
          onClick={() => selectTab("discover")}
        >
          Discover
        </button>
      </div>

      {activeTab === "my" && !selectedPack && installed.length > 0 && (
        <div className="tether-sticker-installed-packs">
          {installed.map((pack) => (
            <button
              type="button"
              key={pack.id}
              className="tether-sticker-installed-pack"
              onClick={() =>
                setSelectedPack({
                  id: pack.packId || pack.id,
                  name: pack.name || "Sticker pack",
                })
              }
            >
              {pack.coverUrl ? (
                <img src={pack.coverUrl} alt="" />
              ) : (
                <span>✳</span>
              )}
              <span>{pack.name || "Sticker pack"}</span>
            </button>
          ))}
        </div>
      )}

      {selectedPack && (
        <div className="tether-sticker-pack-heading">
          <button type="button" onClick={() => setSelectedPack(null)}>
            ← Packs
          </button>
          <strong>{selectedPack.name}</strong>
          <button
            type="button"
            disabled={busyPack === selectedPack.id}
            onClick={() => removePack(selectedPack)}
          >
            Remove
          </button>
        </div>
      )}

      {activeTab === "discover" && !selectedPack ? (
        <div className="tether-sticker-discover">
          <div className="tether-sticker-giphy-heading">
            <div>
              <strong>{search.trim() ? "GIPHY results" : "Trending on GIPHY"}</strong>
              <span>Tap a sticker to send it</span>
            </div>
            <a
              href="https://giphy.com/"
              target="_blank"
              rel="noreferrer"
              className="tether-giphy-attribution"
            >
              Powered by GIPHY
            </a>
          </div>

          {giphyLoading ? (
            <div className="tether-sticker-status">Loading stickers…</div>
          ) : giphyError ? (
            <div className="tether-sticker-status tether-sticker-error">
              {giphyError}
            </div>
          ) : giphyStickers.length === 0 ? (
            <div className="tether-sticker-status">
              {search.trim()
                ? "No GIPHY stickers found. Try another search."
                : "No trending stickers are available right now."}
            </div>
          ) : (
            <div className="tether-sticker-grid tether-giphy-grid">
              {giphyStickers.map((sticker) => (
                <button
                  type="button"
                  className="tether-sticker-item"
                  key={sticker.id}
                  title={sticker.name}
                  onClick={() => chooseSticker(sticker)}
                >
                  <img
                    src={sticker.url}
                    alt={sticker.name}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="tether-sticker-discover-title tether-community-heading">
            <strong>Tether community packs</strong>
            <button type="button" onClick={() => setShowCreatePack(true)}>
              Create a pack
            </button>
          </div>

          {filteredPacks.length === 0 ? (
            <div className="tether-sticker-community-empty">
              No community packs found yet.
            </div>
          ) : (
            <div className="tether-sticker-pack-list">
              {filteredPacks.map((pack) => (
                <div className="tether-sticker-pack-card" key={pack.id}>
                  <button
                    type="button"
                    className="tether-sticker-pack-preview"
                    onClick={() => openPack(pack)}
                  >
                    {pack.coverUrl ? <img src={pack.coverUrl} alt="" /> : <span>✳</span>}
                  </button>
                  <div className="tether-sticker-pack-info">
                    <strong>{pack.name}</strong>
                    <small>{pack.stickerCount || 0} stickers</small>
                  </div>
                  <button
                    type="button"
                    className="tether-sticker-add-pack"
                    disabled={busyPack === pack.id}
                    onClick={() => installPack(pack)}
                  >
                    {busyPack === pack.id ? "Adding…" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="tether-sticker-grid">
          {visibleStickers.length === 0 ? (
            <div className="tether-sticker-empty">
              <span>✳</span>
              <strong>
                {activeTab === "recent"
                  ? "No recent stickers"
                  : activeTab === "favorites"
                  ? "No saved stickers yet"
                  : "Your collection is empty"}
              </strong>
              <p>
                {activeTab === "my"
                  ? "Add a pack from Discover to get started."
                  : "Stickers you use or save will appear here."}
              </p>
              {activeTab === "my" && (
                <button type="button" onClick={() => selectTab("discover")}>
                  Explore sticker packs
                </button>
              )}
            </div>
          ) : (
            visibleStickers.map((sticker) => (
              <button
                type="button"
                className="tether-sticker-item"
                key={sticker.id}
                title={sticker.name || "Send sticker"}
                onClick={() => chooseSticker(sticker)}
              >
                <img
                  src={sticker.url}
                  alt={sticker.name || "Sticker"}
                  loading="lazy"
                />
              </button>
            ))
          )}
        </div>
      )}

      {notice && <p className="tether-sticker-notice">{notice}</p>}

      {showCreatePack && (
        <div
          className="tether-sticker-modal-backdrop"
          onClick={() => !uploading && setShowCreatePack(false)}
        >
          <form
            className="tether-sticker-create-modal"
            onSubmit={saveUploadedPack}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tether-sticker-modal-heading">
              <strong>Create a sticker pack</strong>
              <button
                type="button"
                disabled={uploading}
                onClick={() => setShowCreatePack(false)}
              >
                ×
              </button>
            </div>

            <label>
              Pack name
              <input
                value={packName}
                onChange={(event) => setPackName(event.target.value)}
                maxLength={40}
                placeholder="e.g. Tiny moods"
                required
              />
            </label>

            <p className="tether-sticker-public-note">
              Packs you publish are visible to other signed-in Tether users.
              Only upload stickers you have permission to share.
            </p>

            <label>
              Choose stickers
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/webp,image/gif"
                multiple
                onChange={(event) => setUploadFiles(event.target.files)}
              />
              <small>PNG, WebP or GIF · up to 5 MB each · maximum 30</small>
            </label>

            {uploadFiles.length > 0 && (
              <p className="tether-sticker-file-count">
                {uploadFiles.length} sticker{uploadFiles.length === 1 ? "" : "s"} selected
              </p>
            )}

            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading stickers…" : "Create sticker pack"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
