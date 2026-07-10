import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON and urlencoded body parsers with large limit for handling base64 PDF page renders
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Robust JSON extractor for dealing with diverse models (e.g., Claude, GPT)
function extractJsonFromString(str: string): any {
  const trimmed = str.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Attempt to extract the JSON block
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (innerErr) {
        // Strip markdown backticks if present
        const cleaned = candidate.replace(/```json|```/g, "").trim();
        try {
          return JSON.parse(cleaned);
        } catch (deepErr) {
          throw new Error("Could not parse JSON response from LLM: " + str);
        }
      }
    }
    throw e;
  }
}

app.post("/api/audit", async (req, res) => {
  try {
    const { syllabus, uploadedFiles, promptTemplate } = req.body as {
      syllabus: any;
      uploadedFiles: any;
      promptTemplate: string;
    };

    if (!syllabus) {
      return res.status(400).json({ error: "Syllabus data is required." });
    }

    if (!uploadedFiles || Object.keys(uploadedFiles).length === 0) {
      return res.status(400).json({ error: "At least one teaching material must be uploaded." });
    }

    // 1. Check API configurations
    const apiKey = process.env.MODEL_API_KEY;
    const baseUrl = process.env.MODEL_BASE_URL || "https://api.openai.com/v1";
    const modelName = process.env.MODEL_NAME || "gpt-4o";

    if (!apiKey) {
      console.log("[Audit Engine] MODEL_API_KEY is not defined. Failing immediately.");
      return res.status(401).json({ success: false, error: "后端模型服务未配置，请联系管理员配置环境变量。" });
    }

    let targetUrl = baseUrl.trim();
    if (!targetUrl.endsWith("/chat/completions")) {
      if (targetUrl.endsWith("/")) {
        targetUrl = targetUrl + "chat/completions";
      } else {
        targetUrl = targetUrl + "/chat/completions";
      }
    }

    // 2. Perform dynamic prompt isolation & variable replacement
    const uploadedList: string[] = [];
    const sectionsText: string[] = [];
    let hasImages = false;

    const getChineseName = (key: string) => {
      switch (key) {
        case "book": return "绘本故事内容 (Book PDF)";
        case "worksheet": return "配套练习 (Worksheet PPT/PDF)";
        case "teacherGuide": return "教师手册 (Teacher's Guide)";
        case "readingReport": return "阅读报告 (Reading Report)";
        default: return key;
      }
    };

    Object.keys(uploadedFiles).forEach((key) => {
      const file = uploadedFiles[key];
      if (file && file.uploaded) {
        const title = getChineseName(key);
        uploadedList.push(`- ${title}`);
        
        let sectionDoc = `### 【文档内容】${title}\n`;
        if (file.text) {
          sectionDoc += `文本内容：\n${file.text}\n`;
        } else {
          sectionDoc += `（文本内容为空或正在使用多模态视觉解析）\n`;
        }
        sectionsText.push(sectionDoc);

        if (file.images && Array.isArray(file.images) && file.images.length > 0) {
          hasImages = true;
          // [!NOTE] 关于视觉审核：
          // 当前使用 OpenAI-compatible 的基础文本接口（仅传递 textPrompt）。
          // 该请求结构不支持图片。如果未来需要支持 PDF/PPT 视觉审核，
          // 需要确保选用的模型支持多模态（如 gpt-4o, claude-3.5-sonnet 等），
          // 并将 messages 数组中的 content 改为数组格式：
          // content: [{ type: "text", text: "..." }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }]
        }
      }
    });

    let finalPrompt = promptTemplate || "";
    
    finalPrompt = finalPrompt.replace(/\{\{Level\}\}/g, syllabus.level || "未指定");
    finalPrompt = finalPrompt.replace(/\{\{Book Name\}\}/g, syllabus.bookName || "未指定");
    finalPrompt = finalPrompt.replace(/\{\{Book Number\}\}/g, syllabus.bookNumber || "未指定");
    finalPrompt = finalPrompt.replace(/\{\{动态生成的已上传文档列表，例如：1. 绘本内容 \(Book PDF\) 2. 配套练习 \(Worksheet\)\}\}/g, uploadedList.join("\n"));
    
    if (!uploadedFiles.teacherGuide || !uploadedFiles.teacherGuide.uploaded) {
      finalPrompt = finalPrompt.replace(/三、Teacher's Guide 审核标准[\s\S]*?四、S&S 大纲一致性/g, "四、S&S 大纲一致性");
    }

    const textPrompt = `[System Instructions & Task Def]\n${finalPrompt}\n\n[Reference Ground Truth]\nS&S Syllabus Outline:\n${JSON.stringify(syllabus, null, 2)}\n\n[Documents to Audit]\n${sectionsText.join("\n---\n")}\n`;

    console.log(`[Audit Engine] Executing Prompt on model: ${modelName} at ${targetUrl}...`);
    if (hasImages) {
      console.log(`[Audit Engine] 注意：用户上传了包含图片的文档，但当前的 OpenAI-compatible 请求格式仅发送了纯文本。视觉审核需要支持多模态的模型和 image_url 请求格式。`);
    }
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "user",
            content: textPrompt
          }
        ],
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Audit Engine] API Error:", errorText);
      return res.status(response.status).json({ success: false, error: `模型调用失败 (${response.status}): ${errorText}` });
    }

    const responseData = await response.json();
    const responseText = responseData.choices?.[0]?.message?.content || "";
    
    let structuredResult;
    try {
      structuredResult = extractJsonFromString(responseText || "");
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: "AI 未按要求输出合法 JSON",
        rawOutput: responseText
      });
    }

    return res.json({
      success: true,
      modelUsed: process.env.MODEL_NAME || "未配置模型",
      scope: structuredResult.scope || { uploadedFiles: [], notProvided: [] },
      issues: structuredResult.issues || [],
      excludedSuspicions: structuredResult.excludedSuspicions || []
    });

  } catch (error: any) {
    console.error("[Audit Engine] API Route Error:", error);
    return res.status(500).json({ success: false, error: error.message || "服务器处理质检请求时发生未知错误" });
  }
});

// Create Vite server in middleware mode for dev, or serve static files in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
