/**
 * Ghost Job Tracker - Content Script
 * Highlights company names on web pages based on their confidence score.
 */

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA',
  'SELECT', 'BUTTON', 'OPTION', 'HEAD', 'META', 'LINK',
]);

let companyPattern = null;
let companyMap = {}; // lowercase name → company data

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Determine highlight level from confidence score
 */
function getLevel(confidence) {
  if (confidence < 50) return 'low';
  if (confidence < 100) return 'medium';
  return 'high';
}

/**
 * Build regex and lookup map from companies object
 */
function buildPattern(companies) {
  const entries = Object.values(companies).filter((c) => c.name);
  if (entries.length === 0) {
    companyPattern = null;
    companyMap = {};
    return;
  }

  // Sort longest first to avoid partial matches
  entries.sort((a, b) => b.name.length - a.name.length);

  companyMap = {};
  const parts = [];
  for (const c of entries) {
    const normalized = c.name.trim();
    if (!normalized) continue;
    companyMap[normalized.toLowerCase()] = c;
    parts.push(escapeRegex(normalized));
  }

  if (parts.length === 0) {
    companyPattern = null;
    return;
  }

  // Case-insensitive, whole-word boundaries
  companyPattern = new RegExp(`\\b(${parts.join('|')})\\b`, 'gi');
}

/**
 * Check if a node is inside a ghostjob highlight or a skipped element
 */
function shouldSkipNode(node) {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.classList && el.classList.contains('ghostjob-highlight')) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Highlight text nodes within a root element
 */
function highlightInRoot(root) {
  if (!companyPattern) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
      if (shouldSkipNode(node)) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    companyPattern.lastIndex = 0;

    if (!companyPattern.test(text)) continue;
    companyPattern.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = companyPattern.exec(text)) !== null) {
      // Text before match
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const matchedName = match[0];
      const company = companyMap[matchedName.toLowerCase()];
      if (!company) {
        frag.appendChild(document.createTextNode(matchedName));
        lastIndex = match.index + matchedName.length;
        continue;
      }

      const confidence = company.confidence != null ? company.confidence : 100;
      const level = getLevel(confidence);
      const reportCount = company.reportCount || 0;
      const tooltip = `${company.name} | Score: ${confidence} | ${reportCount} report${reportCount !== 1 ? 's' : ''}`;

      const span = document.createElement('span');
      span.className = `ghostjob-highlight ghostjob-${level}`;
      span.setAttribute('data-tooltip', tooltip);
      span.textContent = matchedName;

      frag.appendChild(span);
      lastIndex = match.index + matchedName.length;
    }

    // Remaining text
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    if (frag.childNodes.length > 0) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }
}

/**
 * Remove all existing highlights (unwrap spans back to text)
 */
function removeHighlights() {
  const spans = document.querySelectorAll('.ghostjob-highlight');
  for (const span of spans) {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    }
  }
}

/**
 * Run highlighting on the full document body
 */
function runHighlighting() {
  if (!companyPattern || !document.body) return;
  highlightInRoot(document.body);
}

/**
 * Load companies from storage and highlight
 */
async function loadAndHighlight() {
  const result = await chrome.storage.local.get('companiesCache');
  const companies = result.companiesCache || {};
  buildPattern(companies);
  runHighlighting();
}

// --- MutationObserver for dynamic content ---
let mutationTimer = null;
const observer = new MutationObserver((mutations) => {
  if (!companyPattern) return;

  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    // Collect added nodes that are elements (not our own spans)
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (
          added.nodeType === Node.ELEMENT_NODE &&
          !added.classList.contains('ghostjob-highlight')
        ) {
          highlightInRoot(added);
        }
      }
    }
  }, 500);
});

// --- Storage change listener ---
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.companiesCache) {
    const companies = changes.companiesCache.newValue || {};
    removeHighlights();
    buildPattern(companies);
    runHighlighting();
  }
});

// --- Init ---
loadAndHighlight().then(() => {
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
});
