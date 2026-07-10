import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, FileDown, FileText, Layers, Play, RefreshCw } from "lucide-react";
import { AuditIssue, AuditLog, AuditScope, ExcludedSuspicion, Syllabus, UploadedMaterials } from "../types";
import { DEFAULT_PROMPT_TEMPLATE } from "../constants";

interface AuditStageProps {
  syllabus: Syllabus;
  materials: UploadedMaterials;
  onAddLog: (msg: string, type: "info" | "success" | "warn" | "error") => void;
  logs: AuditLog[];
  onClearLogs: () => void;
}

const typeLabels: Record<string, string> = {
  cross_check: "交叉一致性问题",
  language: "语言问题",
  pedagogy: "教学匹配问题",
  detail: "细节问题",
  worksheet: "Worksheet 问题",
  other: "其他问题",
};

function normalizeIssue(issue: any, index: number): AuditIssue {
  const type = ["cross_check", "language", "pedagogy", "detail", "worksheet", "other"].includes(issue?.type)
    ? issue.type
    : "other";
  const currentContent = issue?.currentContent ?? issue?.currentText ?? issue?.current ?? "";
  const suggestedRevision = issue?.suggestedRevision ?? issue?.suggestion ?? "";

  return {
    id: issue?.id || `issue-${index + 1}`,
    type,
    typeLabel: issue?.typeLabel || issue?.issueType || typeLabels[type],
    location: issue?.location || issue?.pageOrSlide || "未定位",
    currentContent,
    suggestion: issue?.suggestion || suggestedRevision || issue?.action || "",
    problem: issue?.problem || "",
    syllabusBasis: issue?.syllabusBasis || "",
    suggestedRevision,
    action: issue?.action || "",
    severity: issue?.severity || "需确认",
    confidence: issue?.confidence || "中",
    file: issue?.file || "",
    pageOrSlide: issue?.pageOrSlide || "",
  };
}

function stripImagesForTextOnlyAudit(materials: UploadedMaterials): UploadedMaterials {
  return Object.fromEntries(
    Object.entries(materials).map(([key, value]) => [
      key,
      {
        ...value,
        images: undefined,
      },
    ])
  ) as UploadedMaterials;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function AuditStage({ syllabus, materials, onAddLog, onClearLogs }: AuditStageProps) {
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [auditScope, setAuditScope] = useState<AuditScope | null>(null);
  const [excludedSuspicions, setExcludedSuspicions] = useState<ExcludedSuspicion[]>([]);
  const [rawOutput, setRawOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [engineUsed, setEngineUsed] = useState("未调用");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const uploadedCount = Object.values(materials).filter((item) => item.uploaded).length;
  const hasSyllabusData =
    Boolean(syllabus.level && syllabus.bookName) &&
    (syllabus.coreWords.length > 0 ||
      syllabus.targetSentences.length > 0 ||
      syllabus.phonicsRules.length > 0 ||
      syllabus.hfw.length > 0 ||
      Boolean(syllabus.rawExtractedText));

  const handleStartAudit = async () => {
    if (!hasSyllabusData) {
      onAddLog("大纲信息不完整：请先匹配并确认大纲内容。", "error");
      setErrorMessage("请先在第 1 步完成大纲匹配，并确认级别、书名、核心词/句型等信息。");
      return;
    }
    if (uploadedCount === 0) {
      onAddLog("未检测到上传材料：请至少上传 Book PDF 或配套资源。", "error");
      setErrorMessage("请先在第 2 步上传至少一个待审核材料。");
      return;
    }

    setIsProcessing(true);
    setIssues([]);
    setAuditScope(null);
    setExcludedSuspicions([]);
    setRawOutput("");
    setErrorMessage("");
    onClearLogs();
    onAddLog("开始提交后端模型服务进行交叉审核。", "info");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syllabus,
          uploadedFiles: stripImagesForTextOnlyAudit(materials),
          promptTemplate,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `审核接口返回异常：${response.status}`);
      }

      const normalizedIssues = Array.isArray(data.issues)
        ? data.issues.map((item: any, index: number) => normalizeIssue(item, index))
        : [];

      setEngineUsed(data.modelUsed || "后端模型");
      setAuditScope(data.scope || null);
      setIssues(normalizedIssues);
      setExcludedSuspicions(Array.isArray(data.excludedSuspicions) ? data.excludedSuspicions : []);
      setRawOutput(JSON.stringify({
        scope: data.scope,
        issues: data.issues,
        excludedSuspicions: data.excludedSuspicions,
      }, null, 2));
      onAddLog(`审核完成：共生成 ${normalizedIssues.length} 条正式问题。`, "success");
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "审核超时：请减少上传文本量，或检查 API Key / Base URL / Model Name 是否可用。"
        : error?.message || "审核失败。";
      setErrorMessage(message);
      onAddLog(`审核失败：${message}`, "error");
    } finally {
      window.clearTimeout(timeout);
      setIsProcessing(false);
    }
  };

  const copySuggestion = (issue: AuditIssue) => {
    const text = issue.suggestedRevision || issue.suggestion || issue.action || "";
    navigator.clipboard.writeText(text);
    setCopiedId(issue.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  const exportWord = () => {
    const issueRows = issues.map((issue, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(issue.severity || "")}</td>
        <td>${escapeHtml(issue.file || "")}<br>${escapeHtml(issue.pageOrSlide || issue.location || "")}</td>
        <td>${escapeHtml(issue.currentContent || "")}</td>
        <td>${escapeHtml(issue.problem || "")}</td>
        <td>${escapeHtml(issue.syllabusBasis || "")}</td>
        <td>${escapeHtml(issue.suggestedRevision || issue.suggestion || "")}</td>
      </tr>
    `).join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #111827; }
            h1 { color: #4338ca; }
            table { width: 100%; border-collapse: collapse; font-size: 10pt; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
            th { background: #eef2ff; }
          </style>
        </head>
        <body>
          <h1>AI 教研内容交叉审核修改工单</h1>
          <p><strong>级别：</strong>${escapeHtml(syllabus.level)}　
          <strong>书名：</strong>${escapeHtml(syllabus.bookName)}　
          <strong>Book No.：</strong>${escapeHtml(syllabus.bookNumber || "")}</p>
          <p><strong>审核模型：</strong>${escapeHtml(engineUsed)}</p>
          <h2>正式问题</h2>
          <table>
            <thead>
              <tr>
                <th>#</th><th>等级</th><th>文件/位置</th><th>当前内容</th><th>问题说明</th><th>依据</th><th>建议修改</th>
              </tr>
            </thead>
            <tbody>${issueRows || `<tr><td colspan="7">本次未生成正式问题。</td></tr>`}</tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `教研交叉审核修改工单_${syllabus.bookName || "未命名"}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onAddLog("已导出 Word 格式修改工单。", "success");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-150 bg-white overflow-hidden shadow-2xs">
        <button
          onClick={() => setIsPromptOpen((value) => !value)}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-bold text-slate-800">审核 Prompt 与规则面板</span>
          </div>
          <span className="text-xs text-slate-400">{isPromptOpen ? "收起" : "展开"}</span>
        </button>
        {isPromptOpen && (
          <div className="p-4 border-t border-slate-100">
            <textarea
              value={promptTemplate}
              onChange={(event) => setPromptTemplate(event.target.value)}
              className="w-full h-80 rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-xs text-center">
        <h3 className="text-base font-bold text-slate-800 mb-2">多文档深度交叉质检分析</h3>
        <p className="text-xs text-slate-500 max-w-xl mx-auto mb-6 leading-relaxed">
          系统会把已确认的大纲信息和上传材料文本发送到后端模型服务。当前版本为文本审核；PPT/DOCX 可上传后手动粘贴提取底稿，视觉审核建议先转 PDF。
        </p>
        <button
          onClick={handleStartAudit}
          disabled={isProcessing}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="h-4.5 w-4.5 animate-spin" />
              正在审核中...
            </>
          ) : (
            <>
              <Play className="h-4.5 w-4.5 fill-white" />
              开始 AI 交叉质检
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {(issues.length > 0 || excludedSuspicions.length > 0 || rawOutput) && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
                结构化审核结果
              </h3>
              <p className="text-xs text-slate-500 mt-1">模型：{engineUsed}；正式问题：{issues.length} 条</p>
            </div>
            <button
              onClick={exportWord}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <FileDown className="h-3.5 w-3.5 text-indigo-600" />
              导出 Word 工单
            </button>
          </div>

          {auditScope && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 text-xs text-slate-600">
              <p><strong>已审核：</strong>{auditScope.uploadedFiles?.join("、") || "无"}</p>
              <p className="mt-1"><strong>未提供：</strong>{auditScope.notProvided?.join("、") || "无"}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {issues.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                本次未生成正式问题。请仍人工抽查关键页面，尤其是 PPT 视觉内容。
              </div>
            ) : (
              issues.map((issue, index) => (
                <div key={issue.id} className="rounded-xl border border-slate-150 bg-white p-5 shadow-2xs">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      #{index + 1}
                    </span>
                    <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {issue.typeLabel}
                    </span>
                    <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                      {issue.severity}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {issue.file || "未指定文件"} / {issue.pageOrSlide || issue.location}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                      <p className="font-bold text-slate-400 mb-1">当前内容</p>
                      <p className="font-mono text-slate-700 whitespace-pre-wrap">{issue.currentContent || "无"}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50/40 p-3 border border-emerald-100">
                      <p className="font-bold text-emerald-700 mb-1">建议修改</p>
                      <p className="text-slate-800 whitespace-pre-wrap">{issue.suggestedRevision || issue.suggestion || "无"}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-600 space-y-1">
                    {issue.problem && <p><strong>问题：</strong>{issue.problem}</p>}
                    {issue.syllabusBasis && <p><strong>依据：</strong>{issue.syllabusBasis}</p>}
                    {issue.action && <p><strong>操作：</strong>{issue.action}</p>}
                  </div>
                  <button
                    onClick={() => copySuggestion(issue)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    {copiedId === issue.id ? "已复制" : "复制建议"}
                  </button>
                </div>
              ))
            )}
          </div>

          {excludedSuspicions.length > 0 && (
            <div className="rounded-xl border border-slate-150 bg-white p-4">
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                已排除的疑似问题
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {excludedSuspicions.map((item, index) => (
                  <div key={index} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="font-bold text-slate-700">{item.suspectedIssue}</p>
                    <p className="mt-1 text-slate-500">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
