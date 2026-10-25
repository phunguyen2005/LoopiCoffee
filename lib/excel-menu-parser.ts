import * as XLSX from "xlsx";

export interface ColumnMapping {
  name: number; // index in row (-1 if not mapped)
  basePrice: number;
  categoryName: number;
  englishName: number;
  description: number;
  badge: number;
  allowsSize: number;
  allowsSugar: number;
  allowsIce: number;
  allowsToppings: number;
  isAvailable: number;
}

export interface ParsedItemCandidate {
  rowIndex: number;
  name: string;
  basePrice: number;
  categoryName?: string;
  englishName?: string;
  description?: string;
  badge?: string;
  allowsSize: boolean;
  allowsSugar: boolean;
  allowsIce: boolean;
  allowsToppings: boolean;
  isAvailable: boolean;
  isValid: boolean;
  errors: string[];
}

export interface ParseExcelResult {
  fileName: string;
  headers: string[];
  headerRowIndex: number;
  totalRows: number;
  mapping: ColumnMapping;
  items: ParsedItemCandidate[];
  detectedCategories: string[];
  rawRows: string[][];
}

// Strip Vietnamese accents and normalize for fuzzy matching
export function normalizeKeyword(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Parse currency / price from various spreadsheet formats:
// "35.000", "35,000", "35000đ", "35k", "35K", "35000 VND", 35000, 35 -> 35000
export function parsePrice(val: unknown): number | null {
  if (typeof val === "number") {
    if (isNaN(val) || val < 0) return null;
    // Heuristic: if user enters 35 for 35,000 in cafe menu context
    if (val > 0 && val < 500) return Math.round(val * 1000);
    return Math.round(val);
  }

  if (typeof val !== "string") return null;
  const raw = val.trim();
  if (!raw) return null;

  // Handle "35k" or "35.5k"
  const kMatch = raw.match(/^([0-9]+(?:[.,][0-9]+)?)\s*k$/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(",", "."));
    if (!isNaN(num) && num >= 0) return Math.round(num * 1000);
  }

  // Remove currency words, spaces, dots, commas
  let cleaned = raw
    .replace(/(?:vnd|vnđ|đ|dong|dồng|\$|usd)/gi, "")
    .replace(/\s+/g, "");

  // If format is like "35.000" or "35,000"
  if (/^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/[.,]/g, "");
  } else {
    cleaned = cleaned.replace(/[.,](?=[0-9]{3}\b)/g, "").replace(",", ".");
  }

  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return null;
  if (num > 0 && num < 500) return Math.round(num * 1000);
  return Math.round(num);
}

// Parse boolean values in Vietnamese/English
export function parseBoolean(val: unknown, defaultValue = true): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val !== "string") return defaultValue;

  const norm = normalizeKeyword(val);
  if (!norm) return defaultValue;

  if (["co", "yes", "y", "1", "true", "x", "v", "ok", "bat", "con", "con hang"].includes(norm)) {
    return true;
  }
  if (["khong", "no", "n", "0", "false", "k", "ko", "tat", "het", "het hang"].includes(norm)) {
    return false;
  }

  return defaultValue;
}

// Keywords mapping definition
const FIELD_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  name: [
    "ten mon",
    "ten do uong",
    "ten san pham",
    "mon",
    "ten",
    "item name",
    "product name",
    "name",
    "mon an",
    "thuc uong",
    "san pham",
    "do uong",
    "mat hang",
    "ten mat hang",
    "thuc don",
    "dish",
    "beverage",
    "drink",
    "item",
  ],
  basePrice: [
    "gia",
    "gia ban",
    "don gia",
    "don gia ban",
    "so tien",
    "gia tien",
    "price",
    "base price",
    "cost",
    "amount",
    "tien",
    "thanh tien",
    "gia niem yet",
    "don gia niem yet",
    "retail price",
    "vnd",
  ],
  categoryName: [
    "danh muc",
    "loai",
    "loai mon",
    "nhom",
    "nhom mon",
    "category",
    "group",
    "phan loai",
    "dong san pham",
    "nhom thuc don",
    "nhom san pham",
    "menu group",
  ],
  englishName: [
    "ten tieng anh",
    "tieng anh",
    "english name",
    "english",
    "en name",
    "eng name",
  ],
  description: [
    "mo ta",
    "chi tiet",
    "ghi chu",
    "description",
    "desc",
    "note",
    "thanh phan",
    "huong vi",
  ],
  badge: [
    "badge",
    "nhan",
    "tag",
    "noi bat",
    "highlight",
    "bestseller",
    "dac biet",
    "hot",
    "moi",
  ],
  allowsSize: ["size", "kich co", "chon size", "co size"],
  allowsSugar: ["duong", "sugar", "chon duong", "muc duong"],
  allowsIce: ["da", "ice", "chon da", "muc da"],
  allowsToppings: ["topping", "toppings", "thach", "chon topping", "them topping"],
  isAvailable: ["con mon", "trang thai", "co san", "available", "status", "con hang"],
};

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    name: -1,
    basePrice: -1,
    categoryName: -1,
    englishName: -1,
    description: -1,
    badge: -1,
    allowsSize: -1,
    allowsSugar: -1,
    allowsIce: -1,
    allowsToppings: -1,
    isAvailable: -1,
  };

  const assignedColumns = new Set<number>();

  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS) as Array<[keyof ColumnMapping, string[]]>) {
    let bestCol = -1;
    let highestScore = 0;

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      if (assignedColumns.has(colIdx)) continue;
      const normH = normalizeKeyword(headers[colIdx]);
      if (!normH) continue;

      for (const kw of keywords) {
        if (normH === kw) {
          if (highestScore < 100) {
            highestScore = 100;
            bestCol = colIdx;
          }
        } else if (normH.startsWith(kw) || normH.includes(kw)) {
          if (highestScore < 50) {
            highestScore = 50;
            bestCol = colIdx;
          }
        }
      }
    }

    if (bestCol !== -1) {
      mapping[field] = bestCol;
      assignedColumns.add(bestCol);
    }
  }

  return mapping;
}

// Convert parsed 2D raw string array into item candidates using mapping
export function buildItemsFromSheetData(
  rows: string[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
): { items: ParsedItemCandidate[]; detectedCategories: string[] } {
  const items: ParsedItemCandidate[] = [];
  const categoriesSet = new Set<string>();

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => !c || !c.trim())) continue; // Skip blank rows

    const errors: string[] = [];
    const rawName = mapping.name !== -1 && row[mapping.name] ? row[mapping.name].trim() : "";
    if (!rawName) {
      errors.push("Thiếu tên món");
    }

    const rawPrice = mapping.basePrice !== -1 ? row[mapping.basePrice] : undefined;
    const parsedPrice = parsePrice(rawPrice);
    if (parsedPrice === null || parsedPrice <= 0) {
      errors.push("Giá không hợp lệ (cần > 0đ)");
    }

    const rawCategory = mapping.categoryName !== -1 && row[mapping.categoryName] ? row[mapping.categoryName].trim() : "";
    if (rawCategory) {
      categoriesSet.add(rawCategory);
    }

    const rawEnName = mapping.englishName !== -1 && row[mapping.englishName] ? row[mapping.englishName].trim() : undefined;
    const rawDesc = mapping.description !== -1 && row[mapping.description] ? row[mapping.description].trim() : undefined;
    const rawBadge = mapping.badge !== -1 && row[mapping.badge] ? row[mapping.badge].trim() : undefined;

    const allowsSize = mapping.allowsSize !== -1 ? parseBoolean(row[mapping.allowsSize], true) : true;
    const allowsSugar = mapping.allowsSugar !== -1 ? parseBoolean(row[mapping.allowsSugar], true) : true;
    const allowsIce = mapping.allowsIce !== -1 ? parseBoolean(row[mapping.allowsIce], true) : true;
    const allowsToppings = mapping.allowsToppings !== -1 ? parseBoolean(row[mapping.allowsToppings], true) : true;
    const isAvailable = mapping.isAvailable !== -1 ? parseBoolean(row[mapping.isAvailable], true) : true;

    items.push({
      rowIndex: r + 1,
      name: rawName,
      basePrice: parsedPrice ?? 0,
      categoryName: rawCategory || undefined,
      englishName: rawEnName,
      description: rawDesc,
      badge: rawBadge,
      allowsSize,
      allowsSugar,
      allowsIce,
      allowsToppings,
      isAvailable,
      isValid: errors.length === 0,
      errors,
    });
  }

  return {
    items,
    detectedCategories: Array.from(categoriesSet),
  };
}

// Robust native CSV/TSV parser supporting quotes, commas, semicolons, tabs
export function parseCsvText(text: string): string[][] {
  // Strip BOM
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = cleaned.split(/\r?\n/);

  // Detect delimiter: check first non-empty line
  let delimiter = ",";
  const firstLine = lines.find((l) => l.trim().length > 0) || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t";
  else if (semiCount > commaCount) delimiter = ";";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows;
}

// Find the header row among the first 5 rows
export function findHeaderRow(rows: string[][]): { headerRowIndex: number; headers: string[] } {
  let bestRow = 0;
  let maxMatched = -1;

  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    let matched = 0;
    for (const cell of row) {
      const norm = normalizeKeyword(cell);
      if (!norm) continue;
      for (const keywords of Object.values(FIELD_KEYWORDS)) {
        if (keywords.some((k) => norm === k || norm.includes(k))) {
          matched++;
          break;
        }
      }
    }

    if (matched > maxMatched) {
      maxMatched = matched;
      bestRow = r;
    }
  }

  return {
    headerRowIndex: bestRow,
    headers: (rows[bestRow] || []).map((c) => String(c || "").trim()),
  };
}

// Master function to parse any file (Excel or CSV)
export async function parseExcelOrCsvFile(file: File): Promise<ParseExcelResult> {
  const fileName = file.name;
  const isCsv = /\.csv$/i.test(fileName);

  let rawRows: string[][] = [];

  if (isCsv) {
    const text = await file.text();
    rawRows = parseCsvText(text);
  } else {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("File Excel không có trang tính (sheet) nào.");
    }
    const sheet = workbook.Sheets[firstSheetName];
    // Read sheet as 2D array of string/number
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    rawRows = aoa.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : []));
  }

  if (rawRows.length === 0) {
    throw new Error("File trống hoặc không chứa dữ liệu.");
  }

  const { headerRowIndex, headers } = findHeaderRow(rawRows);
  const mapping = autoDetectColumnMapping(headers);
  const { items, detectedCategories } = buildItemsFromSheetData(rawRows, headerRowIndex, mapping);

  return {
    fileName,
    headers,
    headerRowIndex,
    totalRows: rawRows.length,
    mapping,
    items,
    detectedCategories,
    rawRows,
  };
}

// Generate sample Excel template
export function generateSampleExcelFile(): Uint8Array {
  const headers = [
    "Tên món (*)",
    "Giá bán (*)",
    "Danh mục",
    "Tên tiếng Anh",
    "Mô tả",
    "Nhãn (Badge)",
    "Cho chọn Size",
    "Cho chọn Đường",
    "Cho chọn Đá",
    "Cho chọn Topping",
  ];

  const sampleData = [
    [
      "Cà phê sữa đá",
      "35000",
      "Cà phê truyền thống",
      "Iced Milk Coffee",
      "Cà phê pha phin truyền thống thơm béo",
      "Bán chạy",
      "Có",
      "Có",
      "Có",
      "Có",
    ],
    [
      "Cà phê đen đá",
      "30000",
      "Cà phê truyền thống",
      "Iced Black Coffee",
      "Cà phê Robusta mộc đậm đà nguyên bản",
      "",
      "Có",
      "Có",
      "Có",
      "Không",
    ],
    [
      "Bạc xỉu 3 tầng",
      "38000",
      "Cà phê truyền thống",
      "White Coffee",
      "Nhiều sữa ít cà phê, béo ngậy ngọt ngào",
      "Hot",
      "Có",
      "Có",
      "Có",
      "Có",
    ],
    [
      "Trà đào cam sả",
      "45000",
      "Trà trái cây",
      "Peach Orange Lemongrass Tea",
      "Vị chua thanh ngọt dịu kèm đào miếng giòn",
      "Mới",
      "Có",
      "Có",
      "Có",
      "Có",
    ],
    [
      "Trà vải hoa hồng",
      "45000",
      "Trà trái cây",
      "Lychee Rose Tea",
      "Hương hoa hồng thoang thoảng cùng vải tươi",
      "",
      "Có",
      "Có",
      "Có",
      "Có",
    ],
    [
      "Trà sữa Oolong nướng",
      "48000",
      "Trà sữa",
      "Roasted Oolong Milk Tea",
      "Trà đậm vị nướng hòa quyện sữa tươi",
      "Bán chạy",
      "Có",
      "Có",
      "Có",
      "Có",
    ],
    [
      "Bánh Croissant bơ tỏi",
      "28000",
      "Bánh ngọt",
      "Garlic Butter Croissant",
      "Bánh sừng bò nướng thơm giòn béo bơ",
      "",
      "Không",
      "Không",
      "Không",
      "Không",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 25 }, // Tên món
    { wch: 14 }, // Giá bán
    { wch: 22 }, // Danh mục
    { wch: 25 }, // Tên tiếng Anh
    { wch: 38 }, // Mô tả
    { wch: 14 }, // Badge
    { wch: 15 }, // Size
    { wch: 16 }, // Đường
    { wch: 15 }, // Đá
    { wch: 16 }, // Topping
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Thực đơn");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
