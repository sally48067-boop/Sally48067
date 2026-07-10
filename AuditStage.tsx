import React, { useState } from "react";
import { Play, Clipboard, Check, FileDown, AlertTriangle, FileText, CheckCircle2, ChevronRight, Eye, RefreshCw, Layers } from "lucide-react";
import { Syllabus, UploadedMaterials, AuditLog, AuditIssue, ExcludedSuspicion, AuditScope } from "../types";
import { DEFAULT_PROMPT_TEMPLATE } from "../constants";
import { motion, AnimatePresence } from "motion/react";

interface AuditStageProps {
  syllabus: Syllabus;
  materials: UploadedMaterials;
  onAddLog: (msg: string, type: "info" | "success" | "warn" | "error") => void;
  logs: AuditLog[];
  onClearLogs: () => void;
}

export default function AuditStage({ syllabus, materials, onAddLog, logs, onClearLogs }: AuditStageProps) {
  const [promptTemplate, setPromptTemplate] = useState<string>(DEFAULT_PROMPT_TEMPLATE);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [auditResult, setAuditResult] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [auditScope, setAuditScope] = useState<AuditScope | null>(null);
  const [excludedSuspicions, setExcludedSuspicions] = useState<ExcludedSuspicion[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [engineUsed, setEngineUsed] = useState("gemini-3.5-flash");

  // Multi-stage status display for user reassurance
  const [currentStep, setCurrentStep] = useState<number>(0);
  const auditSteps = [
    "解析本地大纲元数据与知识点...",
    "检测已上传文档并动态隔离幻觉规则...",
    "提取 PDF/DOCX 多页面文本内容并打包...",
    "打包物理多模态 Canvas 截图页面...",
    "提交安全端点并调用高级 AI 模型核对...",
    "生成结构化一致性质检实操工单..."
  ];

  const handleStartAudit = async () => {
    // 1. Validation
    const activeMaterials = Object.keys(materials).filter((k) => materials[k as keyof UploadedMaterials].uploaded);
    if (activeMaterials.length === 0) {
      onAddLog("无法触发审核：请至少上传绘本 PDF 课程物料！", "error");
      return;
    }
    if (!syllabus.bookName || !syllabus.level) {
      onAddLog("无法触发审核：核心大纲的级别和书名必填！", "error");
      return;
    }

    // 严苛拦截门槛：必须有提取出的真实大纲数据（词汇/句型/自然拼读）
    const hasCoreData = (syllabus.coreWords && syllabus.coreWords.length > 0) || 
                        (syllabus.targetSentences && syllabus.targetSentences.length > 0) || 
                        (syllabus.phonicsRules && syllabus.phonicsRules.length > 0) ||
                        (syllabus.hfw && syllabus.hfw.length > 0);
                        
    if (!hasCoreData && !syllabus.rawExtractedText) {
      alert("大纲数据提取失败，请检查文件！您必须上传包含目标词汇、句型等真实内容的大纲文件，禁止使用无数据的空壳请求进行 AI 分析。");
      onAddLog("🔴 大纲数据提取失败，已终止请求发送，防止产生数据幻觉。", "error");
      return;
    }

    setIsProcessing(true);
    setAuditResult("");
    setParseError(null);
    setIssues([]);
    setAuditScope(null);
    setExcludedSuspicions([]);
    onClearLogs();
    onAddLog("🔍 启动少儿阅读教研内容全栈交叉一致性质检程序...", "info");

    try {
      // Step-by-step progress simulation to avoid user waiting anxiety
      setCurrentStep(0);
      const stepIntervals = [800, 1000, 1200, 1500, 2000];
      for (let i = 0; i < stepIntervals.length; i++) {
        await new Promise((res) => setTimeout(res, stepIntervals[i]));
        setCurrentStep(i + 1);
        onAddLog(`步骤 ${i + 1}/6: ${auditSteps[i + 1]}`, "info");
      }

      // Fetch engine select option in parent or local storage
      const activeEngine = (document.getElementById("engine-select") as HTMLSelectElement)?.value || "claude";

      // Call API
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syllabus,
          uploadedFiles: materials,
          promptTemplate,
          modelName: activeEngine,
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "调用审核服务端点错误");
      }


      setEngineUsed(data.modelUsed || "未配置模型");
      setIssues(data.issues || []);
      setAuditScope(data.scope || null);
      setExcludedSuspicions(data.excludedSuspicions || []);
      setAuditResult(JSON.stringify({
        scope: data.scope,
        issues: data.issues,
        excludedSuspicions: data.excludedSuspicions
      }, null, 2));

      setCurrentStep(5);
      onAddLog(`🎉 一致性交叉审查完毕！共发现 ${(data.issues || []).length} 处教研偏误与修改条目。请查看下方工单。`, "success");
      if (data.quotaWarning) {
        onAddLog(data.quotaWarning, "warn");
      } else if (data.modelUsed === "local-smart-audit-fallback") {
      }

    } catch (err: any) {
      onAddLog(`审核失败: ${err.message}`, "error");
      onAddLog(`后端模型服务未配置，请联系管理员配置环境变量。`, "warn");
      setParseError(err.message || "AI 输出格式异常，请重新审核");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopySuggestion = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // CSV Exporter for local print/work ticket
  const handleExportCSV = () => {
    if (issues.length === 0) return;
    
    // Add UTF-8 BOM so Excel opens Chinese text correctly
    let csvContent = "\uFEFF";
    csvContent += "问题类型,位置/物料,原始/当前内容,Actionable修改建议与替换文案\n";
    
    issues.forEach((issue) => {
      // Escape commas and quotes for CSV
      const cleanType = `"${issue.typeLabel.replace(/"/g, '""')}"`;
      const cleanLoc = `"${issue.location.replace(/"/g, '""')}"`;
      const cleanCurr = `"${issue.currentContent.replace(/"/g, '""')}"`;
      const cleanSug = `"${issue.suggestion.replace(/"/g, '""')}"`;
      csvContent += `${cleanType},${cleanLoc},${cleanCurr},${cleanSug}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `AI_教研修改工单_${syllabus.bookName}_V2.0.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddLog("已成功导出 CSV 格式实操教研修改工单！", "success");
  };

  // Markdown Exporter
  const handleExportMarkdown = () => {
    if (issues.length === 0) return;

    let mdContent = `# AI 教研内容修改工单 (一键排版与初审分发底单)\n\n`;
    mdContent += `**大纲级别**: ${syllabus.level}\n`;
    mdContent += `**绘本单元**: 《${syllabus.bookName}》\n`;
    mdContent += `**生成时间**: ${new Date().toLocaleString()}\n`;
    mdContent += `**审核引擎**: ${engineUsed}\n\n`;
    mdContent += `--- \n\n`;

    issues.forEach((issue, index) => {
      mdContent += `### [偏误 #${index + 1}] ${issue.typeLabel}\n`;
      mdContent += `- **错误位置/相关物料**: ${issue.location}\n`;
      mdContent += `- **当前/错误内容**: \`${issue.currentContent}\`\n`;
      mdContent += `- **直接修改替换建议**: \n\n  > ${issue.suggestion}\n\n`;
      mdContent += `--- \n\n`;
    });

    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `AI_教研修改工单_${syllabus.bookName}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddLog("已成功导出 Markdown 格式修改工单纸卡！", "success");
  };

  const renderIssueWordCard = (issue: AuditIssue, num: number) => {
    let badgeStyle = "background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;";
    if (issue.severity === "硬错") badgeStyle = "background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;";
    else if (issue.severity === "需确认") badgeStyle = "background-color: #ffedd5; color: #9a3412; border: 1px solid #fdba74;";
    else if (issue.severity === "可优化") badgeStyle = "background-color: #e0f2fe; color: #075985; border: 1px solid #7dd3fc;";

    return `
    <div style="margin-bottom: 25px; border: 1px solid #cbd5e1; border-radius: 6px; background-color: #ffffff; overflow: hidden; page-break-inside: avoid;">
      <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 14px; font-size: 10.5pt; font-weight: bold; font-family: sans-serif;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9.5pt; ${badgeStyle}">${issue.severity || "未知等级"}</span>
            <span style="margin-left: 10px; color: #334155;">问题 #${num} • ${issue.file || "未知文件"} • ${issue.pageOrSlide || issue.location || "未定位"}</span>
            <span style="float: right; font-size: 9pt; color: #64748b; font-weight: normal;">置信度: ${issue.confidence || "未定"}</span>
          </td>
        </tr>
      </table>
      <div style="padding: 14px; font-family: sans-serif;">
        <div style="margin-bottom: 12px;">
          <div style="font-size: 9pt; font-weight: bold; color: #64748b; margin-bottom: 4px;">【当前内容】</div>
          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 12px; font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #475569; border-radius: 4px;">${issue.currentContent || "无"}</div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%; padding-right: 10px; vertical-align: top;">
              <div style="font-size: 9pt; font-weight: bold; color: #b91c1c; margin-bottom: 4px;">【问题说明】</div>
              <div style="font-size: 10pt; color: #1e293b; margin-bottom: 12px;">${issue.problem || "无"}</div>
              
              <div style="font-size: 9pt; font-weight: bold; color: #0f766e; margin-bottom: 4px;">【大纲依据】</div>
              <div style="font-size: 10pt; color: #1e293b;">${issue.syllabusBasis || "无"}</div>
            </td>
            <td style="width: 50%; padding-left: 10px; vertical-align: top; border-left: 1px dashed #cbd5e1;">
              <div style="font-size: 9pt; font-weight: bold; color: #059669; margin-bottom: 4px;">【建议修改】</div>
              <div style="font-size: 10pt; color: #064e3b; font-weight: bold; margin-bottom: 12px; background-color: #ecfdf5; padding: 8px; border-radius: 4px;">${issue.suggestedRevision || issue.suggestion || "无"}</div>
              
              <div style="font-size: 9pt; font-weight: bold; color: #4338ca; margin-bottom: 4px;">【操作方式】</div>
              <div style="font-size: 10pt; color: #1e293b;">${issue.action || "无"}</div>
            </td>
          </tr>
        </table>
      </div>
    </div>
    `;
  };

  const renderExcludedCard = (item: ExcludedSuspicion, num: number) => {
    return `
    <div style="margin-bottom: 15px; border: 1px dashed #94a3b8; border-radius: 4px; background-color: #f8fafc; padding: 12px; page-break-inside: avoid; font-family: sans-serif;">
      <div style="font-size: 9.5pt; font-weight: bold; color: #64748b; margin-bottom: 6px;">排除项 #${num}: <span style="font-family: 'Courier New', Courier, monospace; color: #334155;">${item.suspectedIssue}</span></div>
      <div style="font-size: 9.5pt; color: #475569;"><strong>排除原因：</strong>${item.reason}</div>
    </div>
    `;
  };

  // Word (DOC/HTML) Exporter for Work Tickets
  const handleExportWord = () => {
    if (!auditResult && issues.length === 0 && excludedSuspicions.length === 0) return;

    let htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>教研修改工单</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      margin: 24px;
    }
    .main-title {
      font-size: 22pt;
      font-weight: bold;
      color: #4f46e5;
      text-align: center;
      margin-bottom: 6px;
    }
    .sub-title {
      font-size: 11pt;
      color: #64748b;
      text-align: center;
      margin-bottom: 25px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .meta-table td {
      border: 1px solid #cbd5e1;
      padding: 10px 12px;
      font-size: 10.5pt;
    }
    .meta-label {
      font-weight: bold;
      color: #475569;
      background-color: #f1f5f9;
      width: 18%;
    }
    .meta-value {
      color: #0f172a;
      width: 32%;
    }
    .section-title {
      font-size: 14pt;
      font-weight: bold;
      color: #1e293b;
      border-left: 6px solid #4f46e5;
      padding-left: 10px;
      margin-top: 35px;
      margin-bottom: 15px;
      background-color: #f8fafc;
      padding-top: 6px;
      padding-bottom: 6px;
    }
    .no-issue {
      font-size: 10pt;
      color: #94a3b8;
      font-style: italic;
      padding: 15px;
      border: 1px dashed #cbd5e1;
      background-color: #f8fafc;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .footer {
      text-align: center;
      font-size: 9pt;
      color: #94a3b8;
      margin-top: 60px;
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
    }
  </style>
</head>
<body>

  <div class="main-title">AI 教研修改工单</div>
  <div class="sub-title">分级阅读配套多文档对标分析与一键实操修改指令</div>

  <table class="meta-table">
    <tr>
      <td class="meta-label">基准级别</td>
      <td class="meta-value">${syllabus.level || "未指定"}</td>
      <td class="meta-label">绘本单元</td>
      <td class="meta-value">《${syllabus.bookName || "未指定"}》 (${syllabus.bookNumber || "未指定"})</td>
    </tr>
    <tr>
      <td class="meta-label">质检时间</td>
      <td class="meta-value">${new Date().toLocaleString()}</td>
      <td class="meta-label">审核引擎</td>
      <td class="meta-value">${engineUsed}</td>
    </tr>
    <tr>
      <td class="meta-label">发现偏差总数</td>
      <td class="meta-value" colspan="3" style="font-weight: bold; color: #ef4444; font-size: 11pt;">${issues.length} 处教研偏误与冲突条目</td>
    </tr>
  </table>

  <!-- Scope Section -->
  ${auditScope ? `
  <div class="section-title">本次审核范围 (Audit Scope)</div>
  <table class="meta-table">
    <tr>
      <td class="meta-label">已检测文档</td>
      <td class="meta-value" colspan="3">${auditScope.uploadedFiles && auditScope.uploadedFiles.length > 0 ? auditScope.uploadedFiles.join(", ") : "无"}</td>
    </tr>
    <tr>
      <td class="meta-label" style="background-color: #f8fafc; color: #94a3b8;">未检测文档</td>
      <td class="meta-value" colspan="3" style="color: #94a3b8;">${auditScope.notProvided && auditScope.notProvided.length > 0 ? auditScope.notProvided.join(", ") : "全部已覆盖"}</td>
    </tr>
  </table>
  ` : ''}

  <!-- A. Formal Issues Section -->
  <div class="section-title">A. 正式问题清单 (Actionable Issues)</div>
  ${
    issues.length === 0
      ? '<div class="no-issue">未检测到需要修改的教研偏误。</div>'
      : issues.map((issue, idx) => renderIssueWordCard(issue, idx + 1)).join("")
  }

  <!-- B. Excluded Suspicions Section -->
  <div class="section-title">B. 已排除疑似问题 (Excluded Suspicions)</div>
  <div style="font-size: 9pt; color: #64748b; margin-bottom: 15px;">以下内容由机器视觉或 OCR 误差产生，或经上下文确认不属于教研偏误，不需修改。</div>
  ${
    excludedSuspicions.length === 0
      ? '<div class="no-issue">未记录任何已被系统排除的疑似问题。</div>'
      : excludedSuspicions.map((item, idx) => renderExcludedCard(item, idx + 1)).join("")
  }

  <div class="footer">
    本工单由 AI 少儿英语教研一致性质检系统自动生成 • 严防教学事故，保障学术品质
  </div>

</body>
</html>
`;

    // Use application/msword format which is natively opened as Word Document
    const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `教研修改工单_${syllabus.bookName}.doc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddLog(`🎉 已成功导出 Word (.doc) 格式教研修改工单！`, "success");
  };

  const categories = [
    { id: "all", name: "全部问题", count: issues.length },
    { id: "cross_check", name: "多文档冲突", count: issues.filter((i) => i.type === "cross_check").length },
    { id: "language", name: "语言硬伤", count: issues.filter((i) => i.type === "language").length },
    { id: "pedagogy", name: "教学不匹配", count: issues.filter((i) => i.type === "pedagogy").length },
    { id: "detail", name: "页码细节错误", count: issues.filter((i) => i.type === "detail").length },
    { id: "worksheet", name: "练习页活动偏误", count: issues.filter((i) => i.type === "worksheet").length }
  ];

  const filteredIssues = filterType === "all" ? issues : issues.filter((i) => i.type === filterType);

  return (
    <div className="space-y-6">
      
      {/* 1. Prompt Panel Collapsible */}
      <div className="rounded-xl border border-slate-150 bg-white overflow-hidden shadow-2xs">
        <button
          onClick={() => setIsPromptOpen(!isPromptOpen)}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-bold text-slate-800">
              动态 Prompt 拼接与规则自定义面板 (可在此微调 APA 与审核标准)
            </span>
          </div>
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isPromptOpen ? "rotate-90" : ""}`} />
        </button>

        <AnimatePresence>
          {isPromptOpen && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="border-t border-slate-100 bg-white"
            >
              <div className="p-4 space-y-3">
                <p className="text-xs text-slate-400 leading-normal">
                  以下是发送给大模型的核心 Prompt 模块。系统在提交时会自动检测用户的<strong>选传项</strong>状态，如果不包含对应的物料，将彻底屏蔽对应的 <code>[IF] ... [END IF]</code> 条件块，完全消除大模型寻找不存在文件的幻觉。
                </p>
                <textarea
                  id="prompt-template-editor"
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  className="w-full h-80 rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. Start Audit Board */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-xs flex flex-col items-center justify-center text-center">
        <h3 className="text-base font-bold text-slate-800 mb-2">多文档深度交叉质检分析</h3>
        <p className="text-xs text-slate-500 max-w-lg mb-6 leading-relaxed">
          点击下方按钮，系统将自动汇总基准大纲与当前所有上传的物料文本及图片。动态拼接 Prompt，并发起低温度极高严谨性的少儿英语质检审查。
        </p>

        <button
          onClick={handleStartAudit}
          disabled={isProcessing}
          className={`inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50 hover:shadow-indigo-100 ${
            isProcessing ? "scale-98 animate-pulse" : "hover:scale-[1.01]"
          }`}
        >
          {isProcessing ? (
            <>
              <RefreshCw className="h-4.5 w-4.5 animate-spin" />
              正在进行深度教研品控交叉核对中...
            </>
          ) : (
            <>
              <Play className="h-4.5 w-4.5 fill-white" />
              开始 AI 教研交叉质检与一致性审核
            </>
          )}
        </button>

        {/* Step-by-step processing details */}
        {isProcessing && (
          <div className="mt-5 w-full max-w-md bg-slate-25 border border-slate-100 rounded-lg p-3.5 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-indigo-600">质检管线进程: {currentStep + 1}/6</span>
              <span className="text-[10px] text-slate-400">正在严密对齐大纲细节</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-500" 
                style={{ width: `${((currentStep + 1) / 6) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-700 mt-2 font-medium flex items-center gap-1.5 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 inline-block" />
              {auditSteps[currentStep]}
            </p>
          </div>
        )}
      </div>

      {/* 3. Output Stage Section: Issues Table & Exporters */}
      {(issues.length > 0 || (excludedSuspicions && excludedSuspicions.length > 0) || auditResult) && (
        <div className="space-y-6">
          
          {/* Scope Header */}
          {auditScope && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 mb-4">
              <h4 className="text-xs font-bold text-indigo-800 mb-2">本次审核范围：</h4>
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 font-semibold mt-0.5">已检测文档:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {auditScope.uploadedFiles?.length > 0 ? auditScope.uploadedFiles.map((f, i) => (
                      <span key={i} className="bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-md shadow-2xs font-medium">{f}</span>
                    )) : <span className="text-slate-400 italic">无</span>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 font-semibold mt-0.5">未检测文档:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {auditScope.notProvided?.length > 0 ? auditScope.notProvided.map((f, i) => (
                      <span key={i} className="bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md font-medium">{f}</span>
                    )) : <span className="text-slate-400 italic">全部已覆盖</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Actionable Board Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
                去情感化实操教研质检工单 (Actionable Issue Board)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                已过滤所有前置正面评价废话。按问题分类结构化展示，可直接进行一键文案替换修改
              </p>
            </div>

            {/* Export buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <FileDown className="h-3.5 w-3.5 text-indigo-600" />
                导出 CSV 工单
              </button>
              <button
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <FileText className="h-3.5 w-3.5 text-teal-600" />
                导出 MD 纸卡
              </button>
              <button
                onClick={handleExportWord}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                导出 Word 报告
              </button>
            </div>
          </div>

          {/* Filtering Categories Bar */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterType(cat.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterType === cat.id
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-150 hover:bg-slate-25"
                }`}
              >
                {cat.name} ({cat.count})
              </button>
            ))}
          </div>

          {/* Parse Error Display */}
          {parseError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm mb-4">
              <AlertTriangle className="mx-auto h-8 w-8 text-red-500 mb-3" />
              <h3 className="text-sm font-bold text-red-800">AI 输出格式异常，请重新审核</h3>
              <p className="text-xs text-red-600 mt-2">{parseError}</p>
            </div>
          )}

          {/* Filtered Discrepancies Bento Grid */}
          <div className="grid grid-cols-1 gap-4">
            {!parseError && filteredIssues.length === 0 ? (
              <div className="text-center py-10 bg-slate-25 border border-dashed rounded-xl border-slate-200">
                <p className="text-xs text-slate-400 italic">未检测到需要修改的正式问题。</p>
              </div>
            ) : (
              filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-xl border border-slate-150 bg-white p-5 shadow-2xs flex flex-col md:flex-row md:items-start justify-between gap-4 hover:border-indigo-150 transition-all"
                >
                  
                  {/* Left Column: Discrepancy specs */}
                  <div className="space-y-2.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                        issue.type === "cross_check" ? "bg-rose-50 text-rose-700 border-rose-100" :
                        issue.type === "language" ? "bg-amber-50 text-amber-700 border-amber-100" :
                        issue.type === "pedagogy" ? "bg-teal-50 text-teal-700 border-teal-100" :
                        issue.type === "detail" ? "bg-sky-50 text-sky-700 border-sky-100" :
                        "bg-slate-50 text-slate-700 border-slate-100"
                      }`}>
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {issue.typeLabel}
                      </span>
                      {issue.severity && (
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                          issue.severity === "硬错" ? "bg-red-100 text-red-800 border-red-200" :
                          issue.severity === "需确认" ? "bg-orange-100 text-orange-800 border-orange-200" :
                          "bg-blue-100 text-blue-800 border-blue-200"
                        }`}>
                          {issue.severity}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-400">•</span>
                      <span className="text-xs font-bold text-slate-700">
                        {issue.file || issue.pageOrSlide ? `${issue.file || "未知物料"} / ${issue.pageOrSlide || "未定位"}` : issue.location}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      
                      {/* Current Content */}
                      <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">【当前文本 / 偏误】</span>
                        <p className="text-xs font-mono text-slate-700 leading-normal line-clamp-3" title={issue.currentContent}>
                          {issue.currentContent}
                        </p>
                      </div>

                      {/* AI Actionable recommendation */}
                      <div className="rounded-lg bg-indigo-50/20 p-3 border border-indigo-50">
                        <span className="text-[10px] font-bold text-indigo-500 block mb-1">【建议修改文案 / 对标大纲】</span>
                        <div className="text-xs font-mono text-indigo-950 font-medium leading-normal space-y-1">
                          {issue.problem && <p><strong>问题：</strong>{issue.problem}</p>}
                          {issue.syllabusBasis && <p><strong>依据：</strong>{issue.syllabusBasis}</p>}
                          {issue.action && <p><strong>操作：</strong>{issue.action}</p>}
                          {issue.suggestedRevision && <p><strong>建议：</strong><span className="text-emerald-700 font-bold">{issue.suggestedRevision}</span></p>}
                          {!issue.problem && !issue.suggestedRevision && <p>{issue.suggestion}</p>}
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Right Column: Copy button */}
                  <div className="md:self-center shrink-0">
                    <button
                      onClick={() => handleCopySuggestion(issue.suggestion, issue.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                        copiedId === issue.id
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 hover:border-indigo-400 text-slate-700 hover:bg-slate-25"
                      }`}
                    >
                      {copiedId === issue.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          已复制建议!
                        </>
                      ) : (
                        <>
                          <Clipboard className="h-3.5 w-3.5" />
                          一键复制修改建议
                        </>
                      )}
                    </button>
                  </div>

                </div>
              ))
            )}
          </div>

          {/* Excluded Suspicions in UI */}
          {excludedSuspicions && excludedSuspicions.length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-6 mb-6">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-slate-400" />
                已排除疑似问题 (Excluded Suspicions)
              </h4>
              <p className="text-xs text-slate-500 mb-4">以下内容由机器视觉或 OCR 误差产生，或经上下文确认不属于教研偏误，不需修改。</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {excludedSuspicions.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                    <div className="font-mono text-slate-700 font-bold mb-1 line-clamp-1" title={item.suspectedIssue}>
                      {item.suspectedIssue}
                    </div>
                    <div className="text-slate-500 line-clamp-2" title={item.reason}>
                      {item.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible raw AI text response */}
          <div className="rounded-xl border border-slate-150 bg-white overflow-hidden shadow-2xs">
            <button
              onClick={() => setShowRawOutput(!showRawOutput)}
              className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-600">
                查看大模型返回的原始完整结构化输出 (包含完整日志细节)
              </span>
              <Eye className="h-4 w-4 text-slate-400" />
            </button>
            {showRawOutput && (
              <div className="p-4 border-t border-slate-100 bg-slate-950 text-slate-200 font-mono text-xs overflow-auto max-h-80 leading-relaxed rounded-b-xl whitespace-pre-wrap">
                {auditResult}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
