export interface Syllabus {
  level: string;
  bookName: string;
  bookNumber?: string;
  wordCount?: string;
  coreWords: string[];
  targetSentences: string[];
  phonicsRules: string[];
  hfw: string[];
  rawExtractedText?: string;
  readerText?: string;
}

export interface MaterialFile {
  name: string;
  uploaded: boolean;
  text: string;
  size?: number;
  images?: Array<{ mimeType: string; data: string }>; // Base64 data of rendered pages
  pagesCount?: number;
}

export interface UploadedMaterials {
  book: MaterialFile;
  worksheet: MaterialFile;
  teacherGuide: MaterialFile;
  readingReport: MaterialFile;
}

export interface AuditLog {
  id: string;
  time: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
}

export interface AuditIssue {
  id: string;
  type: "cross_check" | "language" | "pedagogy" | "detail" | "worksheet" | "other";
  typeLabel: string;
  location: string;
  currentContent: string;
  suggestion: string;
  problem?: string;
  syllabusBasis?: string;
  suggestedRevision?: string;
  action?: string;
  severity?: string;
  confidence?: string;
  file?: string;
  pageOrSlide?: string;
}

export interface AuditScope {
  uploadedFiles: string[];
  notProvided: string[];
}


export interface ExcludedSuspicion {
  suspectedIssue: string;
  reason: string;
}
