import { useEffect, useState } from "react";
import { FileSpreadsheet, Layers, PlayCircle, Terminal, Trash2 } from "lucide-react";
import { AuditLog, Syllabus, UploadedMaterials } from "./types";
import Header from "./components/Header";
import SyllabusStage from "./components/SyllabusStage";
import MaterialsStage from "./components/MaterialsStage";
import AuditStage from "./components/AuditStage";

export default function App() {
  const [activeTab, setActiveTab] = useState<"syllabus" | "materials" | "audit">("syllabus");
  const [currentEngine, setCurrentEngine] = useState("backend");
  const [syllabus, setSyllabus] = useState<Syllabus>({
    level: "",
    bookName: "",
    bookNumber: "",
    coreWords: [],
    targetSentences: [],
    phonicsRules: [],
    hfw: [],
  });
  const [materials, setMaterials] = useState<UploadedMaterials>({
    book: { name: "", uploaded: false, text: "", size: 0, pagesCount: 0 },
    worksheet: { name: "", uploaded: false, text: "", size: 0, pagesCount: 0 },
    teacherGuide: { name: "", uploaded: false, text: "", size: 0, pagesCount: 0 },
    readingReport: { name: "", uploaded: false, text: "", size: 0, pagesCount: 0 },
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const addLog = (message: string, type: "info" | "success" | "warn" | "error" = "info") => {
    setLogs((prev) => [
      {
        id: `log-${Date.now()}-${Math.random()}`,
        time: new Date().toTimeString().slice(0, 8),
        message,
        type,
      },
      ...prev,
    ]);
  };

  const clearLogs = () => setLogs([]);

  useEffect(() => {
    addLog("初始化 AI 教研内容交叉审核工具 v2.0。", "success");
    addLog("提示：API Key 只从后端环境变量读取，前端不保存密钥。", "info");
  }, []);

  const tabs = [
    { id: "syllabus" as const, name: "1. 导入 S&S 大纲", desc: "抽取核心词汇与句型目标", icon: FileSpreadsheet },
    { id: "materials" as const, name: "2. 载入配套物料", desc: "上传 Book、Worksheet、Reading Report、TG", icon: Layers },
    { id: "audit" as const, name: "3. AI 交叉质检", desc: "生成结构化修改工单", icon: PlayCircle },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <Header currentEngine={currentEngine} onChangeEngine={setCurrentEngine} isProcessing={false} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6 flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-200/50 p-1.5 rounded-xl border border-slate-150 shadow-2xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  addLog(`进入面板：${tab.name}`, "info");
                }}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all cursor-pointer ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm font-bold"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                  isActive ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight truncate">{tab.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{tab.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {activeTab === "syllabus" && (
          <SyllabusStage syllabus={syllabus} onChangeSyllabus={setSyllabus} onAddLog={addLog} />
        )}
        {activeTab === "materials" && (
          <MaterialsStage materials={materials} onChangeMaterials={setMaterials} onAddLog={addLog} />
        )}
        {activeTab === "audit" && (
          <AuditStage
            syllabus={syllabus}
            materials={materials}
            onAddLog={addLog}
            logs={logs}
            onClearLogs={clearLogs}
          />
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-900 text-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Terminal className="h-4 w-4 text-indigo-400" />
              <span>审核实时日志</span>
            </div>
            {logs.length > 0 && (
              <button
                onClick={clearLogs}
                className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 rounded-md px-2 py-1 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                清空
              </button>
            )}
          </div>
          <div className="h-32 overflow-y-auto space-y-1.5 font-mono text-[11px] leading-relaxed pr-2">
            {logs.length === 0 ? (
              <p className="text-slate-500 italic p-1">等待操作...</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5">
                  <span className="text-slate-600 shrink-0">[{log.time}]</span>
                  <span className={`flex-1 ${
                    log.type === "success" ? "text-emerald-400" :
                    log.type === "warn" ? "text-amber-400 font-medium" :
                    log.type === "error" ? "text-rose-400 font-bold" :
                    "text-slate-300"
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
