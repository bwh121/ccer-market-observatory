import { getDb } from "../../../db";
import { downloadRequests } from "../../../db/schema";

const occupations = new Set([
  "科研与教育",
  "政府与事业单位",
  "企业管理与碳资产",
  "金融与投资",
  "咨询与专业服务",
  "媒体与公共传播",
  "学生",
  "其他",
]);

const purposes = new Set([
  "学术研究",
  "政策研究",
  "市场分析",
  "项目开发与管理",
  "投资决策",
  "教学与培训",
  "新闻传播",
  "其他",
]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      name?: string;
      occupation?: string;
      organization?: string;
      purpose?: string;
    };
    const name = payload.name?.trim() || "";
    const occupation = payload.occupation?.trim() || "";
    const organization = payload.organization?.trim() || "";
    const purpose = payload.purpose?.trim() || "";

    if (!name || !organization || !occupations.has(occupation) || !purposes.has(purpose)) {
      return Response.json({ error: "请完整填写姓名、职业、单位和用途。" }, { status: 400 });
    }

    const db = await getDb();
    await db.insert(downloadRequests).values({
      name: name.slice(0, 80),
      occupation,
      organization: organization.slice(0, 160),
      purpose,
      userAgent: (request.headers.get("user-agent") || "").slice(0, 300),
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const missingTable = message.includes("no such table") || message.includes("download_requests");
    return Response.json(
      { error: missingTable ? "下载登记服务正在初始化，请稍后重试。" : "提交失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
