import React, { useState, useEffect } from "react";
import { Syllabus, UploadedMaterials, AuditLog } from "./types";
import { FileSpreadsheet, Layers, PlayCircle, ChevronRight, Terminal, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Header from "./components/Header";
import SyllabusStage from "./components/SyllabusStage";
import MaterialsStage from "./components/MaterialsStage";
import AuditStage from "./components/AuditStage";

export default function App() {
  // 1. Core States
  const [activeTab, setActiveTab] = useState<"syllabus" | "materials" | "audit">("syllabus");
  const [currentEngine, setCurrentEngine] = useState<string>("claude");

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

  // 2. Logging engine
  const addLog = (message: string, type: "info" | "success" | "warn" | "error" = "info") => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      time: new Date().toTimeString().slice(0, 8),
      message,
      type,
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // 3. Mount effects
  useEffect(() => {
    // Initial welcome log
    addLog("初始化 AI 英文教研多文档交叉审核质检系统 v2.0...", "success");
    addLog("提示: 本系统已接入后端自动审核服务，无需在前端配置 API Key。", "info");
  }, []);

  const handleSyllabusChange = (newSyllabus: Syllabus) => {
    setSyllabus(newSyllabus);
  };

  const tabs = [
    {
      id: "syllabus" as const,
      name: "1. 导入 S&S 大纲",
      desc: "抽取核心词汇与句型目标",
      icon: FileSpreadsheet,
    },
    {
      id: "materials" as const,
      name: "2. 载入配套物料",
      desc: "提供 Worksheet / TG 等文档",
      icon: Layers,
    },
    {
      id: "audit" as const,
      name: "3. AI 交叉质检",
      desc: "执行严格的一致性检查",
      icon: PlayCircle,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <Header
        currentEngine={currentEngine}
        onChangeEngine={setCurrentEngine}
        isProcessing={false}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6 flex-1 w-full">
        {/* Stepper Pipeline Control */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-200/50 p-1.5 rounded-xl border border-slate-150 shadow-2xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  addLog(`进入面板: ${tab.name}`, "info");
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

        {/* Dynamic Stage Render Area */}
        <div className="bg-transparent">
          {activeTab === "syllabus" && (
            <SyllabusStage
              syllabus={syllabus}
              onChangeSyllabus={handleSyllabusChange}
              onAddLog={addLog}
            />
          )}

          {activeTab === "materials" && (
            <MaterialsStage
              materials={materials}
              onChangeMaterials={setMaterials}
              onAddLog={addLog}
            />
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
        </div>

        {/* Bottom Panel: Micro-Terminal Logger */}
        <div className="rounded-xl border border-slate-200 bg-slate-900 text-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Terminal className="h-4 w-4 text-indigo-400" />
              <span>智能交叉质检实时日志终端 (Terminal Console)</span>
            </div>
            {logs.length > 0 && (
              <button
                onClick={clearLogs}
                className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 rounded-md px-2 py-1 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                清空控制台
              </button>
            )}
          </div>
          <div className="h-32 overflow-y-auto space-y-1.5 font-mono text-[11px] leading-relaxed pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            {logs.length === 0 ? (
              <p className="text-slate-500 italic p-1">等待用户操作, 控制台空闲中...</p>
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

      {/* Humble craft status footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p>AI 教研内容交叉审核与修改工具 v2.0 • 严防大模型幻觉 • 精准英文教材品控管理</p>
          <p className="mt-1 font-mono text-[10px] text-slate-400">
            Current Environment Time: {new Date().toLocaleDateString()} • Powered by AI Server proxy
          </p>
        </div>
      </footer>
    </div>
  );
}
