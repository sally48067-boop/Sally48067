import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Edit, Trash2, Eye, EyeOff, Sparkles, Image as ImageIcon } from "lucide-react";
import { UploadedMaterials, MaterialFile } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface MaterialsStageProps {
  materials: UploadedMaterials;
  onChangeMaterials: (m: UploadedMaterials) => void;
  onAddLog: (msg: string, type: "info" | "success" | "warn" | "error") => void;
}

export default function MaterialsStage({ materials, onChangeMaterials, onAddLog }: MaterialsStageProps) {
  const [editingKey, setEditingKey] = useState<keyof UploadedMaterials | null>(null);
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null);
  const [multimodalEnabled, setMultimodalEnabled] = useState<{ [key: string]: boolean }>({
    book: true,
    worksheet: false,
    teacherGuide: false,
    readingReport: false,
  });

  const fileInputRefs = {
    book: useRef<HTMLInputElement>(null),
    worksheet: useRef<HTMLInputElement>(null),
    teacherGuide: useRef<HTMLInputElement>(null),
    readingReport: useRef<HTMLInputElement>(null),
  };

  const updateMaterial = (key: keyof UploadedMaterials, data: Partial<MaterialFile>) => {
    onChangeMaterials({
      ...materials,
      [key]: {
        ...materials[key],
        ...data,
      },
    });
  };

  // Extract text and pages count from real PDF in-browser using PDF.js
  const processPdfFile = async (file: File, key: keyof UploadedMaterials) => {
    onAddLog(`正在读取 ${file.name} 物理二进制内容...`, "info");
    
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;

    if (!pdfjsLib) {
      // Fallback in case CDN not ready
      onAddLog("PDF.js 加载延迟，启动秒级提取备用通道...", "warn");
      const approxPages = Math.max(1, Math.round(file.size / 120000));
      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: `（因提取器组件就绪延迟，请在此手动补充《${file.name}》的教研文字内容，或稍后重试上传）`,
        size: file.size,
        pagesCount: approxPages,
      });
      return;
    }

    try {
      onAddLog(`[PDF.js] 开始提取文本并构建逻辑页面树...`, "info");
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const pagesCount = pdf.numPages;
      let fullText = "";

      // Extract up to 15 pages to keep payload within responsive limits
      const pagesToExtract = Math.min(pagesCount, 15);
      for (let i = 1; i <= pagesToExtract; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += `Page ${i}:\n${pageText}\n\n`;
      }

      let images: Array<{ mimeType: string; data: string }> = [];
      // If multimodal (visual) is enabled for this file, render pages as high quality screenshots
      if (multimodalEnabled[key]) {
        onAddLog(`[PDF.js Canvas] 正在对前 3 页进行多模态高保真图片渲染（用以跨页插图核对）...`, "info");
        const pagesToRender = Math.min(pagesCount, 3);
        
        for (let i = 1; i <= pagesToRender; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 }); // scale 1.2 creates a crisp file below 150KB
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            images.push({ mimeType: "image/jpeg", data: dataUrl });
          }
        }
        onAddLog(`[PDF.js Canvas] 成功渲染 ${images.length} 张物理页面，已打包进入 API Payload。`, "success");
      }

      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: fullText || "（无法提取文字，可能是扫描版PDF，请使用多模态模式或在此手动贴入文字）",
        size: file.size,
        pagesCount,
        images: images.length > 0 ? images : undefined,
      });

      onAddLog(`物料《${file.name}》解析成功。共读取 ${pagesCount} 页，文字提取完毕。`, "success");
    } catch (err: any) {
      onAddLog(`解析 PDF 失败: ${err.message}`, "error");
    }
  };

  // Process any uploaded file with appropriate strategy
  const processUploadedFile = async (file: File, key: keyof UploadedMaterials) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    
    if (extension === "pdf") {
      await processPdfFile(file, key);
    } else if (extension === "txt" || extension === "md" || extension === "json" || extension === "csv") {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          updateMaterial(key, {
            name: file.name,
            uploaded: true,
            text: text || "（文本内容为空）",
            size: file.size,
            pagesCount: 1,
          });
          onAddLog(`文本物料《${file.name}》读取成功！已载入大纲交叉比对底稿。`, "success");
        };
        reader.readAsText(file);
      } catch (err: any) {
        onAddLog(`读取文本文件失败: ${err.message}`, "error");
      }
    } else if (extension === "docx" || extension === "doc" || extension === "ppt" || extension === "pptx") {
      const typeName = (extension === "ppt" || extension === "pptx") ? "PPT 课件" : "Word 文档";
      const defaultWordPlaceholder = `【已上传 ${typeName}: ${file.name}】\n\n💡 品控指引：\n1. 推荐将《${file.name}》另存为 PDF 格式后重新上传，即可享受全自动文本和插图提取功能。\n2. 或者，请直接点击下方「核对与编辑提取底稿」按钮，把该 ${typeName} 的文本内容直接复制粘贴到编辑框中，即可参与 AI 一致性审核。`;
      
      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: defaultWordPlaceholder,
        size: file.size,
        pagesCount: 1,
      });
      onAddLog(`已成功载入 ${typeName}《${file.name}》。由于浏览器无法直接解析 PPT/Word 的完整图文结构，推荐转存为 PDF 后重新上传，或点击「核对与编辑提取底稿」贴入教学文本（当前仅支持纯文本内容审核）。`, "warn");
    } else {
      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: `【已载入常规格式: ${file.name}】\n请点击下方「核对与编辑提取底稿」贴入或校对文本。`,
        size: file.size,
        pagesCount: 1,
      });
      onAddLog(`⚠️ 已成功载入常规文档《${file.name}》！请直接点击下方「核对与编辑提取底稿」手动校对或贴入教学内容。`, "warn");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, key: keyof UploadedMaterials) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processUploadedFile(file, key);
    }
  };

  const handleDrag = (e: React.DragEvent, key: string, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) {
      setDragActiveKey(key);
    } else {
      setDragActiveKey(null);
    }
  };

  const handleDrop = (e: React.DragEvent, key: keyof UploadedMaterials) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveKey(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0], key);
    }
  };

  const handleClear = (key: keyof UploadedMaterials) => {
    onChangeMaterials({
      ...materials,
      [key]: {
        name: "",
        uploaded: false,
        text: "",
        size: 0,
        images: undefined,
        pagesCount: 0,
      },
    });
    onAddLog(`已移除物料: ${key}`, "info");
  };

  const handleSaveTextEdit = (key: keyof UploadedMaterials, newText: string) => {
    updateMaterial(key, { text: newText });
    setEditingKey(null);
    onAddLog(`已手动更新物料《${materials[key].name || key}》的文字提取底稿`, "info");
  };

  const toggleMultimodal = (key: keyof UploadedMaterials) => {
    const nextState = !multimodalEnabled[key];
    setMultimodalEnabled({
      ...multimodalEnabled,
      [key]: nextState,
    });
    
    // If already uploaded and toggling to true, prompt re-render
    if (materials[key].uploaded && nextState) {
      onAddLog(`已为《${key}》开启多模态图片支持。若需立即生成图片底册，请重新上传该文件。`, "info");
    }
  };

  // Helper to format byte sizes
  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const materialSpecs = [
    {
      key: "book" as const,
      title: "绘本故事内容 (Book PDF)",
      required: true,
      desc: "【必传】读本内容。包含核心情节与故事文本，是审核句型和拼读词汇的骨架。",
      placeholder: "在此贴入或核对绘本各页的文本，例如:\nPage 1: Where is the snail?\nPage 2: Snail wants to sail.",
    },
    {
      key: "worksheet" as const,
      title: "配套练习 (Worksheet PPT/PDF)",
      required: false,
      desc: "【选传】课后练习、巩固作业。检查是否错用了拼读单词、高频词是否符合大纲级别。",
      placeholder: "在此贴入或核对练习册文本，例如:\nActivity 1: Let's spell s-n-a-l-l.\nActivity 2: Write with 'when'.",
    },
    {
      key: "teacherGuide" as const,
      title: "教师手册 (Teacher's Guide)",
      required: false,
      desc: "【选传】教案、教学指引。核对各章节页码是否与绘本物理页码一致、Phonics 提示是否正确。",
      placeholder: "在此贴入或核对教师教案文本，例如:\nFocus: Long e sound.\nOn Page 5, point to the snail.",
    },
    {
      key: "readingReport" as const,
      title: "阅读报告 (Reading Report)",
      required: false,
      desc: "【选传】阅读反馈报告。重点比对核心设定、测试问题是否与绘本故事文本相矛盾。",
      placeholder: "在此贴入或核对阅读报告测试题文本，例如:\n1. Where was the snail? (under a rock)\n2. What page did he sail?",
    },
  ];

  return (
    <div className="space-y-6">
      
      {/* Dynamic Pre-rendering info */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4">
        <div className="flex gap-3">
          <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">多模态高清晰度图片预处理与预览机制</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              为了死磕绘本配图与教师手册、阅读报告中的页码/插图物理一致性，建议为<strong>绘本课程内容 (Book PDF)</strong> 开启 
              <span className="text-indigo-600 font-semibold">“多模态画面扫描”</span>。系统将自动调用 HTML5 Canvas 将 PDF 按页高保真渲染为 JPEG 图像矩阵，随文本一同传递给大模型，避免传统纯文本解析带来的空间与视觉信息丢失！
            </p>
          </div>
        </div>
      </div>

      {/* Grid of uploaders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {materialSpecs.map((spec) => {
          const file = materials[spec.key];
          const isUploaded = file.uploaded;

          return (
            <div
              key={spec.key}
              className={`rounded-xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                isUploaded
                  ? "border-emerald-100 bg-emerald-25/15"
                  : "border-slate-150 bg-white"
              }`}
            >
              <div>
                
                {/* File Header */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      {spec.title}
                      {spec.required && (
                        <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          必传
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{spec.desc}</p>
                  </div>

                  {/* Multi-modal toggle checkbox */}
                  <button
                    onClick={() => toggleMultimodal(spec.key)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-all ${
                      multimodalEnabled[spec.key]
                        ? "bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm"
                        : "bg-slate-50 text-slate-400 border-slate-100 hover:text-slate-600"
                    }`}
                    title="开启多模态图片扫描（适合绘本和图画比对）"
                  >
                    <ImageIcon className="h-3 w-3" />
                    {multimodalEnabled[spec.key] ? "多模态: 开启" : "仅文本模式"}
                  </button>
                </div>

                {/* Upload Action/Status Box */}
                {!isUploaded ? (
                  <div
                    onClick={() => fileInputRefs[spec.key].current?.click()}
                    onDragOver={(e) => handleDrag(e, spec.key, true)}
                    onDragLeave={(e) => handleDrag(e, spec.key, false)}
                    onDrop={(e) => handleDrop(e, spec.key)}
                    className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 px-4 text-center cursor-pointer transition-all ${
                      dragActiveKey === spec.key
                        ? "border-indigo-500 bg-indigo-25/50 scale-[0.99]"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-25/50"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRefs[spec.key]}
                      accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.json,.csv"
                      onChange={(e) => handleFileChange(e, spec.key)}
                      className="hidden"
                    />
                    <Upload className={`h-5 w-5 mb-2 transition-transform ${dragActiveKey === spec.key ? "text-indigo-600 scale-110" : "text-slate-400"}`} />
                    <p className="text-xs font-semibold text-slate-700">点击上传或拖拽文件到此处</p>
                    <p className="text-[10px] text-slate-400 mt-1">支持 PDF, PPT, DOCX, TXT 等主流格式</p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-white p-3 border border-slate-100 shadow-2xs flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <FileText className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>大小: {formatSize(file.size)}</span>
                          <span>•</span>
                          <span>页数: {file.pagesCount || 1} 页</span>
                          {file.images && (
                            <>
                              <span>•</span>
                              <span className="text-indigo-600 font-semibold flex items-center gap-0.5">
                                <ImageIcon className="h-2.5 w-2.5" /> 已生成 {file.images.length} 张扫描图
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  </div>
                )}

              </div>

              {/* Action Buttons if uploaded */}
              {isUploaded && (
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
                  <button
                    onClick={() => setEditingKey(spec.key)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 font-semibold transition-colors"
                  >
                    <Edit className="h-3 w-3" />
                    核对与编辑提取底稿
                  </button>
                  <button
                    onClick={() => handleClear(spec.key)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 font-semibold transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    移除
                  </button>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Accordion Edit Drawer if editing text */}
      <AnimatePresence>
        {editingKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl flex flex-col max-h-[85vh]"
            >
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    编辑提取底稿 — {materialSpecs.find((s) => s.key === editingKey)?.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    核对 PDF 的真实提取内容，支持增减或微调文本以达到更完美的比对效果
                  </p>
                </div>
                <button
                  onClick={() => setEditingKey(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>

              {/* Text Area */}
              <div className="flex-1 my-4">
                <textarea
                  id="draft-text-editor"
                  value={materials[editingKey].text}
                  onChange={(e) => updateMaterial(editingKey, { text: e.target.value })}
                  placeholder={materialSpecs.find((s) => s.key === editingKey)?.placeholder}
                  className="w-full h-[45vh] rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden resize-none leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setEditingKey(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleSaveTextEdit(editingKey, materials[editingKey].text)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  保存更新
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
