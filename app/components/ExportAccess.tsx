"use client";

import type { FormEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type ExportKind = "image" | "data";

export type ProtectedExport = {
  kind: ExportKind;
  label: string;
  perform: () => void | Promise<void>;
};

type AuthUser = {
  id: string;
  phone?: string;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
};

type AuthResponse = Partial<AuthSession> & {
  expires_in?: number;
  user?: AuthUser;
};

type QuotaResponse = {
  allowed: boolean;
  used: number;
  remaining: number;
};

type DialogView = "login" | "register" | "verify" | "account" | "limit" | "setup";

type ExportAccessValue = {
  requestExport: (request: ProtectedExport) => void;
  openAccount: () => void;
  signedIn: boolean;
  maskedPhone: string;
};

type AuthBuildEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

const AUTH_ENV = (import.meta as ImportMeta & { env?: AuthBuildEnv }).env || {};
const SUPABASE_URL = (AUTH_ENV.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = AUTH_ENV.VITE_SUPABASE_PUBLISHABLE_KEY || AUTH_ENV.VITE_SUPABASE_ANON_KEY || "";
const AUTH_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
const SESSION_STORAGE_KEY = "ccer-export-session-v1";

const ExportAccessContext = createContext<ExportAccessValue | null>(null);

const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  const digits = trimmed.replace(/\D/g, "");
  if (/^1\d{10}$/.test(digits)) return `+86${digits}`;
  if (/^861\d{10}$/.test(digits)) return `+${digits}`;
  return digits ? `+${digits}` : "";
};

const maskPhone = (phone = "") => {
  const local = phone.replace(/^\+86/, "");
  if (local.length < 7) return phone || "已登录";
  return `${local.slice(0, 3)}****${local.slice(-4)}`;
};

const responseError = async (response: Response) => {
  const payload = await response.json().catch(() => ({})) as {
    msg?: string;
    message?: string;
    error_description?: string;
    error?: string;
  };
  return payload.msg || payload.message || payload.error_description || payload.error || `请求失败（${response.status}）`;
};

const authRequest = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<AuthResponse>;
};

const toSession = (payload: AuthResponse): AuthSession | null => {
  if (!payload.access_token || !payload.refresh_token || !payload.user) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
    user: payload.user,
  };
};

export function ExportAccessProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<DialogView>(AUTH_CONFIGURED ? "login" : "setup");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const pendingRef = useRef<ProtectedExport | null>(null);

  const closeDialog = () => {
    if (busy) return;
    pendingRef.current = null;
    setDialogOpen(false);
  };

  useEffect(() => {
    if (!AUTH_CONFIGURED) return;
    let restoreTimer: number | undefined;
    try {
      const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as AuthSession;
      if (parsed.access_token && parsed.refresh_token && parsed.user?.id) {
        restoreTimer = window.setTimeout(() => setSession(parsed), 0);
      }
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return () => {
      if (restoreTimer != null) window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        pendingRef.current = null;
        setDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, dialogOpen]);

  const persistSession = (next: AuthSession | null) => {
    setSession(next);
    if (next) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const refreshSession = async (active: AuthSession) => {
    if (active.expires_at > Math.floor(Date.now() / 1000) + 60) return active;
    const refreshed = toSession(await authRequest("token?grant_type=refresh_token", {
      refresh_token: active.refresh_token,
    }));
    if (!refreshed) throw new Error("登录状态已失效，请重新登录。");
    persistSession(refreshed);
    return refreshed;
  };

  const claimQuota = async (active: AuthSession, request: ProtectedExport) => {
    const current = await refreshSession(active);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_export_quota`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${current.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requested_kind: request.kind, requested_label: request.label }),
    });
    if (response.status === 401) {
      persistSession(null);
      throw new Error("登录状态已失效，请重新登录。");
    }
    if (!response.ok) throw new Error(await responseError(response));
    return response.json() as Promise<QuotaResponse>;
  };

  const executeProtectedExport = async (request: ProtectedExport, active: AuthSession) => {
    setBusy(true);
    setMessage("");
    try {
      const quota = await claimQuota(active, request);
      setRemaining(quota.remaining);
      if (!quota.allowed) {
        setView("limit");
        setDialogOpen(true);
        return;
      }
      await request.perform();
      setDialogOpen(false);
    } catch (reason) {
      const errorMessage = reason instanceof Error ? reason.message : "导出授权失败，请稍后重试。";
      setMessage(errorMessage);
      setView(errorMessage.includes("登录状态已失效") ? "login" : "account");
      setDialogOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const finishAuthentication = (next: AuthSession) => {
    persistSession(next);
    setMessage("");
    setPassword("");
    setVerificationCode("");
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void executeProtectedExport(pending, next);
    else {
      setView("account");
      setDialogOpen(false);
    }
  };

  const requestExport = (request: ProtectedExport) => {
    if (!AUTH_CONFIGURED) {
      pendingRef.current = null;
      setView("setup");
      setMessage("");
      setDialogOpen(true);
      return;
    }
    if (!session) {
      pendingRef.current = request;
      setView("login");
      setMessage("登录后将继续本次导出。每个账号每天可导出 2 次。");
      setDialogOpen(true);
      return;
    }
    void executeProtectedExport(request, session);
  };

  const openAccount = () => {
    setMessage("");
    setView(!AUTH_CONFIGURED ? "setup" : session ? "account" : "login");
    setDialogOpen(true);
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const next = toSession(await authRequest("token?grant_type=password", {
        phone: normalizePhone(phone),
        password,
      }));
      if (!next) throw new Error("登录响应不完整，请稍后重试。");
      finishAuthentication(next);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "登录失败，请检查手机号和密码。");
    } finally {
      setBusy(false);
    }
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const normalized = normalizePhone(phone);
      if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("请输入有效手机号，中国大陆号码可直接输入 11 位数字。");
      if (password.length < 8) throw new Error("密码至少需要 8 位。");
      const payload = await authRequest("signup", { phone: normalized, password });
      const next = toSession(payload);
      if (next) finishAuthentication(next);
      else {
        setView("verify");
        setMessage("验证码已发送，请输入短信中的 6 位验证码完成注册。");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "注册失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const next = toSession(await authRequest("verify", {
        phone: normalizePhone(phone),
        token: verificationCode.trim(),
        type: "sms",
      }));
      if (!next) throw new Error("验证成功但未取得登录状态，请返回登录。");
      finishAuthentication(next);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "验证码无效或已过期。");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    persistSession(null);
    pendingRef.current = null;
    setRemaining(null);
    setView("login");
    setMessage("已退出登录。");
  };

  return (
    <ExportAccessContext.Provider
      value={{ requestExport, openAccount, signedIn: Boolean(session), maskedPhone: maskPhone(session?.user.phone) }}
    >
      {children}
      {dialogOpen ? (
        <div className="download-layer account-layer" role="presentation" onMouseDown={closeDialog}>
          <section
            className="download-dialog account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="download-dialog-head">
              <div>
                <div className="eyebrow">ACCOUNT ACCESS</div>
                <h2 id="account-dialog-title">
                  {view === "register" ? "注册导出账号" : view === "verify" ? "验证手机号" : view === "limit" ? "今日额度已用完" : view === "setup" ? "账号服务待启用" : session ? "导出账号" : "登录后导出"}
                </h2>
                <p>保存图片与下载数据合计每天 2 次，按 Asia/Shanghai 自然日重置。</p>
              </div>
              <button type="button" className="close-button" onClick={closeDialog} disabled={busy}>关闭</button>
            </div>

            {view === "setup" ? (
              <div className="account-notice">
                <strong>导出功能暂未开放</strong>
                <p>为避免前端计数被绕过，本站只在账号与服务端配额数据库配置完成后开放导出。</p>
              </div>
            ) : null}

            {view === "limit" ? (
              <div className="account-notice">
                <strong>今天的 2 次导出额度已经用完</strong>
                <p>额度将在北京时间次日 00:00 自动恢复。</p>
                <button type="button" className="account-secondary" onClick={closeDialog}>知道了</button>
              </div>
            ) : null}

            {view === "account" && session ? (
              <div className="account-notice account-summary">
                <strong>{maskPhone(session.user.phone)}</strong>
                <p>{remaining == null ? "导出时将实时核验今日剩余额度。" : `今天还可导出 ${remaining} 次。`}</p>
                <button type="button" className="account-secondary" onClick={signOut}>退出登录</button>
              </div>
            ) : null}

            {view === "login" ? (
              <form className="account-form" onSubmit={submitLogin}>
                <label><span>手机号</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
                <label><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "登录中…" : "登录"}</button>
                <button type="button" className="account-text-button" onClick={() => { setView("register"); setMessage(""); }}>没有账号？注册</button>
              </form>
            ) : null}

            {view === "register" ? (
              <form className="account-form" onSubmit={submitRegistration}>
                <label><span>手机号</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
                <label><span>设置密码</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "正在发送…" : "注册并获取验证码"}</button>
                <button type="button" className="account-text-button" onClick={() => { setView("login"); setMessage(""); }}>已有账号？返回登录</button>
              </form>
            ) : null}

            {view === "verify" ? (
              <form className="account-form" onSubmit={submitVerification}>
                <label><span>短信验证码</span><input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} required /></label>
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "验证中…" : "验证并登录"}</button>
                <button type="button" className="account-text-button" onClick={() => { setView("register"); setMessage(""); }}>重新填写手机号</button>
              </form>
            ) : null}

            {message ? <p className="account-message" role="status">{message}</p> : null}
          </section>
        </div>
      ) : null}
    </ExportAccessContext.Provider>
  );
}

export function useExportAccess() {
  const value = useContext(ExportAccessContext);
  if (!value) throw new Error("ExportAccessProvider is required for protected exports.");
  return value;
}

export function AccountAccessButton() {
  const { maskedPhone, openAccount, signedIn } = useExportAccess();
  return (
    <button type="button" className={signedIn ? "account-trigger signed-in" : "account-trigger"} onClick={openAccount}>
      {signedIn ? maskedPhone : "登录 / 注册"}
    </button>
  );
}
