type D1Rows<T> = { results?: T[] };
type PreparedStatement<T = Record<string, unknown>> = {
  bind: (...values: unknown[]) => PreparedStatement<T>;
  first: () => Promise<T | null>;
  all: () => Promise<D1Rows<T>>;
};

type FeedbackBindings = {
  DB?: { prepare: <T = Record<string, unknown>>(sql: string) => PreparedStatement<T> };
  FEEDBACK_FILES?: {
    get: (key: string) => Promise<{
      body: ReadableStream<Uint8Array>;
      httpMetadata?: { contentType?: string };
    } | null>;
  };
  FEEDBACK_ADMIN_TOKEN?: string;
};

type SubmissionRow = { id: string; created_at: string };
type MessageRow = { submission_id: string; ordinal: number; message: string };
type AttachmentRow = {
  submission_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  size: number;
};

function isAuthorized(request: Request, expected: string | undefined) {
  const authorization = request.headers.get("authorization") || "";
  return Boolean(expected && authorization === `Bearer ${expected}`);
}

export async function GET(request: Request) {
  try {
    const { env } = await import("cloudflare:workers");
    const bindings = env as unknown as FeedbackBindings;
    if (!isAuthorized(request, bindings.FEEDBACK_ADMIN_TOKEN)) {
      return Response.json({ error: "未授权访问。" }, { status: 401 });
    }
    if (!bindings.DB || !bindings.FEEDBACK_FILES) {
      return Response.json({ error: "反馈服务尚未初始化。" }, { status: 503 });
    }

    const url = new URL(request.url);
    const attachmentKey = url.searchParams.get("attachment");
    if (attachmentKey) {
      const metadata = await bindings.DB.prepare<AttachmentRow>(
        "SELECT submission_id, object_key, filename, content_type, size FROM feedback_attachments WHERE object_key = ?",
      ).bind(attachmentKey).first();
      if (!metadata) return Response.json({ error: "附件不存在。" }, { status: 404 });
      const object = await bindings.FEEDBACK_FILES.get(metadata.object_key);
      if (!object) return Response.json({ error: "附件文件不存在。" }, { status: 404 });
      return new Response(object.body, {
        headers: {
          "content-type": metadata.content_type || object.httpMetadata?.contentType || "application/octet-stream",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename)}`,
          "cache-control": "private, no-store",
        },
      });
    }

    const [submissionResult, messageResult, attachmentResult] = await Promise.all([
      bindings.DB.prepare<SubmissionRow>(
        "SELECT id, created_at FROM feedback_submissions ORDER BY created_at DESC LIMIT 100",
      ).all(),
      bindings.DB.prepare<MessageRow>(
        "SELECT submission_id, ordinal, message FROM feedback_messages ORDER BY submission_id, ordinal",
      ).all(),
      bindings.DB.prepare<AttachmentRow>(
        "SELECT submission_id, object_key, filename, content_type, size FROM feedback_attachments ORDER BY id",
      ).all(),
    ]);

    const messages = messageResult.results || [];
    const attachments = attachmentResult.results || [];
    const submissions = (submissionResult.results || []).map((submission) => ({
      id: submission.id,
      createdAt: submission.created_at,
      messages: messages
        .filter((message) => message.submission_id === submission.id)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((message) => message.message),
      attachments: attachments
        .filter((attachment) => attachment.submission_id === submission.id)
        .map((attachment) => ({
          key: attachment.object_key,
          filename: attachment.filename,
          contentType: attachment.content_type,
          size: attachment.size,
        })),
    }));

    return Response.json({ submissions }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "读取反馈失败，请稍后重试。" }, { status: 500 });
  }
}
