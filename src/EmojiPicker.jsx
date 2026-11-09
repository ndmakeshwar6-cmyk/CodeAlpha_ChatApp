
import React, { useState } from "react";

const emojiGroups = {
  Smileys: [
    "😀", "😃", "😄", "😁", "😆", "🥹", "😂", "🤣",
    "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘",
    "😗", "😚", "😋", "😛", "😜", "🤪", "🤗", "🤭",
    "🫢", "🤫", "😎", "🥳", "😭", "🥺", "😤", "😴",
    "🤔", "🙄", "😳", "🥲", "😌", "🤍", "❤️", "💕"
  ],
  Gestures: [
    "👋", "🤚", "✋", "🖖", "👌", "🤌", "✌️", "🤞",
    "🫶", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇",
    "👍", "👎", "✊", "👊", "👏", "🙌", "👐", "🤝",
    "🙏", "💪", "🫂"
  ],
  Hearts: [
    "❤️", "🩷", "🧡", "💛", "💚", "💙", "🩵", "💜",
    "🤎", "🖤", "🩶", "🤍", "💔", "❣️", "💕", "💞",
    "💓", "💗", "💖", "💘", "💝", "💟"
  ],
  Animals: [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
    "🐨", "🐯", "🦁", "🐮", "🐸", "🐵", "🐧", "🐥",
    "🦋", "🐢", "🐬", "🐳", "🦄", "🐾"
  ],
  Food: [
    "🍎", "🍓", "🍒", "🍑", "🍉", "🍍", "🥑", "🍕",
    "🍔", "🍟", "🍿", "🍩", "🍪", "🎂", "🍰", "🧋",
    "☕", "🍫", "🍭", "🍜"
  ],
  Activities: [
    "⚽", "🏀", "🎮", "🎧", "🎨", "🎬", "🎤", "🎸",
    "🎉", "🎊", "🎁", "🎀", "✨", "⭐", "🌈", "🔥",
    "💫", "🌸", "🌷", "🌻", "🪻", "☀️", "🌙"
  ]
};

export default function EmojiPicker({ onSelect, onClose }) {
  const [category, setCategory] = useState("Smileys");

  return (
    <div
      className="emoji-picker"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="emoji-picker-head">
        <b>Emojis</b>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close emoji picker"
        >
          ×
        </button>
      </div>

      <div className="emoji-categories">
        {Object.keys(emojiGroups).map((name) => (
          <button
            type="button"
            key={name}
            className={category === name ? "active" : ""}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="emoji-grid">
        {emojiGroups[category].map((emoji, index) => (
          <button
            type="button"
            key={`${emoji}-${index}`}
            onClick={() => onSelect(emoji)}
            aria-label={`Insert ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
