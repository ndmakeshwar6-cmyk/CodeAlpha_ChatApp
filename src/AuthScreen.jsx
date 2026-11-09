
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

    if (
      c.includes("invalid-credential") ||
      c.includes("wrong-password") ||
      c.includes("user-not-found")
    ) return "Wrong email or password";

    if (c.includes("email-already-in-use"))
      return "That email already has an account";

    if (c.includes("weak-password"))
      return "Password is too weak";

    if (c.includes("invalid-email"))
      return "That email doesn't look right";

    if (c.includes("too-many-requests"))
      return "Too many tries. Please wait a bit";

    return e.message;
  };

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setInfo("");
    setPassword("");
    setConfirm("");
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

    if (!USERNAME_RE.test(uname))
      return setError("Username: 3-20 letters, numbers, _ or .");

    if (!email.trim()) return setError("Enter your email");

    if (password.length < 8)
      return setError("Password needs at least 8 characters");

    if (password !== confirm)
      return setError("Passwords do not match");

    setBusy(true);

    try {
      const taken = await getDoc(doc(db, "usernames", uname));

      if (taken.exists()) {
        setError("That username is taken");
        setBusy(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

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
        // The profile screen will ask for a username again.
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
      setInfo(
        "If that email has an account, a reset link is on its way. Check spam too."
      );
    } catch (e) {
      setError(friendly(e));
    }

    setBusy(false);
  };

  const passwordBox = (value, setValue, placeholder) => (
    <div className="auth-password">
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete={
          mode === "login" ? "current-password" : "new-password"
        }
      />

      <button
        type="button"
        className="auth-eye"
        onClick={() => setShow(!show)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );

  const heading = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Let's get you back in",
  };

  const subtitle = {
    login: "Your little corner of connection awaits.",
    register: "A little space to stay connected.",
    forgot: "We'll send you a link to reset your password.",
  };

  return (
    <main className="auth-screen">
      <div className="auth-decoration auth-decoration-one">♡</div>
      <div className="auth-decoration auth-decoration-two">✦</div>
      <div className="auth-decoration auth-decoration-three">♡</div>

      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">♡</div>
          <span>Tether</span>
        </div>

        <div className="auth-heading">
          <h1>{heading[mode]}</h1>
          <p>{subtitle[mode]}</p>
        </div>

        <div className="auth-form">
          {mode === "register" && (
            <>
              <label className="auth-label">Your name</label>
              <input
                className="auth-input"
                placeholder="What should we call you?"
                value={displayName}
                maxLength={30}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <label className="auth-label">Username</label>
              <input
                className="auth-input"
                placeholder="e.g. shilpa_123"
                value={username}
                maxLength={20}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase())
                }
              />
            </>
          )}

          <label className="auth-label">Email address</label>
          <input
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          {mode !== "forgot" && (
            <>
              <label className="auth-label">Password</label>
              {passwordBox(password, setPassword, "Enter your password")}
            </>
          )}

          {mode === "register" && (
            <>
              <label className="auth-label">Confirm password</label>
              {passwordBox(confirm, setConfirm, "Enter your password again")}
            </>
          )}

          {error && (
            <div className="auth-message auth-error">
              {error}
            </div>
          )}

          {info && (
            <div className="auth-message auth-info">
              {info}
            </div>
          )}

          {mode === "login" && (
            <>
              <button
                className="auth-primary"
                onClick={logIn}
                disabled={busy}
              >
                {busy ? "Logging in..." : "Log in"}
              </button>

              <button
                className="auth-text-button"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>

              <div className="auth-divider">
                <span />
                <small>NEW TO TETHER?</small>
                <span />
              </div>

              <button
                className="auth-secondary"
                onClick={() => switchMode("register")}
              >
                Create an account
                <span>→</span>
              </button>
            </>
          )}

          {mode === "register" && (
            <>
              <button
                className="auth-primary"
                onClick={register}
                disabled={busy}
              >
                {busy ? "Creating account..." : "Create account"}
              </button>

              <button
                className="auth-text-button"
                onClick={() => switchMode("login")}
              >
                Already have an account? Log in
              </button>
            </>
          )}

          {mode === "forgot" && (
            <>
              <button
                className="auth-primary"
                onClick={reset}
                disabled={busy}
              >
                {busy ? "Sending..." : "Send reset link"}
              </button>

              <button
                className="auth-text-button"
                onClick={() => switchMode("login")}
              >
                ← Back to log in
              </button>
            </>
          )}
        </div>

        <footer className="auth-footer">
          Made for the connections that matter <span>♡</span>
        </footer>
      </section>
    </main>
  );
}
