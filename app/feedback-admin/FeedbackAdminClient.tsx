"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type FeedbackSubmission = {
  id: string;
  createdAt: string;
  messages: string[];
  attachments: Array<{ key: string; filename: string; contentType: string; size: number }>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FeedbackAdminClient() {
  const [token, setToken] = useState("");
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");

  const loadFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/feedback-admin", {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { submissions?: FeedbackSubmission[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "读取反馈失败。");
      setSubmissions(payload.submissions || []);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "读取反馈失败。");
    }
  };

  const downloadAttachment = async (attachment: FeedbackSubmission["attachments"][number]) => {
    setMessage("");
    try {
      const response = await fetch(`/api/feedback-admin?attachment=${encodeURIComponent(attachment.key)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "附件下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "附件下载失败。");
    }
  };

  return (
    <main className="feedback-admin-shell">
      <header>
        <div className="eyebrow">PRIVATE FEEDBACK</div>
        <h1>建议反馈管理</h1>
        <p>该页面仅通过管理员口令读取反馈文字与附件。口令不会保存在浏览器中。</p>
        <Link href="/">返回 CCER 信息追踪</Link>
      </header>

      <form className="feedback-admin-login" onSubmit={loadFeedback}>
        <label>
          <span>管理员口令</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "正在读取…" : "查看反馈"}
        </button>
      </form>

      {message ? <p className="form-error" role="alert">{message}</p> : null}
      {status === "ready" ? (
        <section className="feedback-admin-list" aria-live="polite">
          <div className="feedback-admin-summary">共 {submissions.length} 次提交</div>
          {submissions.length ? submissions.map((submission) => (
            <article key={submission.id}>
              <div className="feedback-admin-meta">
                <strong>{submission.createdAt.replace("T", " ")}</strong>
                <span>{submission.messages.length} 条建议 · {submission.attachments.length} 个附件</span>
              </div>
              <ol>
                {submission.messages.map((item, index) => <li key={`${submission.id}-${index}`}>{item}</li>)}
              </ol>
              {submission.attachments.length ? (
                <div className="feedback-admin-files">
                  {submission.attachments.map((attachment) => (
                    <button key={attachment.key} type="button" onClick={() => downloadAttachment(attachment)}>
                      {attachment.filename} · {formatBytes(attachment.size)}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          )) : <div className="empty-state">暂未收到反馈。</div>}
        </section>
      ) : null}
    </main>
  );
}
