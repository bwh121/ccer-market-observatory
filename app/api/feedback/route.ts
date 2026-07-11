type PreparedStatement = {
  bind: (...values: unknown[]) => PreparedStatement;
  run: () => Promise<unknown>;
};

type FeedbackBindings = {
  DB?: {
    prepare: (sql: string) => PreparedStatement;
    batch: (statements: PreparedStatement[]) => Promise<unknown>;
  };
  FEEDBACK_FILES?: {
    put: (
      key: string,
      value: ReadableStream<Uint8Array>,
      options?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>;
    delete: (key: string) => Promise<unknown>;
  };
};

const MAX_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function safeFilename(filename: string) {
  return filename.replace(/[\\/\u0000-\u001f\u007f]+/g, "_").slice(0, 180) || "attachment";
}

export async function POST(request: Request) {
  const uploadedKeys: string[] = [];
  try {
    const { env } = await import("cloudflare:workers");
    const bindings = env as unknown as FeedbackBindings;
    if (!bindings.DB || !bindings.FEEDBACK_FILES) {
      return Response.json({ error: "反馈服务正在初始化，请稍后重试。" }, { status: 503 });
    }

    const form = await request.formData();
    const messages = form
      .getAll("message")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    const attachments = form
      .getAll("attachments")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!messages.length || messages.length > MAX_MESSAGES) {
      return Response.json({ error: `请填写 1—${MAX_MESSAGES} 条建议。` }, { status: 400 });
    }
    if (messages.some((message) => message.length > MAX_MESSAGE_LENGTH)) {
      return Response.json({ error: `每条建议不能超过 ${MAX_MESSAGE_LENGTH} 字。` }, { status: 400 });
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      return Response.json({ error: `附件最多上传 ${MAX_ATTACHMENTS} 个。` }, { status: 400 });
    }
    if (attachments.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      return Response.json({ error: "单个附件不能超过 8 MB。" }, { status: 400 });
    }
    if (attachments.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
      return Response.json({ error: "附件总大小不能超过 20 MB。" }, { status: 400 });
    }

    const submissionId = crypto.randomUUID();
    const attachmentRows: Array<{
      key: string;
      filename: string;
      contentType: string;
      size: number;
    }> = [];

    for (const file of attachments) {
      const filename = safeFilename(file.name);
      const key = `feedback/${submissionId}/${crypto.randomUUID()}-${filename}`;
      await bindings.FEEDBACK_FILES.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      uploadedKeys.push(key);
      attachmentRows.push({
        key,
        filename,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
    }

    const statements: PreparedStatement[] = [
      bindings.DB.prepare("INSERT INTO feedback_submissions (id, user_agent) VALUES (?, ?)").bind(
        submissionId,
        (request.headers.get("user-agent") || "").slice(0, 300),
      ),
      ...messages.map((message, index) =>
        bindings.DB!.prepare(
          "INSERT INTO feedback_messages (submission_id, ordinal, message) VALUES (?, ?, ?)",
        ).bind(submissionId, index + 1, message),
      ),
      ...attachmentRows.map((file) =>
        bindings.DB!.prepare(
          "INSERT INTO feedback_attachments (submission_id, object_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?)",
        ).bind(submissionId, file.key, file.filename, file.contentType, file.size),
      ),
    ];
    await bindings.DB.batch(statements);

    return Response.json({ ok: true, message: "感谢你的建议，我们已经收到。" }, { status: 201 });
  } catch {
    try {
      const { env } = await import("cloudflare:workers");
      const bucket = (env as unknown as FeedbackBindings).FEEDBACK_FILES;
      if (bucket) await Promise.all(uploadedKeys.map((key) => bucket.delete(key)));
    } catch {
      // Best-effort cleanup only.
    }
    return Response.json({ error: "提交失败，请稍后重试。" }, { status: 500 });
  }
}
