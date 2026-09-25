import { LogOut, Trash2, UserRound, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";
import { account, deleteAccount, forgotPassword, resetPassword, signIn, signOut, signUp } from "@/lib/account";
import { myList, useStore } from "@/lib/catalog";

type Mode = "signin" | "signup" | "forgot";

export function AccountSheet({ onClose, initial = "signin" }: { onClose: () => void; initial?: Mode }) {
  const { user } = useStore(account);
  const [mode, setMode] = useState<Mode>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const saved = useStore(myList).length;
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) });

  const run = async (e: FormEvent, work: () => Promise<unknown>, done?: string) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await work();
      if (done) { toast(done); onClose(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const body = user ? <>
    <div className="acct-card"><UserRound size={28} /><div><strong>{user.name || user.email}</strong><span>{user.email}</span></div></div>
    <p className="sheet-text">My List ({saved}), Continue watching and your settings are saved to this account. Sign in on your phone, laptop or TV to pick up where you left off.</p>
    <div className="sheet-actions">
      <button className="btn btn-light" onClick={() => signOut().then(() => { toast("Signed out"); onClose(); })}><LogOut size={18} /> Sign out</button>
      <button className="btn btn-ghost" onClick={() => {
        if (window.confirm("Delete your YokoTV account? Your synced list and settings are erased from our server. This can't be undone.")) deleteAccount().then(() => { toast("Account deleted"); onClose(); });
      }}><Trash2 size={18} /> Delete account</button>
    </div>
  </> : mode === "forgot" ? (sent
    ? <p className="sheet-text">If there's an account for <b>{form.email}</b>, we've emailed it a reset link. It works for one hour. Check your spam folder if you don't see it.</p>
    : <form className="acct-form" onSubmit={(e) => run(e, async () => { await forgotPassword(form.email); setSent(true); })}>
      <p className="sheet-text">Enter your email and we'll send you a link to set a new password.</p>
      <label>Email<input type="email" autoComplete="email" required autoFocus {...field("email")} /></label>
      {error && <p className="acct-error">{error}</p>}
      <button className="btn btn-light btn-block" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      <button type="button" className="acct-link" onClick={() => setMode("signin")}>Back to sign in</button>
    </form>)
  : <form className="acct-form" onSubmit={(e) => run(e, () => mode === "signup" ? signUp(form.email, form.password, form.name) : signIn(form.email, form.password), mode === "signup" ? "Welcome to YokoTV! Your list now syncs across devices." : "Signed in")}>
      <p className="sheet-text">{mode === "signup" ? "Free, and optional. An account keeps My List, Continue watching and your settings in sync on every device." : "Sign in to sync My List and Continue watching across your devices."}</p>
      {mode === "signup" && <label>Name <em>(optional)</em><input autoComplete="name" maxLength={60} {...field("name")} /></label>}
      <label>Email<input type="email" autoComplete="email" required autoFocus {...field("email")} /></label>
      <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required {...field("password")} />
        {mode === "signup" && <small>At least 8 characters.</small>}</label>
      {error && <p className="acct-error">{error}</p>}
      <button className="btn btn-light btn-block" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create free account" : "Sign in"}</button>
      {mode === "signin" && <button type="button" className="acct-link" onClick={() => { setMode("forgot"); setError(""); }}>Forgot your password?</button>}
      <p className="acct-switch">{mode === "signup" ? "Already have an account?" : "New to YokoTV?"}{" "}
        <button type="button" className="acct-link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>{mode === "signup" ? "Sign in" : "Create a free account"}</button></p>
      {mode === "signup" && <p className="acct-fine">By creating an account you agree to our <Link href="/privacy" onClick={onClose}>privacy policy</Link>.</p>}
    </form>;

  const title = user ? "Your account" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in";
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <div className="sheet-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={22} /></button></div>
      {body}
    </div>
  </div>;
}

export function ResetScreen() {
  const token = new URLSearchParams(useSearch()).get("token") || "";
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await resetPassword(token, password);
      toast("Password changed. You're signed in.");
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="app"><div className="state">
    <form className="acct-form narrow" onSubmit={submit}>
      <h2>Choose a new password</h2>
      <label>New password<input type="password" autoComplete="new-password" minLength={8} required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /><small>At least 8 characters.</small></label>
      {error && <p className="acct-error">{error}</p>}
      <button className="btn btn-light btn-block" disabled={busy || !token}>{busy ? "Saving…" : "Save password"}</button>
      {!token && <p className="acct-error">This link is missing its reset code. Open the link from the email again.</p>}
    </form>
  </div></div>;
}
