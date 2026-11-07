import { useState } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, runTransaction } from "firebase/firestore";

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const friendly = (e) => {
    const c = e.code || "";
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
      return "Wrong email or password";
    if (c.includes("email-already-in-use")) return "That email already has an account";
    if (c.includes("weak-password")) return "Password is too weak";
    if (c.includes("invalid-email")) return "That email doesn't look right";
    if (c.includes("too-many-requests")) return "Too many tries. Please wait a bit";
    return e.message;
  };

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setInfo("");
  };

  const logIn = async () => {
    setError("");
    setInfo("");
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(friendly(e));
    }
    setBusy(false);
  };

  const register = async () => {
    setError("");
    setInfo("");
    const uname = username.trim().toLowerCase();
    if (!displayName.trim()) return setError("Enter your name");
    if (!USERNAME_RE.test(uname)) return setError("Username: 3-20 letters, numbers, _ or .");
    if (password.length < 8) return setError("Password needs at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const taken = await getDoc(doc(db, "usernames", uname));
      if (taken.exists()) {
        setError("That username is taken");
        setBusy(false);
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, "usernames", uname);
          const snap = await tx.get(ref);
          if (snap.exists()) throw new Error("taken");
          tx.set(ref, { uid });
          tx.set(doc(db, "users", uid), {
            name: displayName.trim(),
            nameLower: displayName.trim().toLowerCase(),
            username: uname,
            usernameLower: uname,
            showEmail: false,
            email: "",
            interests: [],
            profileDone: false,
          });
        });
      } catch {
        /* the profile screen will ask for a username again */
      }
    } catch (e) {
      setError(friendly(e));
    }
    setBusy(false);
  };

  const reset = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Type your email first");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("If that email has an account, a reset link is on its way. Check spam too.");
    } catch (e) {
      setError(friendly(e));
    }
    setBusy(false);
  };

  const passwordBox = (value, setValue, placeholder) => (
    <div className="pw">
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" className="secondary" onClick={() => setShow(!show)}>
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );

  return (
    <div className="card">
      <h2>
        {mode === "login" && "Welcome back to Tether"}
        {mode === "register" && "Create your Tether account"}
        {mode === "forgot" && "Reset your password"}
      </h2>

      {mode === "register" && (
        <>
          <input placeholder="Display name" value={displayName} maxLength={30}
            onChange={(e) => setDisplayName(e.target.value)} />
          <input placeholder="Username (like shilpa_123)" value={username} maxLength={20}
            onChange={(e) => setUsername(e.target.value.toLowerCase())} />
        </>
      )}

      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />

      {mode !== "forgot" && passwordBox(password, setPassword, "Password")}
      {mode === "register" && passwordBox(confirm, setConfirm, "Confirm password")}

      {mode === "login" && (
        <>
          <button onClick={logIn} disabled={busy}>{busy ? "..." : "Log in"}</button>
          <button className="link" onClick={() => switchMode("forgot")}>Forgot password?</button>
          <button className="link" onClick={() => switchMode("register")}>New here? Create an account</button>
        </>
      )}

      {mode === "register" && (
        <>
          <button onClick={register} disabled={busy}>{busy ? "..." : "Create account"}</button>
          <button className="link" onClick={() => switchMode("login")}>I already have an account</button>
        </>
      )}

      {mode === "forgot" && (
        <>
          <button onClick={reset} disabled={busy}>{busy ? "..." : "Send reset link"}</button>
          <button className="link" onClick={() => switchMode("login")}>Back to log in</button>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {info && <p className="info">{info}</p>}
    </div>
  );
}