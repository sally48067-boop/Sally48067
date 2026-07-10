import { Brain, CheckCircle2, Sparkles } from "lucide-react";

interface HeaderProps {
  currentEngine: string;
  onChangeEngine: (engine: string) => void;
  isProcessing: boolean;
}

export default function Header({ isProcessing }: HeaderProps) {
  return (
    <header className="border-b border-slate-100 bg-white shadow-xs">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
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
                少儿英语分级阅读教学大纲与多物料一致性、语言规范性智能交叉质检工具
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-500" />
              后端模型服务状态
            </span>

            <div className="flex items-center gap-2 w-full sm:w-80 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-xs">
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${isProcessing ? "text-indigo-500" : "text-emerald-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  OpenAI-compatible 后端代理
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  真实模型由服务端 MODEL_NAME 决定
                </p>
              </div>
              <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                isProcessing
                  ? "border-indigo-100 bg-indigo-50 text-indigo-600"
                  : "border-emerald-100 bg-emerald-50 text-emerald-600"
              }`}>
                {isProcessing ? "调用中" : "待调用"}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 text-right sm:max-w-xs leading-normal">
              * 前端不接收、不保存 API Key。请在部署平台的 Secrets/Environment Variables 中配置 MODEL_API_KEY、MODEL_BASE_URL、MODEL_NAME。
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
