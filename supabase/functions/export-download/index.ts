declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

type UserRecord = { id?: string };
type QuotaRecord = {
  allowed?: boolean;
  event_id?: number;
  plan_code?: string;
  plan_name?: string;
  daily_limit?: number;
  used?: number;
  remaining?: number;
};

const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const bucket = "ccer-private-exports";
const maxBytes = 12 * 1024 * 1024;
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || "https://bwh121.github.io,http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://bwh121.github.io",
    "access-control-allow-headers": "authorization, apikey, content-type, x-export-kind, x-export-label, x-file-name",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
};

const json = (request: Request, status: number, payload: Record<string, unknown>) => new Response(
  JSON.stringify(payload),
  { status, headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8" } },
);

const decodeHeader = (value: string | null) => {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};

const safeFileName = (value: string, kind: string) => {
  const fallback = kind === "image" ? "ccer-chart.png" : "ccer-data.csv";
  const cleaned = value.trim().replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "-").slice(0, 120) || fallback;
  const extension = kind === "image" ? ".png" : ".csv";
  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
};

const storageObjectUrl = (path: string) => (
  `${supabaseUrl}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`
);

const releaseQuota = async (eventId: number) => {
  await fetch(`${supabaseUrl}/rest/v1/rpc/release_failed_export`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ requested_event_id: eventId }),
  }).catch(() => undefined);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { message: "Method not allowed" });
  if (!supabaseUrl || !serviceRoleKey) return json(request, 503, { message: "导出服务尚未完成配置。" });

  const origin = request.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json(request, 403, { message: "Origin not allowed" });

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return json(request, 401, { message: "请先登录。" });

  const kind = request.headers.get("x-export-kind") || "";
  const label = decodeHeader(request.headers.get("x-export-label")).slice(0, 240);
  const fileName = safeFileName(decodeHeader(request.headers.get("x-file-name")), kind);
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (!label || !["image", "data"].includes(kind)) return json(request, 400, { message: "导出参数无效。" });
  if (kind === "image" && !contentType.startsWith("image/png")) return json(request, 400, { message: "图片格式必须为 PNG。" });
  if (kind === "data" && !contentType.startsWith("text/csv")) return json(request, 400, { message: "数据格式必须为 CSV。" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, authorization },
  });
  if (!userResponse.ok) return json(request, 401, { message: "登录状态已失效，请重新登录。" });
  const user = await userResponse.json() as UserRecord;
  if (!user.id) return json(request, 401, { message: "无法识别登录用户。" });

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > maxBytes) return json(request, 413, { message: "导出文件为空或超过 12 MB。" });

  const quotaResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_export_quota`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({ requested_kind: kind, requested_label: label }),
  });
  if (!quotaResponse.ok) return json(request, quotaResponse.status, { message: "服务端额度校验失败。" });
  const quota = await quotaResponse.json() as QuotaRecord;
  if (!quota.allowed || !quota.event_id) return json(request, 429, { ...quota, allowed: false });

  const usageDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const path = `${user.id}/${usageDate}/${quota.event_id}-${fileName}`;
  let uploaded = false;

  try {
    const uploadResponse = await fetch(storageObjectUrl(path), {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": kind === "image" ? "image/png" : "text/csv",
        "x-upsert": "false",
      },
      body: bytes,
    });
    if (!uploadResponse.ok) throw new Error(`Storage upload failed: ${uploadResponse.status}`);
    uploaded = true;

    const signedResponse = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 120 }),
    });
    if (!signedResponse.ok) throw new Error(`Signed URL failed: ${signedResponse.status}`);
    const signedPayload = await signedResponse.json() as { signedURL?: string; signedUrl?: string };
    const rawSignedUrl = signedPayload.signedURL || signedPayload.signedUrl || "";
    if (!rawSignedUrl) throw new Error("Signed URL missing");

    const eventResponse = await fetch(`${supabaseUrl}/rest/v1/export_events?id=eq.${quota.event_id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        event_status: "completed",
        storage_bucket: bucket,
        storage_path: path,
        completed_at: new Date().toISOString(),
      }),
    });
    if (!eventResponse.ok) throw new Error(`Export event update failed: ${eventResponse.status}`);

    const absoluteSignedUrl = rawSignedUrl.startsWith("http")
      ? rawSignedUrl
      : rawSignedUrl.startsWith("/storage/v1/")
        ? `${supabaseUrl}${rawSignedUrl}`
        : `${supabaseUrl}/storage/v1${rawSignedUrl.startsWith("/") ? "" : "/"}${rawSignedUrl}`;
    const downloadUrl = new URL(absoluteSignedUrl);
    downloadUrl.searchParams.set("download", fileName);
    return json(request, 200, {
      ...quota,
      allowed: true,
      signed_url: downloadUrl.toString(),
      expires_in: 120,
    });
  } catch {
    if (uploaded) {
      await fetch(storageObjectUrl(path), {
        method: "DELETE",
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
      }).catch(() => undefined);
    }
    await releaseQuota(quota.event_id);
    return json(request, 500, { message: "私有文件生成失败，本次额度未扣减，请稍后重试。" });
  }
});
