import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const auditJobs = new Map<string, any>();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

function extractJsonFromString(value: string): any {
  const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error("模型没有返回合法 JSON。");
  }
}

function materialName(key: string) {
  switch (key) {
    case "book":
      return "Book PDF";
    case "worksheet":
      return "Worksheet";
    case "teacherGuide":
      return "Teacher's Guide";
    case "readingReport":
      return "Reading Report";
    default:
      return key;
  }
}

function buildPrompt(syllabus: any, uploadedFiles: any, promptTemplate: string) {
  const sections: string[] = [];
  const uploaded: string[] = [];
  const notProvided: string[] = [];

  for (const key of ["book", "worksheet", "readingReport", "teacherGuide"]) {
    const file = uploadedFiles?.[key];
    const name = materialName(key);
    if (file?.uploaded) {
      uploaded.push(name);
      sections.push(
        `## ${name}\nFile name: ${file.name || "未命名"}\nPages/Slides: ${file.pagesCount || "未知"}\nText:\n${file.text || "未提取到文本，请按未能充分审核处理。"}`
      );
    } else {
      notProvided.push(name);
    }
  }

  return {
    uploaded,
    notProvided,
    text: `${promptTemplate}

[本次审核范围]
已上传：${uploaded.join(", ") || "无"}
未上传：${notProvided.join(", ") || "无"}

[S&S 大纲]
${JSON.stringify(syllabus, null, 2)}

[待审核材料]
${sections.join("\n\n---\n\n")}

请严格只返回 JSON。`,
  };
}

async function runAuditJob(jobId: string, payload: any) {
  const apiKey = process.env.MODEL_API_KEY;
  const baseUrl = (process.env.MODEL_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelName = process.env.MODEL_NAME || "gpt-4o";

  try {
    const { syllabus, uploadedFiles, promptTemplate } = payload || {};

    if (!syllabus) {
      throw new Error("缺少大纲数据。");
    }
    if (!uploadedFiles) {
      throw new Error("缺少上传材料。");
    }
    if (!apiKey) {
      throw new Error("后端模型服务未配置：请设置 MODEL_API_KEY、MODEL_BASE_URL、MODEL_NAME。");
    }

    const { uploaded, notProvided, text } = buildPrompt(syllabus, uploadedFiles, promptTemplate || "");
    const targetUrl = `${baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 150000);

    console.log(`[Audit Engine] Calling ${modelName} via ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: text }],
        temperature: 0.1,
        max_tokens: 6000,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`模型调用失败 (${response.status})：${errorText}`);
    }

    const responseData = await response.json();
    const responseText = responseData.choices?.[0]?.message?.content || "";
    const structured = extractJsonFromString(responseText);

    auditJobs.set(jobId, {
      status: "completed",
      updatedAt: Date.now(),
      result: {
        success: true,
        modelUsed: modelName,
        scope: structured.scope || { uploadedFiles: uploaded, notProvided },
        issues: Array.isArray(structured.issues) ? structured.issues : [],
        excludedSuspicions: Array.isArray(structured.excludedSuspicions) ? structured.excludedSuspicions : [],
        rawOutput: responseText,
      },
    });
  } catch (error: any) {
    const message = error?.name === "AbortError"
      ? "模型调用超时。请减少上传文本量，或检查 API 网关是否可用。"
      : error?.message || "服务端处理审核请求失败。";
    console.error("[Audit Engine] Error:", error);
    auditJobs.set(jobId, {
      status: "failed",
      updatedAt: Date.now(),
      error: message,
    });
  }
}

app.post("/api/audit", async (req, res) => {
  const jobId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  auditJobs.set(jobId, { status: "processing", createdAt: Date.now(), updatedAt: Date.now() });
  runAuditJob(jobId, req.body).catch((error) => {
    console.error("[Audit Engine] Unexpected job error:", error);
    auditJobs.set(jobId, {
      status: "failed",
      updatedAt: Date.now(),
      error: error?.message || "后台审核任务失败。",
    });
  });
  return res.json({ success: true, jobId });
});

app.get("/api/audit/:jobId", (req, res) => {
  const job = auditJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: "未找到审核任务，请重新开始审核。" });
  }
  if (job.status === "completed") {
    return res.json(job.result);
  }
  if (job.status === "failed") {
    return res.status(500).json({ success: false, error: job.error || "后台审核任务失败。" });
  }
  return res.json({ success: true, status: "processing" });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
