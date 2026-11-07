export default function Avatar({ src, name, size = 36 }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  return src ? (
    <img src={src} alt={name} className="avatar" style={style} />
  ) : (
    <div className="avatar fallback" style={style}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}