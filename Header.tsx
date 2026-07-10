import { Brain, Sparkles, CheckCircle2, ChevronDown } from "lucide-react";
import { motion } from "motion/react";

interface HeaderProps {
  currentEngine: string;
  onChangeEngine: (engine: string) => void;
  isProcessing: boolean;
}

export default function Header({ currentEngine, onChangeEngine, isProcessing }: HeaderProps) {
  const engines = [
    {
      id: "claude",
      name: "Claude Sonnet 4.6 (主力推荐)",
      description: "极致指令遵循，死磕少儿语言规范、APA 标点与语法",
      badge: "推荐",
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 1.5 Pro (备用视觉引擎)",
      description: "原生超大上下文，极强 PDF 图文双重多模态解析能力",
      badge: "多模态",
    },
    {
      id: "gpt-5.5",
      name: "GPT-5.5 (高级调度引擎)",
      description: "严谨的批量结构化规则分析与高复杂度工作流调度",
      badge: "高级",
    },
  ];

  const activeEngineObj = engines.find((e) => e.id === currentEngine) || engines[0];

  return (
    <header className="border-b border-slate-100 bg-white shadow-xs">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          
          {/* Logo & Branding */}
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-100">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sans text-xl font-bold tracking-tight text-slate-900">
                  AI 教研内容交叉审核与修改工具
                </h1>
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  V2.0 Professional
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                少儿英语分级阅读 (L0-L4) 教学大纲与多物料一致性、语言规范性智能交叉质检工具
              </p>
            </div>
          </div>

          {/* Engine Routing Selection Selector */}
          <div className="flex flex-col sm:items-end gap-1.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-500" />
              智能路由核心审核引擎 (Model Router)
            </span>
            
            <div className="flex items-center gap-2 w-full sm:w-80">
              <div className="relative flex-1">
                <select
                  id="engine-select"
                  disabled={isProcessing}
                  value={currentEngine}
                  onChange={(e) => onChangeEngine(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {engines.map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.name} ({engine.badge})
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
              <div className="shrink-0 flex items-center">
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-md border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  API已连接
                </span>
              </div>
            </div>

            {/* Hint of mapped backend */}
            <p className="text-[11px] text-slate-400 text-right sm:max-w-xs leading-normal">
              * 本地环境通过后端 Server 安全代理无缝路由至专有{" "}
              <span className="font-mono text-indigo-600">大语言模型</span>。
            </p>
          </div>

        </div>
      </div>
    </header>
  );
}
