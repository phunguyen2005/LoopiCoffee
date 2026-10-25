"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  FolderPlus,
  Sparkles,
} from "lucide-react";
import {
  parseExcelOrCsvFile,
  generateSampleExcelFile,
  buildItemsFromSheetData,
  ColumnMapping,
  ParseExcelResult,
  ParsedItemCandidate,
} from "@/lib/excel-menu-parser";
import { formatVND } from "../order/menu-card";
import { useModalDialog } from "../order/use-modal-dialog";
import { ClientPortal } from "@/components/ui/client-portal";

export interface MenuCategoryOption {
  id: string;
  name: string;
}

interface MenuImportModalProps {
  open: boolean;
  onClose: () => void;
  categories: MenuCategoryOption[];
  existingItemNames?: Set<string>;
  onImportSuccess: (result: { createdItems: number; updatedItems?: number; createdCategories: number }) => void;
}

export function MenuImportModal({
  open,
  onClose,
  categories,
  existingItemNames,
  onImportSuccess,
}: MenuImportModalProps) {
  const dialogRef = useModalDialog<HTMLDivElement>(open, onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseExcelResult | null>(null);

  // Column mapping state
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(null);
  const [showCustomMapping, setShowCustomMapping] = useState(false);

  // Fallback category and auto-create options
  const [fallbackCategoryId, setFallbackCategoryId] = useState<string>(categories[0]?.id || "");
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{
    createdItems: number;
    updatedItems: number;
    createdCategories: number;
  } | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Recompute items whenever currentMapping or rawRows change
  const displayedCandidates: ParsedItemCandidate[] = useMemo(() => {
    if (!parseResult) return [];
    if (!currentMapping) return parseResult.items;
    const { items } = buildItemsFromSheetData(
      parseResult.rawRows,
      parseResult.headerRowIndex,
      currentMapping,
    );
    return items;
  }, [parseResult, currentMapping]);

  const validItems = useMemo(
    () => displayedCandidates.filter((i) => i.isValid),
    [displayedCandidates],
  );
  const invalidItems = useMemo(
    () => displayedCandidates.filter((i) => !i.isValid),
    [displayedCandidates],
  );

  // Existing category names set for quick checking
  const existingCategoryNames = useMemo(
    () => new Set(categories.map((c) => c.name.toLowerCase().trim())),
    [categories],
  );

  const handleProcessFile = async (selectedFile: File) => {
    const isSupported = /\.(xlsx|xls|csv)$/i.test(selectedFile.name);
    if (!isSupported) {
      setParseError("Vui lòng tải lên file định dạng Excel (.xlsx, .xls) hoặc .csv.");
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const result = await parseExcelOrCsvFile(selectedFile);
      setParseResult(result);
      setCurrentMapping(result.mapping);
      // Auto-set fallback category if empty
      if (!fallbackCategoryId && categories.length > 0) {
        setFallbackCategoryId(categories[0].id);
      }
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Không thể đọc dữ liệu từ file.");
      setParseResult(null);
      setCurrentMapping(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      void handleProcessFile(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      void handleProcessFile(files[0]);
    }
  };

  const handleDownloadSample = () => {
    try {
      const bytes = generateSampleExcelFile();
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loopycafe_menu_sample.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download sample file:", err);
    }
  };

  const handleUpdateMappingField = (field: keyof ColumnMapping, columnIndex: number) => {
    if (!currentMapping) return;
    setCurrentMapping({
      ...currentMapping,
      [field]: columnIndex,
    });
  };

  const handleSubmitImport = async () => {
    if (validItems.length === 0) {
      setSubmitError("Không có món hợp lệ nào để nhập.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        items: validItems.map((item) => ({
          name: item.name,
          englishName: item.englishName,
          categoryName: item.categoryName,
          fallbackCategoryId: fallbackCategoryId || undefined,
          basePrice: item.basePrice,
          description: item.description,
          badge: item.badge,
          allowsSize: item.allowsSize,
          allowsSugar: item.allowsSugar,
          allowsIce: item.allowsIce,
          allowsToppings: item.allowsToppings,
          isAvailable: item.isAvailable,
        })),
        fallbackCategoryId: fallbackCategoryId || undefined,
        autoCreateCategories,
      };

      const res = await fetch("/api/owner/menu/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        success?: boolean;
        createdItems?: number;
        updatedItems?: number;
        createdCategories?: number;
        error?: string;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Lỗi khi nhập thực đơn vào hệ thống.");
      }

      setSubmitSuccess({
        createdItems: data.createdItems || 0,
        updatedItems: data.updatedItems || 0,
        createdCategories: data.createdCategories || 0,
      });

      onImportSuccess({
        createdItems: data.createdItems || 0,
        updatedItems: data.updatedItems || 0,
        createdCategories: data.createdCategories || 0,
      });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi nhập thực đơn.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setCurrentMapping(null);
    setParseError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!open) return null;

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div
          className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
          onClick={isSubmitting ? undefined : onClose}
          aria-hidden="true"
        />

        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-menu-title"
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#eee3df] max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden overscroll-contain animate-in slide-in-from-bottom-3 duration-200"
        >
          {/* Mobile Drag Indicator */}
          <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        {/* Modal Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 pb-3 border-b border-[#f5efec] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6f2939]/10 text-[#6f2939] flex items-center justify-center shrink-0">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 id="import-menu-title" className="text-base sm:text-lg font-extrabold text-[#332a2b]">
                Nhập thực đơn từ Excel / CSV
              </h2>
              <p className="text-xs text-[#7b6f70] mt-0.5">
                Hệ thống tự động nhận diện cột Tên món, Giá bán, Danh mục và tuỳ chọn kèm theo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSample}
              title="Tải file mẫu Excel"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#e6dad5] hover:bg-[#fffaf4] text-[#6f2939] text-xs font-semibold transition-colors"
            >
              <Download size={14} />
              <span>Tải file mẫu</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Đóng"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full hover:bg-[#fffaf4] text-[#7b6f70] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body with Custom Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scroll">
          {/* Download Sample Banner on Mobile */}
          <div className="sm:hidden flex items-center justify-between p-3 rounded-xl bg-[#fffaf4] border border-[#f2e6e1]">
            <div className="text-xs text-[#554a4c]">
              <span className="font-semibold text-[#6f2939]">Chưa có file mẫu?</span> Tải mẫu chuẩn (.xlsx)
            </div>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="px-2.5 py-1 rounded-lg bg-[#6f2939] text-white text-[11px] font-bold flex items-center gap-1"
            >
              <Download size={12} />
              <span>Tải mẫu</span>
            </button>
          </div>

          {/* Success State */}
          {submitSuccess ? (
            <div className="py-12 px-4 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#332a2b]">Cập nhật thực đơn thành công!</h3>
                <p className="text-xs text-[#7b6f70] mt-1.5 max-w-md mx-auto leading-relaxed">
                  {submitSuccess.updatedItems > 0 && (
                    <span>
                      Đã cập nhật giá <strong className="text-blue-700">{submitSuccess.updatedItems} món</strong> có sẵn.{" "}
                    </span>
                  )}
                  {submitSuccess.createdItems > 0 && (
                    <span>
                      Đã thêm mới <strong className="text-emerald-700">{submitSuccess.createdItems} món</strong> vào thực đơn.{" "}
                    </span>
                  )}
                  {submitSuccess.createdItems === 0 && submitSuccess.updatedItems === 0 && (
                    <span>Dữ liệu thực đơn đã được đồng bộ chuẩn xác.{" "}</span>
                  )}
                  {submitSuccess.createdCategories > 0 && (
                    <span>
                      (Tự động tạo mới{" "}
                      <strong className="text-indigo-700">{submitSuccess.createdCategories} danh mục</strong>)
                    </span>
                  )}
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-[#6f2939] text-white text-xs font-bold hover:bg-[#5a1f2d] shadow-sm transition-all"
                >
                  Hoàn tất & Đóng
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl border border-[#e6dad5] text-[#554a4c] text-xs font-semibold hover:bg-[#fffaf4] transition-all"
                >
                  Nhập thêm file khác
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File Dropzone */}
              {!parseResult ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-[#6f2939] bg-[#6f2939]/5 scale-[0.99]"
                      : "border-[#e0d3ce] hover:border-[#6f2939] hover:bg-[#fffaf4]/60 bg-white"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-[#fff0f3] text-[#6f2939] mx-auto flex items-center justify-center mb-3">
                    {isParsing ? (
                      <RefreshCw size={26} className="animate-spin" />
                    ) : (
                      <UploadCloud size={28} />
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#332a2b]">
                    {isParsing ? "Đang đọc và phân tích file..." : "Kéo thả file Excel hoặc CSV vào đây"}
                  </h3>
                  <p className="text-xs text-[#7b6f70] mt-1 max-w-sm mx-auto">
                    Hỗ trợ định dạng <strong>.xlsx</strong>, <strong>.xls</strong> hoặc <strong>.csv</strong>. Tự động nhận diện tiêu đề cột tiếng Việt hoặc tiếng Anh.
                  </p>
                  <div className="mt-4">
                    <span className="inline-block px-4 py-2 rounded-xl bg-[#6f2939] text-white text-xs font-bold shadow-xs">
                      Chọn file từ thiết bị
                    </span>
                  </div>
                </div>
              ) : (
                /* Selected File Header */
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-[#fbf8f6] rounded-2xl border border-[#eee3df] gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#6f2939]/10 text-[#6f2939] flex items-center justify-center shrink-0">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#332a2b] flex items-center gap-2">
                        <span>{parseResult.fileName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                          {displayedCandidates.length} dòng
                        </span>
                      </div>
                      <div className="text-[11px] text-[#7b6f70] mt-0.5">
                        Tìm thấy tiêu đề ở hàng #{parseResult.headerRowIndex + 1} • Nhận diện{" "}
                        {validItems.length} món hợp lệ
                        {invalidItems.length > 0 && (
                          <span className="text-amber-700 ml-1">
                            ({invalidItems.length} dòng cần kiểm tra)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCustomMapping(!showCustomMapping)}
                      className="px-3 py-1.5 rounded-xl border border-[#e6dad5] bg-white text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4] flex items-center gap-1.5 transition-colors"
                    >
                      <span>Tuỳ chỉnh cột</span>
                      {showCustomMapping ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-3 py-1.5 rounded-xl border border-[#e6dad5] bg-white text-xs font-semibold text-[#991b1b] hover:bg-[#fff5f5] transition-colors"
                    >
                      Đổi file khác
                    </button>
                  </div>
                </div>
              )}

              {/* Parsing / Upload Error Message */}
              {(parseError || submitError) && (
                <div className="p-3.5 rounded-2xl bg-[#fff5f5] border border-[#fecaca] text-xs text-[#991b1b] flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Lưu ý khi nhập dữ liệu:</div>
                    <div className="mt-0.5">{parseError || submitError}</div>
                  </div>
                </div>
              )}

              {/* Collapsible Column Mapping Settings */}
              {parseResult && currentMapping && showCustomMapping && (
                <div className="p-4 rounded-2xl bg-[#fffaf4] border border-[#eee3df] space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#332a2b] flex items-center gap-1.5">
                      <Sparkles size={14} className="text-[#6f2939]" />
                      <span>Ánh xạ cột dữ liệu trong file:</span>
                    </h4>
                    <span className="text-[11px] text-[#7b6f70]">
                      Thay đổi nếu hệ thống nhận diện chưa đúng vị trí cột
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {/* Tên món */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#554a4c] mb-1">
                        Tên món <span className="text-[#b91c1c]">*</span>
                      </label>
                      <select
                        value={currentMapping.name}
                        onChange={(e) => handleUpdateMappingField("name", Number(e.target.value))}
                        className="w-full text-xs min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        <option value={-1}>-- Chưa ánh xạ --</option>
                        {parseResult.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            [Cột {idx + 1}] {h || `(Cột ${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Giá bán */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#554a4c] mb-1">
                        Giá bán <span className="text-[#b91c1c]">*</span>
                      </label>
                      <select
                        value={currentMapping.basePrice}
                        onChange={(e) => handleUpdateMappingField("basePrice", Number(e.target.value))}
                        className="w-full text-xs min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        <option value={-1}>-- Chưa ánh xạ --</option>
                        {parseResult.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            [Cột {idx + 1}] {h || `(Cột ${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Danh mục */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#554a4c] mb-1">
                        Danh mục món
                      </label>
                      <select
                        value={currentMapping.categoryName}
                        onChange={(e) => handleUpdateMappingField("categoryName", Number(e.target.value))}
                        className="w-full text-xs min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        <option value={-1}>-- Không có trong file --</option>
                        {parseResult.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            [Cột {idx + 1}] {h || `(Cột ${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tên tiếng Anh */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#554a4c] mb-1">
                        Tên tiếng Anh
                      </label>
                      <select
                        value={currentMapping.englishName}
                        onChange={(e) => handleUpdateMappingField("englishName", Number(e.target.value))}
                        className="w-full text-xs min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        <option value={-1}>-- Không chọn --</option>
                        {parseResult.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            [Cột {idx + 1}] {h || `(Cột ${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mô tả */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#554a4c] mb-1">Mô tả món</label>
                      <select
                        value={currentMapping.description}
                        onChange={(e) => handleUpdateMappingField("description", Number(e.target.value))}
                        className="w-full text-xs min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        <option value={-1}>-- Không chọn --</option>
                        {parseResult.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            [Cột {idx + 1}] {h || `(Cột ${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Nhãn (Badge) */}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#554a4c] mb-1">
                        Nhãn (Mới, Bán chạy...)
                      </label>
                      <select
                        value={currentMapping.badge}
                        onChange={(e) => handleUpdateMappingField("badge", Number(e.target.value))}
                        className="w-full text-xs min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        <option value={-1}>-- Không chọn --</option>
                        {parseResult.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            [Cột {idx + 1}] {h || `(Cột ${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Fallback & Auto-Create Settings */}
              {parseResult && (
                <div className="p-4 rounded-2xl bg-white border border-[#eee3df] space-y-3">
                  <h4 className="text-xs font-bold text-[#332a2b]">Xử lý danh mục món:</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="import-fallback-category"
                        className="block text-xs font-semibold text-[#554a4c] mb-1"
                      >
                        Danh mục mặc định (nếu dòng trong file để trống)
                      </label>
                      <select
                        id="import-fallback-category"
                        value={fallbackCategoryId}
                        onChange={(e) => setFallbackCategoryId(e.target.value)}
                        className="w-full text-xs min-h-[40px] px-3 py-2 rounded-xl border border-[#e6dad5] bg-white"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center pt-2 sm:pt-6">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoCreateCategories}
                          onChange={(e) => setAutoCreateCategories(e.target.checked)}
                          className="mt-0.5 rounded text-[#6f2939] focus:ring-[#6f2939] h-4 w-4"
                        />
                        <div className="text-xs text-[#554a4c]">
                          <span className="font-semibold text-[#332a2b]">
                            Tự động tạo danh mục mới
                          </span>
                          <p className="text-[11px] text-[#7b6f70] mt-0.5">
                            Nếu tên danh mục trong file chưa có sẵn trên hệ thống, tự động thêm danh mục mới.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Candidate Items Table */}
              {parseResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#332a2b]">
                      Xem trước dữ liệu ({validItems.length} món sẵn sàng nhập):
                    </h4>
                    {invalidItems.length > 0 && (
                      <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Bỏ qua {invalidItems.length} dòng không hợp lệ
                      </span>
                    )}
                  </div>

                  <div className="border border-[#eee3df] rounded-2xl overflow-hidden bg-white max-h-[320px] overflow-y-auto custom-scroll">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#fbf8f6] text-[#7b6f70] font-semibold border-b border-[#eee3df] sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">#</th>
                          <th className="py-2.5 px-3">Tên món</th>
                          <th className="py-2.5 px-3">Giá bán</th>
                          <th className="py-2.5 px-3">Danh mục</th>
                          <th className="py-2.5 px-3">Tuỳ chọn</th>
                          <th className="py-2.5 px-3 text-right">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f5efec]">
                        {displayedCandidates.map((candidate, idx) => {
                          const catName =
                            candidate.categoryName ||
                            categories.find((c) => c.id === fallbackCategoryId)?.name ||
                            "Chưa phân loại";
                          const isNewCat =
                            candidate.categoryName &&
                            !existingCategoryNames.has(candidate.categoryName.toLowerCase().trim());

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-[#fffaf4]/60 transition-colors ${
                                !candidate.isValid ? "bg-amber-50/50" : ""
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center text-[#9c9391]">
                                {candidate.rowIndex}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-[#332a2b]">
                                  {candidate.name || <span className="text-rose-500 italic">Trống</span>}
                                </div>
                                {candidate.englishName && (
                                  <div className="text-[11px] text-[#7b6f70]">
                                    {candidate.englishName}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-[#6f2939]">
                                {candidate.basePrice > 0 ? (
                                  formatVND(candidate.basePrice)
                                ) : (
                                  <span className="text-rose-500">0 đ</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[#554a4c]">{catName}</span>
                                  {isNewCat && autoCreateCategories && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                                      + Danh mục mới
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1 text-[10px] text-[#7b6f70] flex-wrap">
                                  {candidate.allowsSize && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#f5efec]">Size</span>
                                  )}
                                  {candidate.allowsSugar && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#f5efec]">Đường</span>
                                  )}
                                  {candidate.allowsIce && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#f5efec]">Đá</span>
                                  )}
                                  {candidate.allowsToppings && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#f5efec]">Topping</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                {candidate.isValid ? (
                                  (() => {
                                    const isExisting = existingItemNames?.has(candidate.name.toLowerCase().trim());
                                    return (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                          isExisting
                                            ? "bg-blue-100 text-blue-800 border border-blue-200"
                                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                        }`}
                                      >
                                        <CheckCircle2 size={12} />
                                        <span>{isExisting ? "Cập nhật giá" : "Món mới"}</span>
                                      </span>
                                    );
                                  })()
                                ) : (
                                  <span
                                    title={candidate.errors.join(", ")}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-semibold cursor-help"
                                  >
                                    <AlertTriangle size={12} />
                                    <span>{candidate.errors[0] || "Lỗi"}</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!submitSuccess && (
          <div className="p-4 sm:p-5 border-t border-[#f5efec] bg-[#fbf8f6] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-[#7b6f70] text-center sm:text-left">
              {parseResult && validItems.length > 0 ? (
                <span>
                  Sẵn sàng thêm <strong>{validItems.length} món</strong> vào thực đơn
                </span>
              ) : (
                <span>Chọn file để hệ thống tự động nhận diện danh sách món</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 sm:flex-none min-h-[42px] px-4 py-2 rounded-xl border border-[#e6dad5] bg-white text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4] transition-colors"
              >
                Đóng
              </button>

              <button
                type="button"
                disabled={!parseResult || validItems.length === 0 || isSubmitting}
                onClick={handleSubmitImport}
                className="flex-1 sm:flex-none min-h-[42px] px-5 py-2 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Đang nhập dữ liệu...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Xác nhận nhập ({validItems.length} món)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ClientPortal>
  );
}
