"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import {
  isAdmin,
  signInWithGoogle,
  signOutAdmin,
  watchAuth,
} from "@/lib/admin-auth";

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "denied"; email: string }
  | { status: "admin"; user: User };

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    watchAuth((user) => {
      if (cancelled) return;
      if (!user) setState({ status: "anon" });
      else if (isAdmin(user)) setState({ status: "admin", user });
      else setState({ status: "denied", email: user.email ?? "" });
    }).then((fn) => {
      if (cancelled) fn();
      else unsub = fn;
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  async function handleLogin() {
    setBusy(true);
    setError("");
    try {
      const user = await signInWithGoogle();
      if (!isAdmin(user)) {
        await signOutAdmin();
        setError(`접근 권한이 없는 계정입니다 (${user.email}). 관리자에게 문의하세요.`);
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === "auth/popup-closed-by-user"
          ? "로그인이 취소되었습니다."
          : "로그인에 실패했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return <div className="admin-center">불러오는 중…</div>;
  }

  if (state.status === "admin") {
    return (
      <>
        <div className="admin-userbar">
          <span>{state.user.email}</span>
          <button type="button" onClick={() => signOutAdmin()}>
            로그아웃
          </button>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="admin-center">
      <div className="admin-login-card">
        <h1>북슐랭 어드민</h1>
        <p>관리자 구글 계정으로 로그인해 주세요.</p>
        <button type="button" disabled={busy} onClick={handleLogin}>
          {busy ? "로그인 중…" : "Google 계정으로 로그인"}
        </button>
        {state.status === "denied" && !error && (
          <p className="admin-error">
            접근 권한이 없는 계정입니다 ({state.email}).{" "}
            <button type="button" className="admin-link" onClick={() => signOutAdmin()}>
              다른 계정으로 로그인
            </button>
          </p>
        )}
        {error && <p className="admin-error">{error}</p>}
      </div>
    </div>
  );
}
