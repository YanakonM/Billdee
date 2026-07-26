// Shared product quick-search used by the invoice item picker and the
// จัดการสินค้า table.
//
// The old behaviour was a flat `includes()` over 4 fields: typing "P-1" ranked
// a product whose *description* happened to contain it the same as the product
// whose code IS "P-1", and the barcode compare was case-sensitive while the
// others were not. This module scores every match into tiers instead, so an
// exact code/barcode hit always wins over a loose substring, and it accepts
// multi-word queries ("โค้ก ขวด") where every word must match somewhere.

// Score tiers. Gaps are wide on purpose so a lower-tier hit can never overtake
// a higher-tier one through tie-break bonuses.
const TIER = {
  exactBarcode: 1000,
  exactCode: 980,
  exactName: 960,
  barcodePrefix: 900,
  codePrefix: 880,
  namePrefix: 800,
  wordPrefix: 700,
  nameContains: 620,
  nameCompact: 600,
  idContains: 560,
  categoryPrefix: 540,
  categoryContains: 500,
  descContains: 460,
  fuzzy: 300,
};

// Out-of-stock products still match (the user may be about to receive more),
// but they sink below equally-good in-stock ones.
const OUT_OF_STOCK_PENALTY = 120;

export function normalizeText(value) {
  return String(value ?? '').toLowerCase().trim();
}

// Drop the separators people type inconsistently, so "P0001" finds "P-0001"
// and "โค้ก 1.25" finds "โค้ก1.25".
function compact(text) {
  return text.replace(/[\s\-_./]/g, '');
}

// Thai runs words together, so word-boundary matching only helps the parts of a
// name that do use separators ("ปูน ตราเสือ", "Coke/Zero").
function hasWordStartingWith(text, token) {
  if (!text) return false;
  return text.split(/[\s/,\-_()·|]+/).some(word => word && word.startsWith(token));
}

// Typo/skip tolerance: are the query's characters present in order?
// "ปนตราเสอ" still finds "ปูนตราเสือ".
function isSubsequence(needle, haystack) {
  if (!needle || !haystack) return false;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

// Best tier this single token reaches against one product. 0 = no match at all,
// which rejects the product entirely (tokens are AND-ed).
function scoreToken(product, token) {
  const name = normalizeText(product.name);
  const code = normalizeText(product.code);
  const barcode = normalizeText(product.barcode);
  const category = normalizeText(product.category);
  const description = normalizeText(product.description);

  if (barcode && barcode === token) return TIER.exactBarcode;
  if (code && code === token) return TIER.exactCode;
  if (name && name === token) return TIER.exactName;

  if (barcode && barcode.startsWith(token)) return TIER.barcodePrefix;
  if (code && code.startsWith(token)) return TIER.codePrefix;
  if (name && name.startsWith(token)) return TIER.namePrefix;

  if (hasWordStartingWith(name, token)) return TIER.wordPrefix;
  if (name && name.includes(token)) return TIER.nameContains;

  const compactToken = compact(token);
  if (compactToken && compact(name).includes(compactToken)) return TIER.nameCompact;
  if (compactToken && (compact(barcode).includes(compactToken) || compact(code).includes(compactToken))) {
    return TIER.idContains;
  }

  if (category && category.startsWith(token)) return TIER.categoryPrefix;
  if (category && category.includes(token)) return TIER.categoryContains;
  if (description && description.includes(token)) return TIER.descContains;

  // Only worth the risk of a false positive once the query is specific enough.
  if (token.length >= 3 && isSubsequence(token, name)) return TIER.fuzzy;

  return 0;
}

function isOutOfStock(product) {
  // stock == null means "not stock-tracked" — never treat that as sold out.
  return product.stock != null && product.stock <= 0;
}

/**
 * Score one product against a query. Returns 0 when it does not match.
 * Exported for tests and for callers that want their own ordering.
 */
export function scoreProduct(product, query) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(product, token);
    if (!score) return 0; // every word must match something
    total += score;
  }
  // Average keeps tiers comparable across queries of different word counts;
  // the bonus still rewards matching more words.
  const score = total / tokens.length + (tokens.length - 1) * 10;
  return Math.max(1, score - (isOutOfStock(product) ? OUT_OF_STOCK_PENALTY : 0));
}

function recencyOf(product) {
  const stamp = product.updatedAt || product.createdAt;
  const time = stamp ? Date.parse(stamp) : NaN;
  return isNaN(time) ? 0 : time;
}

/**
 * Rank products for a search box.
 *
 * An empty query is not "no results" — it returns the most recently
 * added/edited products so the dropdown is useful the moment it opens.
 *
 * @param {Array} products  full product list (already in memory)
 * @param {string} query    what the user typed
 * @param {{limit?: number}} options
 */
export function searchProducts(products, query, { limit = 10 } = {}) {
  const list = Array.isArray(products) ? products : [];
  const q = normalizeText(query);

  if (!q) {
    return [...list]
      .sort((a, b) => recencyOf(b) - recencyOf(a) || String(a.name || '').localeCompare(String(b.name || ''), 'th'))
      .slice(0, limit);
  }

  const scored = [];
  for (const product of list) {
    const score = scoreProduct(product, q);
    if (score > 0) scored.push({ product, score });
  }

  scored.sort((a, b) =>
    b.score - a.score ||
    // Shorter name = the query covers more of it = the more specific hit.
    String(a.product.name || '').length - String(b.product.name || '').length ||
    String(a.product.name || '').localeCompare(String(b.product.name || ''), 'th')
  );

  return scored.slice(0, limit).map(entry => entry.product);
}

/**
 * Same ranking, no cap — for filtering a full table where an empty query must
 * show everything rather than a "recent" shortlist.
 */
export function filterProducts(products, query) {
  const list = Array.isArray(products) ? products : [];
  if (!normalizeText(query)) return list;
  return searchProducts(list, query, { limit: Infinity });
}
