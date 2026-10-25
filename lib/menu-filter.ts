/**
 * Core Menu Filtering Utilities
 * Supports smart grouping: Cafe, Tea, Milk Tea, Topping, and specific categories
 */

export type MenuFilterPresetId = "all" | "coffee" | "tea" | "milk_tea" | "topping";

export interface MenuFilterPreset {
  id: MenuFilterPresetId;
  label: string;
  shortLabel: string;
  icon: string;
  badgeColor: string;
  description: string;
}

export const MENU_FILTER_PRESETS: readonly MenuFilterPreset[] = [
  {
    id: "all",
    label: "Tất cả",
    shortLabel: "Tất cả",
    icon: "✨",
    badgeColor: "bg-[#6f2939] text-white",
    description: "Tất cả các món",
  },
  {
    id: "coffee",
    label: "Cà phê",
    shortLabel: "Cà phê",
    icon: "☕",
    badgeColor: "bg-[#78350f] text-white",
    description: "Cà phê đen, sữa, muối, bạc xỉu, cold brew...",
  },
  {
    id: "tea",
    label: "Trà",
    shortLabel: "Trà",
    icon: "🍃",
    badgeColor: "bg-[#15803d] text-white",
    description: "Trà hoa quả, trà nguyên vị, trà thanh nhiệt...",
  },
  {
    id: "milk_tea",
    label: "Trà sữa",
    shortLabel: "Trà sữa",
    icon: "🧋",
    badgeColor: "bg-[#b45309] text-white",
    description: "Ô long sữa, săn mây, bồng bềnh, gạo khói...",
  },
  {
    id: "topping",
    label: "Topping",
    shortLabel: "Topping",
    icon: "🍮",
    badgeColor: "bg-[#831843] text-white",
    description: "Trân châu, phô mai bồng bềnh, mochi, thạch, kem trứng...",
  },
] as const;

/**
 * Remove Vietnamese accents and normalize for robust search & matching
 */
export function normalizeMenuText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Smart heuristic classifier for menu item preset
 */
export function detectItemPreset(
  item: {
    name: string;
    english_name?: string | null;
    description?: string | null;
    category_id?: string;
  },
  categoryName?: string,
): MenuFilterPresetId {
  const normName = normalizeMenuText(item.name || "");
  const normEn = normalizeMenuText(item.english_name || "");
  const normCat = normalizeMenuText(categoryName || "");
  const normDesc = normalizeMenuText(item.description || "");
  const fullText = `${normName} ${normEn} ${normCat} ${normDesc}`;

  // 1. Topping: explicit category or name indicators
  if (
    fullText.includes("topping") ||
    fullText.includes("tran chau") ||
    fullText.includes("thach") ||
    fullText.includes("phan roi") ||
    fullText.includes("cup rieng") ||
    fullText.includes("pudding") ||
    (normCat.includes("them") && fullText.includes("kem"))
  ) {
    return "topping";
  }

  // 2. Coffee:
  if (
    fullText.includes("ca phe") ||
    fullText.includes("coffee") ||
    fullText.includes("cafe") ||
    fullText.includes("bac xiu") ||
    fullText.includes("espresso") ||
    fullText.includes("cold brew") ||
    fullText.includes("americano") ||
    fullText.includes("latte") ||
    fullText.includes("cappuccino") ||
    fullText.includes("phin")
  ) {
    return "coffee";
  }

  // 3. Milk Tea (Trà sữa, Săn mây, Bồng bềnh, Ô long sữa...):
  if (
    fullText.includes("tra sua") ||
    fullText.includes("milk tea") ||
    fullText.includes("milktea") ||
    fullText.includes("san may") ||
    fullText.includes("olong sua") ||
    fullText.includes("o long sua") ||
    fullText.includes("nhai sua") ||
    fullText.includes("sua tuoi") ||
    fullText.includes("sua dua") ||
    fullText.includes("gao khoi") ||
    fullText.includes("bong benh") ||
    fullText.includes("tuyet may") ||
    fullText.includes("olong nuong") ||
    fullText.includes("o long nuong")
  ) {
    return "milk_tea";
  }

  // 4. Tea:
  if (
    fullText.includes("tra") ||
    fullText.includes("tea") ||
    fullText.includes("o long") ||
    fullText.includes("hoa qua") ||
    fullText.includes("danh danh") ||
    fullText.includes("thanh mai") ||
    fullText.includes("mo xanh") ||
    fullText.includes("chanh hoa") ||
    fullText.includes("que hoa") ||
    fullText.includes("hoa hong") ||
    fullText.includes("moc suong") ||
    fullText.includes("buoi chanh") ||
    fullText.includes("boong do")
  ) {
    return "tea";
  }

  return "all";
}

/**
 * Filter item against preset, category ID and search query
 */
export function matchesMenuFilter(
  item: {
    name: string;
    english_name?: string | null;
    description?: string | null;
    category_id: string;
  },
  categoryName: string,
  filterId: string, // "all" | "coffee" | "tea" | "milk_tea" | "topping" | specific categoryId
  searchQuery = "",
): boolean {
  // Search query check
  if (searchQuery && searchQuery.trim()) {
    const q = normalizeMenuText(searchQuery);
    const n = normalizeMenuText(item.name || "");
    const en = normalizeMenuText(item.english_name || "");
    const desc = normalizeMenuText(item.description || "");
    const cat = normalizeMenuText(categoryName || "");
    const matchSearch =
      n.includes(q) || en.includes(q) || desc.includes(q) || cat.includes(q);
    if (!matchSearch) return false;
  }

  if (!filterId || filterId === "all") return true;

  // Preset checks
  if (filterId === "coffee" || filterId === "preset:coffee") {
    return detectItemPreset(item, categoryName) === "coffee";
  }
  if (filterId === "tea" || filterId === "preset:tea") {
    return detectItemPreset(item, categoryName) === "tea";
  }
  if (filterId === "milk_tea" || filterId === "preset:milk_tea") {
    return detectItemPreset(item, categoryName) === "milk_tea";
  }
  if (filterId === "topping" || filterId === "preset:topping") {
    return detectItemPreset(item, categoryName) === "topping";
  }

  // Specific categoryId match
  return item.category_id === filterId;
}

/**
 * Calculate counts for each filter preset
 */
export function getPresetCounts(
  items: Array<{
    name: string;
    english_name?: string | null;
    description?: string | null;
    category_id: string;
  }>,
  categories: Array<{ id: string; name: string }>,
  optionsCount = 0,
): Record<MenuFilterPresetId, number> {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const counts: Record<MenuFilterPresetId, number> = {
    all: items.length + optionsCount,
    coffee: 0,
    tea: 0,
    milk_tea: 0,
    topping: optionsCount,
  };

  for (const item of items) {
    const catName = catMap.get(item.category_id) || "";
    const preset = detectItemPreset(item, catName);
    if (preset !== "all" && counts[preset] !== undefined) {
      counts[preset]++;
    }
  }

  return counts;
}
