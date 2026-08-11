"use client";

import type { FormEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type ExportKind = "image" | "data";

export type PreparedExport = {
  blob: Blob;
  fileName: string;
};

export type ProtectedExport = {
  kind: ExportKind;
  label: string;
  prepare: () => PreparedExport | Promise<PreparedExport>;
};

type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
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

type AccessInfo = {
  plan_code: string;
  plan_name: string;
  daily_limit: number;
  used: number;
  remaining: number;
};

type ExportResponse = AccessInfo & {
  allowed: boolean;
  signed_url?: string;
  expires_in?: number;
  message?: string;
};

type DialogView =
  | "login"
  | "register"
  | "verifyEmail"
  | "recover"
  | "recoverySent"
  | "resetPassword"
  | "account"
  | "limit"
  | "setup";

type ExportAccessValue = {
  requestExport: (request: ProtectedExport) => void;
  openAccount: () => void;
  signOut: () => void;
  signedIn: boolean;
  accountEmail: string;
  remaining: number | null;
};

type AuthBuildEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_TURNSTILE_SITE_KEY?: string;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const AUTH_ENV = (import.meta as ImportMeta & { env?: AuthBuildEnv }).env || {};
const SUPABASE_URL = (AUTH_ENV.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = AUTH_ENV.VITE_SUPABASE_PUBLISHABLE_KEY || AUTH_ENV.VITE_SUPABASE_ANON_KEY || "";
const TURNSTILE_SITE_KEY = AUTH_ENV.VITE_TURNSTILE_SITE_KEY || "";
const AUTH_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
const SESSION_STORAGE_KEY = "ccer-export-session-v2";
const LEGACY_SESSION_STORAGE_KEY = "ccer-export-session-v1";
const PRIVATE_EXPORT_ENDPOINT = `${SUPABASE_URL}/functions/v1/export-download`;
const MAX_EXPORT_BYTES = 12 * 1024 * 1024;

const ExportAccessContext = createContext<ExportAccessValue | null>(null);

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const maskEmail = (email = "") => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email || "已登录";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
};

const translateAuthMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (normalized.includes("email not confirmed")) return "邮箱尚未验证，请先打开验证邮件完成确认。";
  if (normalized.includes("user already registered")) return "该邮箱已经注册，请直接登录或找回密码。";
  if (normalized.includes("password should be")) return "密码强度不足，请至少使用 8 位字符。";
  if (normalized.includes("rate limit") || normalized.includes("security purposes")) return "请求过于频繁，请稍后再试。";
  if (normalized.includes("captcha")) return "安全验证失败或已过期，请重新验证。";
  return message;
};

const responseError = async (response: Response) => {
  const payload = await response.json().catch(() => ({})) as {
    msg?: string;
    message?: string;
    error_description?: string;
    error?: string;
  };
  const message = payload.msg || payload.message || payload.error_description || payload.error;
  return translateAuthMessage(message || `请求失败（${response.status}）`);
};

const authRequest = async <T,>(
  path: string,
  body?: Record<string, unknown>,
  options: { method?: "GET" | "POST" | "PUT"; token?: string } = {},
) => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: options.method || "POST",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${options.token || SUPABASE_KEY}`,
      "content-type": "application/json",
    },
    body: options.method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  if (!response.ok) throw new Error(await responseError(response));
  if (response.status === 204) return {} as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
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

const storedSession = () => {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed.access_token && parsed.refresh_token && parsed.user?.id ? parsed : null;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

const saveStoredSession = (session: AuthSession | null) => {
  if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
};

const redirectUrl = () => `${window.location.origin}${window.location.pathname}`;

const captchaBody = (token: string) => token
  ? { gotrue_meta_security: { captcha_token: token } }
  : {};

const triggerSignedDownload = (url: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

function TurnstileWidget({ action, onToken }: { action: string; onToken: (token: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const callbackRef = useRef(onToken);

  useEffect(() => {
    callbackRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !hostRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !hostRef.current || !window.turnstile || widgetRef.current) return;
      widgetRef.current = window.turnstile.render(hostRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        theme: "light",
        language: "zh-cn",
        callback: (token: string) => callbackRef.current(token),
        "expired-callback": () => callbackRef.current(""),
        "error-callback": () => callbackRef.current(""),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-ccer-turnstile="true"]');
    if (window.turnstile) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.ccerTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      existing?.removeEventListener("load", render);
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [action]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div className="turnstile-host" ref={hostRef} aria-label="Cloudflare Turnstile 安全验证" />;
}

export function ExportAccessProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<DialogView>(AUTH_CONFIGURED ? "login" : "setup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const pendingRef = useRef<ProtectedExport | null>(null);

  const updateMessage = (value: string, tone: "info" | "error" = "info") => {
    setMessage(value);
    setMessageTone(tone);
  };

  const persistSession = (next: AuthSession | null) => {
    setSession(next);
    saveStoredSession(next);
  };

  const closeDialog = () => {
    if (busy) return;
    pendingRef.current = null;
    setDialogOpen(false);
  };

  const changeView = (next: DialogView) => {
    setView(next);
    setPassword("");
    setConfirmPassword("");
    setCaptchaToken("");
    updateMessage("");
  };

  useEffect(() => {
    if (!AUTH_CONFIGURED) return;
    let cancelled = false;
    const restore = async () => {
      window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const callbackError = hash.get("error_description") || hash.get("error");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const callbackType = hash.get("type");
      if (callbackError || (accessToken && refreshToken)) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      }
      if (callbackError) {
        if (!cancelled) {
          setView("login");
          setDialogOpen(true);
          updateMessage(translateAuthMessage(callbackError), "error");
        }
        return;
      }
      if (accessToken && refreshToken) {
        try {
          const user = await authRequest<AuthUser>("user", undefined, { method: "GET", token: accessToken });
          const next = toSession({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: Number(hash.get("expires_in") || 3600),
            user,
          });
          if (!next || cancelled) return;
          saveStoredSession(next);
          setSession(next);
          setEmail(next.user.email || "");
          setView(callbackType === "recovery" ? "resetPassword" : "account");
          setDialogOpen(true);
          updateMessage(
            callbackType === "recovery" ? "身份验证完成，请设置新密码。" : "邮箱验证完成，账号已登录。",
          );
        } catch (reason) {
          if (!cancelled) {
            setView("login");
            setDialogOpen(true);
            updateMessage(reason instanceof Error ? reason.message : "验证链接无效或已过期。", "error");
          }
        }
        return;
      }
      const restored = storedSession();
      if (restored && !cancelled) {
        setSession(restored);
        setEmail(restored.user.email || "");
      }
    };
    void restore();
    return () => {
      cancelled = true;
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

  const refreshSession = async (active: AuthSession) => {
    if (active.expires_at > Math.floor(Date.now() / 1000) + 60) return active;
    const refreshed = toSession(await authRequest<AuthResponse>("token?grant_type=refresh_token", {
      refresh_token: active.refresh_token,
    }));
    if (!refreshed) throw new Error("登录状态已失效，请重新登录。");
    persistSession(refreshed);
    return refreshed;
  };

  const fetchAccessInfo = async (active: AuthSession) => {
    const current = await refreshSession(active);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_export_access`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${current.access_token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (response.status === 401) {
      persistSession(null);
      throw new Error("登录状态已失效，请重新登录。");
    }
    if (!response.ok) throw new Error(await responseError(response));
    const info = await response.json() as AccessInfo;
    setAccessInfo(info);
    return { current, info };
  };

  const executeProtectedExport = async (request: ProtectedExport, active: AuthSession) => {
    setBusy(true);
    updateMessage("");
    try {
      const current = await refreshSession(active);
      const prepared = await request.prepare();
      if (!prepared.blob.size) throw new Error("导出文件为空，无法下载。");
      if (prepared.blob.size > MAX_EXPORT_BYTES) throw new Error("导出文件超过 12 MB，请缩小筛选范围后重试。");
      const response = await fetch(PRIVATE_EXPORT_ENDPOINT, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          authorization: `Bearer ${current.access_token}`,
          "content-type": prepared.blob.type || "application/octet-stream",
          "x-export-kind": request.kind,
          "x-export-label": encodeURIComponent(request.label),
          "x-file-name": encodeURIComponent(prepared.fileName),
        },
        body: prepared.blob,
      });
      if (response.status === 401) {
        persistSession(null);
        throw new Error("登录状态已失效，请重新登录。");
      }
      const payload = await response.json().catch(() => ({})) as Partial<ExportResponse>;
      if (typeof payload.remaining === "number") {
        setAccessInfo({
          plan_code: payload.plan_code || "free",
          plan_name: payload.plan_name || "免费用户",
          daily_limit: payload.daily_limit ?? 2,
          used: payload.used ?? 0,
          remaining: payload.remaining,
        });
      }
      if (response.status === 429 || payload.allowed === false) {
        setView("limit");
        setDialogOpen(true);
        return;
      }
      if (!response.ok || !payload.signed_url) {
        throw new Error(payload.message || await responseError(response));
      }
      triggerSignedDownload(payload.signed_url, prepared.fileName);
      setDialogOpen(false);
    } catch (reason) {
      const errorMessage = reason instanceof Error ? reason.message : "导出授权失败，请稍后重试。";
      updateMessage(errorMessage, "error");
      setView(errorMessage.includes("登录状态已失效") ? "login" : "account");
      setDialogOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const finishAuthentication = (next: AuthSession) => {
    persistSession(next);
    setEmail(next.user.email || email);
    setPassword("");
    setConfirmPassword("");
    setCaptchaToken("");
    updateMessage("");
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void executeProtectedExport(pending, next);
    else {
      setView("account");
      setDialogOpen(false);
      void fetchAccessInfo(next).catch(() => undefined);
    }
  };

  const requestExport = (request: ProtectedExport) => {
    if (!AUTH_CONFIGURED) {
      pendingRef.current = null;
      setView("setup");
      updateMessage("");
      setDialogOpen(true);
      return;
    }
    if (!session) {
      pendingRef.current = request;
      setView("login");
      updateMessage("登录后将继续本次导出。免费账号每天可导出 2 次。");
      setDialogOpen(true);
      return;
    }
    void executeProtectedExport(request, session);
  };

  const openAccount = () => {
    updateMessage("");
    setView(!AUTH_CONFIGURED ? "setup" : session ? "account" : "login");
    setDialogOpen(true);
    if (session) void fetchAccessInfo(session).catch((reason) => {
      updateMessage(reason instanceof Error ? reason.message : "账户信息读取失败。", "error");
    });
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    updateMessage("");
    try {
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized)) throw new Error("请输入有效邮箱地址。");
      const next = toSession(await authRequest<AuthResponse>("token?grant_type=password", {
        email: normalized,
        password,
      }));
      if (!next) throw new Error("登录响应不完整，请稍后重试。");
      finishAuthentication(next);
    } catch (reason) {
      updateMessage(reason instanceof Error ? reason.message : "登录失败，请检查邮箱和密码。", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    updateMessage("");
    try {
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized)) throw new Error("请输入有效邮箱地址。");
      if (password.length < 8) throw new Error("密码至少需要 8 位。");
      if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
      if (TURNSTILE_SITE_KEY && !captchaToken) throw new Error("请先完成安全验证。");
      const payload = await authRequest<AuthResponse>(
        `signup?redirect_to=${encodeURIComponent(redirectUrl())}`,
        { email: normalized, password, ...captchaBody(captchaToken) },
      );
      const next = toSession(payload);
      if (next) finishAuthentication(next);
      else {
        setEmail(normalized);
        setPassword("");
        setConfirmPassword("");
        setCaptchaToken("");
        setView("verifyEmail");
        updateMessage("验证邮件已发送，请打开邮件中的链接完成注册。");
      }
    } catch (reason) {
      setCaptchaToken("");
      updateMessage(reason instanceof Error ? reason.message : "注册失败，请稍后重试。", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitResendVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    updateMessage("");
    try {
      if (TURNSTILE_SITE_KEY && !captchaToken) throw new Error("请先完成安全验证。");
      await authRequest<Record<string, unknown>>(
        `resend?redirect_to=${encodeURIComponent(redirectUrl())}`,
        { type: "signup", email: normalizeEmail(email), ...captchaBody(captchaToken) },
      );
      setCaptchaToken("");
      updateMessage("新的验证邮件已发送，请检查收件箱和垃圾邮件目录。");
    } catch (reason) {
      setCaptchaToken("");
      updateMessage(reason instanceof Error ? reason.message : "验证邮件发送失败。", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitRecoveryRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    updateMessage("");
    try {
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized)) throw new Error("请输入有效邮箱地址。");
      if (TURNSTILE_SITE_KEY && !captchaToken) throw new Error("请先完成安全验证。");
      await authRequest<Record<string, unknown>>(
        `recover?redirect_to=${encodeURIComponent(redirectUrl())}`,
        { email: normalized, ...captchaBody(captchaToken) },
      );
      setEmail(normalized);
      setCaptchaToken("");
      setView("recoverySent");
      updateMessage("密码重置邮件已发送，请通过邮件中的安全链接设置新密码。");
    } catch (reason) {
      setCaptchaToken("");
      updateMessage(reason instanceof Error ? reason.message : "重置邮件发送失败。", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      changeView("recover");
      updateMessage("重置会话已失效，请重新发送密码重置邮件。", "error");
      return;
    }
    setBusy(true);
    updateMessage("");
    try {
      if (password.length < 8) throw new Error("新密码至少需要 8 位。");
      if (password !== confirmPassword) throw new Error("两次输入的新密码不一致。");
      await authRequest<AuthUser>("user", { password }, { method: "PUT", token: session.access_token });
      setPassword("");
      setConfirmPassword("");
      setView("account");
      updateMessage("密码已更新，后续可直接使用邮箱和新密码登录。");
      void fetchAccessInfo(session).catch(() => undefined);
    } catch (reason) {
      updateMessage(reason instanceof Error ? reason.message : "密码更新失败。", "error");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    const active = session;
    persistSession(null);
    setAccessInfo(null);
    pendingRef.current = null;
    setView("login");
    updateMessage("已退出登录。");
    if (active) void authRequest<Record<string, unknown>>("logout", {}, { token: active.access_token }).catch(() => undefined);
  };

  const dailyLimit = accessInfo?.daily_limit ?? 2;
  const title = view === "register"
    ? "注册导出账号"
    : view === "verifyEmail"
      ? "验证注册邮箱"
      : view === "recover" || view === "recoverySent"
        ? "找回密码"
        : view === "resetPassword"
          ? "设置新密码"
          : view === "limit"
            ? "今日额度已用完"
            : view === "setup"
              ? "账号服务待启用"
              : session
                ? "账户"
                : "登录后导出";

  return (
    <ExportAccessContext.Provider
      value={{
        requestExport,
        openAccount,
        signOut,
        signedIn: Boolean(session),
        accountEmail: session?.user.email || email,
        remaining: accessInfo?.remaining ?? null,
      }}
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
                <h2 id="account-dialog-title">{title}</h2>
                <p>免费账号每天可保存图片或下载数据 2 次，按 Asia/Shanghai 自然日重置。</p>
              </div>
              <button type="button" className="close-button" onClick={closeDialog} disabled={busy}>关闭</button>
            </div>

            {view === "setup" ? (
              <div className="account-notice">
                <strong>导出功能暂未开放</strong>
                <p>本站仅在邮箱认证、私有文件存储和服务端配额校验全部可用后开放导出。</p>
              </div>
            ) : null}

            {view === "limit" ? (
              <div className="account-notice">
                <strong>今天的 {dailyLimit} 次导出额度已经用完</strong>
                <p>额度将在北京时间次日 00:00 自动恢复。</p>
                <button type="button" className="account-secondary" onClick={closeDialog}>知道了</button>
              </div>
            ) : null}

            {view === "account" && session ? (
              <div className="account-notice account-summary">
                <dl>
                  <div><dt>账户邮箱</dt><dd>{session.user.email || email}</dd></div>
                  <div><dt>账户类型</dt><dd>{accessInfo?.plan_name || "免费用户"}</dd></div>
                  <div><dt>今日剩余</dt><dd>{accessInfo ? `${accessInfo.remaining} / ${accessInfo.daily_limit} 次` : "正在读取…"}</dd></div>
                </dl>
                <button type="button" className="account-secondary" onClick={signOut}>退出登录</button>
              </div>
            ) : null}

            {view === "login" ? (
              <form className="account-form" onSubmit={submitLogin}>
                <label><span>邮箱</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "登录中…" : "登录"}</button>
                <div className="account-form-links">
                  <button type="button" className="account-text-button" onClick={() => changeView("register")}>没有账号？注册</button>
                  <button type="button" className="account-text-button" onClick={() => changeView("recover")}>忘记密码</button>
                </div>
              </form>
            ) : null}

            {view === "register" ? (
              <form className="account-form" onSubmit={submitRegistration}>
                <label><span>邮箱</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label><span>设置密码</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                <label><span>再次确认密码</span><input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
                <TurnstileWidget action="signup" onToken={setCaptchaToken} />
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "正在提交…" : "注册并发送验证邮件"}</button>
                <button type="button" className="account-text-button" onClick={() => changeView("login")}>已有账号？返回登录</button>
              </form>
            ) : null}

            {view === "verifyEmail" ? (
              <form className="account-notice account-verification" onSubmit={submitResendVerification}>
                <strong>验证邮件已发送至 {email}</strong>
                <p>打开邮件中的验证链接后，账号才会正式生效。若未收到，请检查垃圾邮件目录。</p>
                <TurnstileWidget action="resend-signup" onToken={setCaptchaToken} />
                <button className="account-secondary" type="submit" disabled={busy}>{busy ? "发送中…" : "重新发送验证邮件"}</button>
                <button type="button" className="account-text-button" onClick={() => changeView("login")}>返回登录</button>
              </form>
            ) : null}

            {view === "recover" ? (
              <form className="account-form" onSubmit={submitRecoveryRequest}>
                <label><span>注册邮箱</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <TurnstileWidget action="recover" onToken={setCaptchaToken} />
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "正在发送…" : "发送密码重置邮件"}</button>
                <button type="button" className="account-text-button" onClick={() => changeView("login")}>返回登录</button>
              </form>
            ) : null}

            {view === "recoverySent" ? (
              <div className="account-notice account-verification">
                <strong>请检查 {email}</strong>
                <p>通过邮件中的安全链接返回本站后，即可设置新密码。链接过期后可重新申请。</p>
                <button type="button" className="account-secondary" onClick={() => changeView("recover")}>重新发送</button>
                <button type="button" className="account-text-button" onClick={() => changeView("login")}>返回登录</button>
              </div>
            ) : null}

            {view === "resetPassword" ? (
              <form className="account-form" onSubmit={submitPasswordReset}>
                <label><span>新密码</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                <label><span>再次确认新密码</span><input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
                <button className="download-primary" type="submit" disabled={busy}>{busy ? "正在更新…" : "保存新密码"}</button>
              </form>
            ) : null}

            {message ? <p className={`account-message ${messageTone}`} role="status">{message}</p> : null}
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
  const { accountEmail, openAccount, signOut, signedIn } = useExportAccess();
  if (!signedIn) {
    return <button type="button" className="account-trigger" onClick={openAccount}>登录 / 注册</button>;
  }
  return (
    <div className="account-header-status" aria-label="用户登录状态">
      <span title={accountEmail}><i aria-hidden="true" />{maskEmail(accountEmail)}</span>
      <button type="button" onClick={openAccount}>账户</button>
      <button type="button" onClick={signOut}>退出登录</button>
    </div>
  );
}
