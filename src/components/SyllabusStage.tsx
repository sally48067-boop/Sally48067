import React, { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, Trash2, Plus, Calendar, AlertCircle, Info, CheckCircle2, ChevronRight, Layers, HelpCircle, BookOpen, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Syllabus } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface SyllabusStageProps {
  syllabus: Syllabus;
  onChangeSyllabus: (s: Syllabus) => void;
  onAddLog: (msg: string, type: "info" | "success" | "warn" | "error") => void;
}

interface NormalizedSyllabusRow {
  level: string;
  bookNumber: string;
  bookName: string;
  reader: string;
  wordCount: string;
  mastery: string;
  exposure: string;
  sentenceFrames: string;
  primaryPhonicsFocus: string;
  objective: string;
  rawObject: any;
}

export default function SyllabusStage({ syllabus, onChangeSyllabus, onAddLog }: SyllabusStageProps) {
  const [cachedDate, setCachedDate] = useState<string>("");
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState("");
  const [normalizedRows, setNormalizedRows] = useState<NormalizedSyllabusRow[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [isExcelPreviewOpen, setIsExcelPreviewOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState("L1");
  const [bookInput, setBookInput] = useState("");
  const [bookNameInput, setBookNameInput] = useState("");
  const [isLoadingSyllabus, setIsLoadingSyllabus] = useState(false);

  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [inputs, setInputs] = useState({ word: "", sentence: "", phonics: "", hfw: "" });
  // Sync from parent if changed externally (such as demo data load or cache restore)
  useEffect(() => {
    if (syllabus.bookNumber) {
      const cleanNum = syllabus.bookNumber.replace(/Book\s+/gi, "");
      setBookInput(cleanNum);
    }
    if (syllabus.bookName) {
      setBookNameInput(syllabus.bookName);
    }
  }, [syllabus.bookNumber, syllabus.bookName]);

  // 强制使用以下代码接管大纲数据提取逻辑
  // 强制使用以下代码接管大纲数据提取逻辑
  function extractBookData(parsedData: NormalizedSyllabusRow[], userLevelInput: string, userBookNumberInput: string, userBookNameInput: string = "") {
      const cleanStr = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetLevel = String(userLevelInput).trim().toUpperCase();
      let targetSeq = String(userBookNumberInput).trim();
      const cleanTargetSeq = targetSeq.replace(/^0+/, '').toLowerCase();
      const cleanTargetSeq2 = cleanStr(targetSeq);
      const cleanTargetBookName = cleanStr(userBookNameInput);

      let targetRow: NormalizedSyllabusRow | null = null;
      
      // 1. 如果输入了书名，优先通过书名+级别找
      if (cleanTargetBookName.length > 0) {
          targetRow = parsedData.find(row => {
              const rName = cleanStr(row.bookName || row.reader);
              const rLevel = (row.level || "").toUpperCase();
              return (rLevel === targetLevel || rLevel.includes(targetLevel) || targetLevel.includes(rLevel)) && 
                     (rName.includes(cleanTargetBookName) || cleanTargetBookName.includes(rName));
          }) || null;
      }
      
      // 2. 如果书名没找到，用 BookNumber + Level 找
      if (!targetRow) {
          const matchedByLevel = parsedData.filter(r => {
             const rLevel = (r.level || "").toUpperCase();
             return rLevel === targetLevel || rLevel.includes(targetLevel) || targetLevel.includes(rLevel);
          });
          
          targetRow = matchedByLevel.find(row => {
              const rowSeqTrim = String(row.bookNumber).trim();
              const cleanRowSeqTrim = rowSeqTrim.replace(/^0+/, '').toLowerCase();
              const cleanRowSeq2 = cleanStr(rowSeqTrim);
              
              if (rowSeqTrim === targetSeq || cleanRowSeqTrim === cleanTargetSeq || cleanRowSeq2 === cleanTargetSeq2) return true;
              
              const rowNumMatches = cleanRowSeq2.match(/\d+/g);
              const targetNumMatch = cleanTargetSeq2.match(/\d+/);
              if (rowNumMatches && targetNumMatch && rowNumMatches.includes(targetNumMatch[0])) {
                  return true;
              }
              return false;
          }) || null;
      }
      
      if (!targetRow) return null;

      const bestBookName = targetRow.bookName || "[大纲未要求]";
      const actualReader = targetRow.reader || "";

      return {
          bookName: bestBookName,
          reader: actualReader, 
          wordCount: targetRow.wordCount || "[大纲未要求]",
          mastery: targetRow.mastery || "[大纲未要求]", 
          exposure: targetRow.exposure || (targetRow.objective ? `${targetRow.exposure} | ${targetRow.objective}` : "[大纲未要求]"), 
          sentenceFrames: targetRow.sentenceFrames || "[大纲未要求]",
          primaryPhonicsFocus: targetRow.primaryPhonicsFocus || "[大纲未要求]"
      };
  }

  // Load syllabus strictly from parsed Excel/CSV
  const handleLoadSyllabus = async () => {
    const inputElem = document.getElementById("bookNumberInput") as HTMLInputElement;
    const targetSeq = inputElem ? inputElem.value.trim() : bookInput.trim();
    const targetLevel = selectedLevel.trim().toUpperCase();

    if (!normalizedRows || normalizedRows.length === 0) {
      alert("请先上传大纲并选择对应书籍！");
      onAddLog("大纲提取失败：尚未上传大纲文件，或未选择书籍。", "error");
      return;
    }

    if (!targetSeq) {
      alert("请输入 Book Number！");
      return;
    }

    const nameInputElem = document.getElementById("bookNameInput") as HTMLInputElement;
    const targetBookName = nameInputElem ? nameInputElem.value.trim() : bookNameInput.trim();
    const result = extractBookData(normalizedRows, targetLevel, targetSeq, targetBookName);

    if (!result) {
      alert(`在 ${selectedLevel} 中未找到 Sequence Order 为 ${targetSeq} 的书籍，请检查大纲或输入！`);
      onAddLog(`[大纲提取失败] 未在上传的大纲文件中找到匹配的书籍 (Level: ${targetLevel}, Sequence Order: ${targetSeq})。`, "error");
      
      // 清空界面
      onChangeSyllabus({
        level: targetLevel,
        bookName: "",
        bookNumber: targetSeq,
        wordCount: "",
        coreWords: [],
        targetSentences: [],
        phonicsRules: [],
        hfw: [],
        rawExtractedText: ""
      });
      return;
    }

    console.log("提取到的数据:", result);

    const parseToArray = (text: string) => {
      if (!text || text === "[大纲未要求]") return [];
      return text.split(/[，,；;\n、]+/).map(x => x.trim()).filter(x => x.length > 0);
    };

    const parsedSyllabus: Syllabus = {
      level: targetLevel,
      bookName: result.bookName !== "[大纲未要求]" && result.bookName ? result.bookName : "Book " + targetSeq,
      bookNumber: targetSeq,
      wordCount: result.wordCount !== "[大纲未要求]" ? result.wordCount : "",
      coreWords: parseToArray(result.mastery),
      targetSentences: parseToArray(result.sentenceFrames),
      phonicsRules: parseToArray(result.primaryPhonicsFocus),
      hfw: parseToArray(result.exposure),
      readerText: result.reader,
      rawExtractedText: `【大纲事实基准】
Title: ${result.bookName}
Reader: ${result.reader}
Word Count: ${result.wordCount}
Mastery: ${result.mastery}
Exposure: ${result.exposure}
Sentence Frames: ${result.sentenceFrames}
Primary Phonics Focus: ${result.primaryPhonicsFocus}`
    };

    onChangeSyllabus(parsedSyllabus);
    onAddLog(`[大纲提取成功] 已从上传的大纲中直接定位并提取核心内容：【${targetLevel}】《${parsedSyllabus.bookName}》`, "success");
  };

  // Load cache timestamp on mount
  useEffect(() => {
    const savedDate = localStorage.getItem("syllabus_cache_date");
    if (savedDate) {
      setCachedDate(savedDate);
    }
  }, []);

  // Update syllabus version timestamp
  const saveSyllabusVersion = (timestamp: string) => {
    localStorage.setItem("syllabus_cache_date", timestamp);
    setCachedDate(timestamp);
  };

  // Helper to find key by partial match
  const findKey = (row: any, keywords: string[]) => {
    const keys = Object.keys(row);
    for (const kw of keywords) {
      const matched = keys.find(k => k.trim().toLowerCase().includes(kw.toLowerCase()));
      if (matched) return matched;
    }
    return null;
  };
  
  const getVal = (row: any, ...keywords: string[]) => {
    const k = findKey(row, keywords);
    return k && row[k] ? String(row[k]).trim() : "";
  };

  // Parse Excel File
  const handleExcelUpload = (file: File) => {
    onAddLog(`开始读取多表 Excel 教学大纲文件: ${file.name}`, "info");
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        
        let allNormalizedRows: NormalizedSyllabusRow[] = [];
        const validLevels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
        
        // Loop over all sheets
        for (const sheetName of workbook.SheetNames) {
           const worksheet = workbook.Sheets[sheetName];
           const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
           
           if (!rawRows || rawRows.length === 0) continue;
           
           // Determine sheet level roughly
           const sheetLvlStr = sheetName.replace(/level\s*/i, 'L').trim().toUpperCase();
           
           for (const row of rawRows) {
               let rowLevel = getVal(row, "Level", "Stage");
               if (!rowLevel) {
                   if (validLevels.some(vl => sheetLvlStr.includes(vl))) {
                       // Find exact valid level from sheet name
                       rowLevel = validLevels.find(vl => sheetLvlStr.includes(vl)) || sheetLvlStr;
                   }
               } else {
                   rowLevel = rowLevel.replace(/level\s*/i, 'L').trim().toUpperCase();
               }
               
               let bookNum = "";
               let bookName = "";
               let reader = "";
               let wordCount = "";
               let mastery = "";
               let exposure = "";
               let sentenceFrames = "";
               let phonics = "";
               let objective = "";
               
               // L0-L2 logic
               if (rowLevel === "L0" || rowLevel === "L1" || rowLevel === "L2") {
                   bookNum = getVal(row, "Sequence Order", "Sequence", "Book Number", "Seq");
                   bookName = getVal(row, "Title", "Book Name");
                   reader = getVal(row, "Reader");
                   wordCount = getVal(row, "Word Count");
                   mastery = getVal(row, "Mastery");
                   exposure = getVal(row, "Exposure");
                   sentenceFrames = getVal(row, "Sentence Frames");
                   phonics = getVal(row, "Phonics Focus", "Primary Phonics Focus", "Phonics");
               } 
               // L3-L6 logic
               else {
                   bookNum = getVal(row, "Book No", "BOOK", "Book Number", "Sequence", "Seq");
                   bookName = getVal(row, "课文标题保存时", "Title", "Book Name");
                   reader = getVal(row, "正文", "Reader");
                   wordCount = getVal(row, "总字数", "Word Count");
                   mastery = getVal(row, "核心词汇", "Mastery");
                   exposure = getVal(row, "Exposure");
                   sentenceFrames = getVal(row, "句型Pattern", "句型", "Sentence Frames");
                   phonics = getVal(row, "Phonics Rule", "Phonics");
                   objective = getVal(row, "教学重点");
               }
               
               if (bookNum || bookName || reader) {
                   allNormalizedRows.push({
                       level: rowLevel,
                       bookNumber: bookNum,
                       bookName: bookName,
                       reader: reader,
                       wordCount: wordCount,
                       mastery: mastery,
                       exposure: exposure,
                       sentenceFrames: sentenceFrames,
                       primaryPhonicsFocus: phonics,
                       objective: objective,
                       rawObject: row
                   });
               }
           }
        }
        
        if (allNormalizedRows.length === 0) {
          onAddLog("未能从大纲中提取出包含有效序列的课程数据。", "error");
          return;
        }

        setNormalizedRows(allNormalizedRows);

        const defaultLevels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
        setAvailableLevels(defaultLevels);
        setSelectedLevel('L1');

        const modDate = file.lastModified 
          ? new Date(file.lastModified).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        
        saveSyllabusVersion(modDate);
        onAddLog(`成功解析多表大纲，共整合 ${allNormalizedRows.length} 条标准记录。`, "success");
        setUploadSuccessMsg(`✅ 已成功解析：${file.name}，包含 ${allNormalizedRows.length} 条大纲数据`);
      } catch (err: any) {
        onAddLog(`大纲解析失败: ${err.message}`, "error");
      }
    };

    reader.onerror = () => {
      onAddLog("读取大纲文件错误，请重试。", "error");
    };

    reader.readAsBinaryString(file);
  };

  // Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
        handleExcelUpload(file);
      } else {
        onAddLog("不支持的文件类型，仅支持上传 .xlsx, .xls 或 .csv 格式", "warn");
      }
    }
  };

  // Input Handlers
  const handleTextChange = (field: keyof Syllabus, val: string) => {
    onChangeSyllabus({
      ...syllabus,
      [field]: val
    });
  };

  // Add Item to Array Field (Core Words, Target Sentences, Phonics, HFW)
  const handleAddArrayItem = (field: keyof Syllabus, inputKey: keyof typeof inputs) => {
    const val = inputs[inputKey].trim();
    if (!val) return;
    const existing = (syllabus[field] as string[]) || [];
    if (!existing.includes(val)) {
      onChangeSyllabus({
        ...syllabus,
        [field]: [...existing, val]
      });
    }
    setInputs({ ...inputs, [inputKey]: "" });
  };

  const handleRemoveArrayItem = (field: keyof Syllabus, index: number) => {
    const arr = [...((syllabus[field] as string[]) || [])];
    arr.splice(index, 1);
    onChangeSyllabus({
      ...syllabus,
      [field]: arr
    });
  };

  // Add Item to Array Field (Core Words, Target Sentences, Phonics, HFW)
  
  
  
  return (
    <div className="space-y-6">
      
      {/* Upper Grid: Excel upload and version caching info */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* Upload Column */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 text-xs font-bold">1</span>
              <h2 className="font-sans text-base font-bold text-slate-900">大纲上传 & 版本匹配</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              支持上传项目的 `.xlsx` 或 `.xls` 格式教学大纲。系统将智能解析大纲，提取目标绘本的核心单词、句型和Phonics规则，作为内容一致性审查的标准事实底本。
            </p>

            {/* Drag Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
                dragOver
                  ? "border-indigo-500 bg-indigo-25/50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-25"
              }`}
            >
              <input
                type="file"
                id="syllabus-file-input"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleExcelUpload(e.target.files[0]);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
                            <div className="flex flex-col items-center justify-center pointer-events-none">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-3">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">拖拽 Excel 大纲文件到此处，或点击浏览文件</p>
                <p className="mt-1 text-xs text-slate-400">支持 XLS, XLSX, CSV 格式，文件内可包含多条课程纪录</p>
              </div>
            </div>
          </div>
            {uploadSuccessMsg && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 border border-emerald-100 text-sm font-semibold text-emerald-700 shadow-xs animate-in fade-in zoom-in duration-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>{uploadSuccessMsg}</span>
              </div>
            )}

          {/* Caching & Loading Demo Bar */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
              <span>
                {cachedDate ? (
                  <span className="text-slate-700">
                    当前缓存大纲版本日期：<strong className="text-indigo-600 font-semibold">{cachedDate}</strong>
                  </span>
                ) : (
                  "浏览器暂无大纲缓存版本，请上传或加载演示底本"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Level and Book details Column */}
        <div className="lg:col-span-5 rounded-xl border border-slate-100 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 text-xs font-bold">2</span>
              <h2 className="font-sans text-base font-bold text-slate-900">核心大纲标准快速选择</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  1. 选择分级级别 (Level L0 - L6)
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => {
                    setSelectedLevel(e.target.value);
                    setBookInput(""); // 当切换 Level 时立即清空书名
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  {(availableLevels.length > 0 ? availableLevels : ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']).map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    2. 输入课程序号
                  </label>
                  <input
                    type="number"
                    id="bookNumberInput"
                    placeholder="如: 27"
                    value={bookInput}
                    onChange={(e) => setBookInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    3. 书名 (可选精准定位)
                  </label>
                  <input
                    type="text"
                    id="bookNameInput"
                    placeholder="如: My Toy Bear"
                    value={bookNameInput}
                    onChange={(e) => setBookNameInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-2">输入课程序号(必填)及绘本名称(选填)以精确定位大纲，完成后点击下方提取按钮。</p>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isLoadingSyllabus}
                  onClick={() => {
                    handleLoadSyllabus();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 shadow-xs hover:shadow transition-all text-sm active:scale-[0.99] cursor-pointer"
                >
                  {isLoadingSyllabus ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {isLoadingSyllabus ? "正在智能检索并关联大纲..." : "确认提交并关联绘本大纲"}
                </button>
              </div>

              {syllabus.bookName && (
                <div className="rounded-lg bg-indigo-50/30 border border-indigo-100/40 p-3.5 flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-500 block mb-1">已装载大纲绘本名称 (Title/Book Name) — 可直接修改</span>
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800 min-w-0 flex-1">
                      <BookOpen className="h-4 w-4 text-indigo-600 shrink-0" />
                      <input
                        type="text"
                        value={syllabus.bookName || ""}
                        onChange={(e) => handleTextChange("bookName", e.target.value)}
                        placeholder="修改或输入自定义绘本名称"
                        className="w-full bg-transparent border-b border-dashed border-indigo-300 hover:border-indigo-500 focus:border-indigo-600 focus:outline-hidden text-sm font-bold text-slate-800 px-1 py-0.5"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-indigo-500 block mb-1">正文 (Reader / Full Text) — 可直接修改</span>
                    <textarea
                      value={syllabus.readerText || ""}
                      onChange={(e) => handleTextChange("readerText", e.target.value)}
                      placeholder="这里将显示提取出的长篇正文内容..."
                      rows={4}
                      className="w-full rounded-md border border-indigo-200/60 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 resize-y"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-indigo-500 block mb-1">字数 (Word Count) — 可直接点击修改</span>
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800 min-w-0 flex-1">
                      <span className="text-[10px] text-slate-400 font-normal">WC</span>
                      <input
                        type="text"
                        value={syllabus.wordCount || ""}
                        onChange={(e) => handleTextChange("wordCount", e.target.value)}
                        placeholder="输入字数"
                        className="w-full bg-transparent border-b border-dashed border-indigo-300 hover:border-indigo-500 focus:border-indigo-600 focus:outline-hidden text-sm font-bold text-slate-800 px-1 py-0.5"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mt-1">
                    {/* Badge showing if matched preset or generated */}
                    {syllabus.rawExtractedText ? (
                      <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full shrink-0">
                        文件精准提取
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded-full shrink-0">
                        未提取
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {syllabus.bookName && (
            <div className="mt-4 rounded-lg bg-emerald-50/50 p-3 border border-emerald-100/50 flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-800 leading-normal">
                <strong>自动联动中：</strong>系统已自动读取并呈现该绘本对应的核心词汇、拼读规则和目标句型。步骤二、三将对此大纲进行百分百对标审查。
              </p>
            </div>
          )}
          
        </div>

      </div>



      {/* Array tags setup list */}
      {syllabus.bookName && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Core Words Card */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold text-slate-800">
              核心词汇 (Mastery)
            </label>
            {syllabus.coreWords.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSyllabus({ ...syllabus, coreWords: [] })}
                className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="添加核心词汇"
              value={inputs.word}
              onChange={(e) => setInputs({ ...inputs, word: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAddArrayItem("coreWords", "word")}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
            />
            <button
              onClick={() => handleAddArrayItem("coreWords", "word")}
              className="rounded-lg bg-indigo-600 px-3 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-1 border border-slate-50 rounded-lg bg-slate-25/50 min-h-12">
            {syllabus.coreWords.length === 0 ? (
              <span className="text-xs text-slate-400 p-2 italic">[大纲未要求]</span>
            ) : (
              syllabus.coreWords.map((word, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-100/30"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveArrayItem("coreWords", index)}
                    className="hover:bg-indigo-100 rounded-full p-0.5 transition-colors"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* High Frequency Words Card */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold text-slate-800">
              拓展词汇 (Exposure)
            </label>
            {syllabus.hfw.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSyllabus({ ...syllabus, hfw: [] })}
                className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="添加拓展词汇"
              value={inputs.hfw}
              onChange={(e) => setInputs({ ...inputs, hfw: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAddArrayItem("hfw", "hfw")}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
            />
            <button
              onClick={() => handleAddArrayItem("hfw", "hfw")}
              className="rounded-lg bg-indigo-600 px-3 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-1 border border-slate-50 rounded-lg bg-slate-25/50 min-h-12">
            {syllabus.hfw.length === 0 ? (
              <span className="text-xs text-slate-400 p-2 italic">[大纲未要求]</span>
            ) : (
              syllabus.hfw.map((word, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-100/30"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveArrayItem("hfw", index)}
                    className="hover:bg-sky-100 rounded-full p-0.5 transition-colors"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Phonics Rules Card */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold text-slate-800">
              自然拼读规则 (Primary Phonics Focus)
            </label>
            {syllabus.phonicsRules.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSyllabus({ ...syllabus, phonicsRules: [] })}
                className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="添加拼读规则，如 ai sound"
              value={inputs.phonics}
              onChange={(e) => setInputs({ ...inputs, phonics: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAddArrayItem("phonicsRules", "phonics")}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
            />
            <button
              onClick={() => handleAddArrayItem("phonicsRules", "phonics")}
              className="rounded-lg bg-indigo-600 px-3 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-1 border border-slate-50 rounded-lg bg-slate-25/50 min-h-12">
            {syllabus.phonicsRules.length === 0 ? (
              <span className="text-xs text-slate-400 p-2 italic">[大纲未要求]</span>
            ) : (
              syllabus.phonicsRules.map((rule, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 border border-teal-100/30"
                >
                  {rule}
                  <button
                    onClick={() => handleRemoveArrayItem("phonicsRules", index)}
                    className="hover:bg-teal-100 rounded-full p-0.5 transition-colors"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Target Sentences Card */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold text-slate-800">
              目标句型 (Sentence Frames)
            </label>
            {syllabus.targetSentences.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSyllabus({ ...syllabus, targetSentences: [] })}
                className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="添加目标句型"
              value={inputs.sentence}
              onChange={(e) => setInputs({ ...inputs, sentence: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAddArrayItem("targetSentences", "sentence")}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
            />
            <button
              onClick={() => handleAddArrayItem("targetSentences", "sentence")}
              className="rounded-lg bg-indigo-600 px-3 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto p-1.5 border border-slate-50 rounded-lg bg-slate-25/50 min-h-12">
            {syllabus.targetSentences.length === 0 ? (
              <span className="text-xs text-slate-400 p-1.5 italic">[大纲未要求]</span>
            ) : (
              syllabus.targetSentences.map((sent, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50/50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-100/35"
                >
                  <span className="truncate">{sent}</span>
                  <button
                    onClick={() => handleRemoveArrayItem("targetSentences", index)}
                    className="hover:bg-emerald-100 hover:text-emerald-900 rounded-full p-0.5 transition-colors shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
      )}

      {!syllabus.bookName && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center py-14">
          <BookOpen className="h-10 w-10 text-indigo-400 mx-auto mb-4 animate-pulse" />
          <h3 className="text-base font-bold text-slate-700">等待关联绘本大纲</h3>
          <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto leading-relaxed">
            请在上方快速选择框中「选择分级级别 & 输入绘本编号」并点击 <strong className="text-indigo-600 font-semibold">确认提交并关联绘本大纲</strong> 按钮，或者通过拖拽/点击上传现存的大纲 Excel 文件进行智能交互提取。
          </p>
          <p className="text-xs text-slate-400/80 mt-1 max-w-lg mx-auto">
            成功载入大纲后，系统将在此自动展开并允许编辑词汇、拓展词汇、自然拼读和目标句型等事实底本信息。
          </p>
        </div>
      )}

    </div>
  );
}
