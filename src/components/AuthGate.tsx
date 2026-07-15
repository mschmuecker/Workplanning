import { CalendarDays } from "lucide-react";
import { FormEvent, useState } from "react";

export function AuthGate({
  signIn,
  register,
  authError,
}: {
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  authError: string;
}) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await register(email, password, fullName);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="mark">
          <CalendarDays size={22} aria-hidden="true" />
        </div>
        <p className="eyebrow">Private workplan</p>
        <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p>
          Use an account to keep your weekly plan private and sync it through the
          Netlify backend.
        </p>

        {mode === "register" && (
          <label>
            <span>Name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}

        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>

        {authError && <p className="auth-error">{authError}</p>}

        <button className="primary-button auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Working" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          className="text-button"
          type="button"
          onClick={() => setMode((current) => (current === "signin" ? "register" : "signin"))}
        >
          {mode === "signin" ? "Create an account" : "Use an existing account"}
        </button>
      </form>
    </div>
  );
}
