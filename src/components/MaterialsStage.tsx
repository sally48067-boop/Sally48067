import { useRef, useState } from "react";
import JSZip from "jszip";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle,
  Edit,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { MaterialFile, UploadedMaterials } from "../types";

interface MaterialsStageProps {
  materials: UploadedMaterials;
  onChangeMaterials: (m: UploadedMaterials) => void;
  onAddLog: (msg: string, type: "info" | "success" | "warn" | "error") => void;
}

function decodeXmlText(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractDocxText(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) {
    throw new Error("未找到 word/document.xml，无法读取 DOCX 正文。");
  }

  const paragraphs = Array.from(documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g))
    .map((match) => decodeXmlText(match[0]))
    .filter(Boolean);

  return paragraphs.join("\n");
}

async function extractPptxText(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml/)?.[1] || 0);
      const bi = Number(b.match(/slide(\d+)\.xml/)?.[1] || 0);
      return ai - bi;
    });

  if (slideFiles.length === 0) {
    throw new Error("未找到 ppt/slides/slide*.xml，无法读取 PPTX 页面文本。");
  }

  const slideTexts: string[] = [];
  for (let index = 0; index < slideFiles.length; index += 1) {
    const xml = await zip.file(slideFiles[index])?.async("text");
    const text = xml ? decodeXmlText(xml) : "";
    slideTexts.push(`Slide ${index + 1}:\n${text || "（未提取到文字）"}`);
  }

  return {
    text: slideTexts.join("\n\n"),
    slidesCount: slideFiles.length,
  };
}

export default function MaterialsStage({ materials, onChangeMaterials, onAddLog }: MaterialsStageProps) {
  const [editingKey, setEditingKey] = useState<keyof UploadedMaterials | null>(null);
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null);
  const [multimodalEnabled, setMultimodalEnabled] = useState<Record<string, boolean>>({
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

  const processPdfFile = async (file: File, key: keyof UploadedMaterials) => {
    onAddLog(`正在读取 PDF：${file.name}`, "info");
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;

    if (!pdfjsLib) {
      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: `（PDF.js 暂未加载成功，请稍后重试，或在此手动粘贴《${file.name}》文本。）`,
        size: file.size,
        pagesCount: 1,
      });
      onAddLog("PDF.js 未加载，已载入占位文本。", "warn");
      return;
    }

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pagesCount = pdf.numPages;
    const pagesToExtract = Math.min(pagesCount, 20);
    let fullText = "";

    for (let i = 1; i <= pagesToExtract; i += 1) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += `Page ${i}:\n${pageText}\n\n`;
    }

    const images: Array<{ mimeType: string; data: string }> = [];
    if (multimodalEnabled[key]) {
      const pagesToRender = Math.min(pagesCount, 3);
      for (let i = 1; i <= pagesToRender; i += 1) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          images.push({ mimeType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85) });
        }
      }
    }

    updateMaterial(key, {
      name: file.name,
      uploaded: true,
      text: fullText || "（未提取到 PDF 文本，可能是扫描版，请人工粘贴文本或转为可复制文本 PDF。）",
      size: file.size,
      pagesCount,
      images: images.length > 0 ? images : undefined,
    });
    onAddLog(`PDF《${file.name}》解析完成，共 ${pagesCount} 页。`, "success");
  };

  const processOfficeFile = async (file: File, key: keyof UploadedMaterials, extension: string) => {
    const isPptx = extension === "pptx";
    const isDocx = extension === "docx";

    if (!isPptx && !isDocx) {
      const typeName = extension === "ppt" ? "PPT" : "Word";
      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: `【已上传 ${typeName} 旧格式文件：${file.name}】\n\n当前版本只能自动解析 .docx / .pptx。请将该文件另存为 .docx / .pptx 或 PDF 后重新上传，或在此手动粘贴文本底稿。`,
        size: file.size,
        pagesCount: 1,
      });
      onAddLog(`${typeName} 旧格式暂不能自动解析，请另存为新版格式或 PDF。`, "warn");
      return;
    }

    onAddLog(`正在自动读取 ${isPptx ? "PPTX" : "DOCX"}：${file.name}`, "info");
    try {
      if (isDocx) {
        const text = await extractDocxText(file);
        updateMaterial(key, {
          name: file.name,
          uploaded: true,
          text: text || "（DOCX 未提取到文本，请人工粘贴底稿。）",
          size: file.size,
          pagesCount: 1,
        });
        onAddLog(`DOCX《${file.name}》文本读取完成。`, "success");
      } else {
        const result = await extractPptxText(file);
        updateMaterial(key, {
          name: file.name,
          uploaded: true,
          text: result.text || "（PPTX 未提取到文本，请人工粘贴底稿。）",
          size: file.size,
          pagesCount: result.slidesCount,
        });
        onAddLog(`PPTX《${file.name}》读取完成，共 ${result.slidesCount} 页 slide。`, "success");
      }
    } catch (error: any) {
      updateMaterial(key, {
        name: file.name,
        uploaded: true,
        text: `【${file.name} 自动解析失败】\n${error.message || "未知错误"}\n\n请将文件另存为 PDF 后重新上传，或在此手动粘贴文本底稿。`,
        size: file.size,
        pagesCount: 1,
      });
      onAddLog(`Office 文件解析失败：${error.message || "未知错误"}`, "error");
    }
  };

  const processTextFile = async (file: File, key: keyof UploadedMaterials) => {
    const text = await file.text();
    updateMaterial(key, {
      name: file.name,
      uploaded: true,
      text: text || "（文本内容为空）",
      size: file.size,
      pagesCount: 1,
    });
    onAddLog(`文本文件《${file.name}》读取完成。`, "success");
  };

  const processUploadedFile = async (file: File, key: keyof UploadedMaterials) => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    try {
      if (extension === "pdf") {
        await processPdfFile(file, key);
      } else if (["docx", "doc", "pptx", "ppt"].includes(extension)) {
        await processOfficeFile(file, key, extension);
      } else if (["txt", "md", "json", "csv"].includes(extension)) {
        await processTextFile(file, key);
      } else {
        updateMaterial(key, {
          name: file.name,
          uploaded: true,
          text: `【已载入文件：${file.name}】\n当前格式暂不能自动解析，请在此手动粘贴或校对文本。`,
          size: file.size,
          pagesCount: 1,
        });
        onAddLog(`文件《${file.name}》已载入，请人工校对文本底稿。`, "warn");
      }
    } catch (error: any) {
      onAddLog(`读取文件失败：${error.message || "未知错误"}`, "error");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, key: keyof UploadedMaterials) => {
    const file = event.target.files?.[0];
    if (file) processUploadedFile(file, key);
  };

  const handleDrag = (event: React.DragEvent, key: string, active: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActiveKey(active ? key : null);
  };

  const handleDrop = (event: React.DragEvent, key: keyof UploadedMaterials) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActiveKey(null);
    const file = event.dataTransfer.files?.[0];
    if (file) processUploadedFile(file, key);
  };

  const handleClear = (key: keyof UploadedMaterials) => {
    onChangeMaterials({
      ...materials,
      [key]: { name: "", uploaded: false, text: "", size: 0, images: undefined, pagesCount: 0 },
    });
    onAddLog(`已移除材料：${key}`, "info");
  };

  const handleSaveTextEdit = (key: keyof UploadedMaterials, newText: string) => {
    updateMaterial(key, { text: newText });
    setEditingKey(null);
    onAddLog(`已更新《${materials[key].name || key}》的文本底稿。`, "info");
  };

  const toggleMultimodal = (key: keyof UploadedMaterials) => {
    setMultimodalEnabled({ ...multimodalEnabled, [key]: !multimodalEnabled[key] });
  };

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
      desc: "必传。Book 是正文、页码、故事事实和图文关系的核心基准。",
      placeholder: "Page 1: ...\nPage 2: ...",
    },
    {
      key: "worksheet" as const,
      title: "配套练习 (Worksheet PPT/PDF)",
      required: false,
      desc: "支持 PDF / PPTX / DOCX。PPTX 会按 slide 自动提取文本。",
      placeholder: "Slide 1: ...\nSlide 2: ...",
    },
    {
      key: "teacherGuide" as const,
      title: "教师手册 (Teacher's Guide)",
      required: false,
      desc: "支持 PDF / DOCX / PPTX。用于核对教学目标、Picture Walk、Answer Key。",
      placeholder: "Teaching objectives: ...\nPicture Walk: ...",
    },
    {
      key: "readingReport" as const,
      title: "阅读报告 (Reading Report)",
      required: false,
      desc: "支持 PDF / DOCX / PPTX。用于核对词汇、字数、题干、答案和主题总结。",
      placeholder: "Word count: ...\nVocabulary: ...\nQuestions: ...",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4">
        <div className="flex gap-3">
          <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">文件文本提取与视觉复核提示</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              当前支持 PDF 文本提取、DOCX 文本提取、PPTX 按 slide 提取文本。PPTX/DOCX 的图片、排版和空间大小仍需人工视觉复核；如需更准确的视觉审核，请先导出为 PDF 后上传。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {materialSpecs.map((spec) => {
          const file = materials[spec.key];
          const isUploaded = file.uploaded;

          return (
            <div
              key={spec.key}
              className={`rounded-xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                isUploaded ? "border-emerald-100 bg-emerald-25/15" : "border-slate-150 bg-white"
              }`}
            >
              <div>
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

                  <button
                    onClick={() => toggleMultimodal(spec.key)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-all ${
                      multimodalEnabled[spec.key]
                        ? "bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm"
                        : "bg-slate-50 text-slate-400 border-slate-100 hover:text-slate-600"
                    }`}
                    title="当前仅 PDF 会生成页面截图；DOCX/PPTX 请转 PDF 进行视觉复核。"
                  >
                    <ImageIcon className="h-3 w-3" />
                    {multimodalEnabled[spec.key] ? "PDF 截图开启" : "仅文本"}
                  </button>
                </div>

                {!isUploaded ? (
                  <div
                    onClick={() => fileInputRefs[spec.key].current?.click()}
                    onDragOver={(event) => handleDrag(event, spec.key, true)}
                    onDragLeave={(event) => handleDrag(event, spec.key, false)}
                    onDrop={(event) => handleDrop(event, spec.key)}
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
                      onChange={(event) => handleFileChange(event, spec.key)}
                      className="hidden"
                    />
                    <Upload className={`h-5 w-5 mb-2 ${dragActiveKey === spec.key ? "text-indigo-600 scale-110" : "text-slate-400"}`} />
                    <p className="text-xs font-semibold text-slate-700">点击上传或拖拽文件到此处</p>
                    <p className="text-[10px] text-slate-400 mt-1">支持 PDF, PPTX, DOCX, TXT 等格式</p>
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
                          <span>页/Slide: {file.pagesCount || 1}</span>
                          {file.images && (
                            <>
                              <span>•</span>
                              <span className="text-indigo-600 font-semibold flex items-center gap-0.5">
                                <ImageIcon className="h-2.5 w-2.5" /> 已生成 {file.images.length} 张截图
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
                    编辑提取底稿 - {materialSpecs.find((item) => item.key === editingKey)?.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    请校对自动提取文本。视觉、图片尺寸、书写空间等仍建议人工复核。
                  </p>
                </div>
                <button onClick={() => setEditingKey(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50">
                  X
                </button>
              </div>

              <div className="flex-1 my-4">
                <textarea
                  id="draft-text-editor"
                  value={materials[editingKey].text}
                  onChange={(event) => updateMaterial(editingKey, { text: event.target.value })}
                  placeholder={materialSpecs.find((item) => item.key === editingKey)?.placeholder}
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
