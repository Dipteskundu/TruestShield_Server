const axios = require("axios");

const PHISHING_KEYWORDS = [
  "login", "verify", "update", "secure", "account", "banking", "confirm",
  "password", "suspend", "urgent", "immediate", "action", "required",
  "click", "here", "sign", "in", "unlock", "restore", "validate",
  "billing", "payment", "expire", "unauthorized", "alert", "notice",
];

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function detectPhishingKeywords(url) {
  const found = [];
  const urlLower = url.toLowerCase();
  for (const keyword of PHISHING_KEYWORDS) {
    if (urlLower.includes(keyword)) {
      found.push(keyword);
    }
  }
  return found;
}

async function followRedirects(url, maxRedirects = 10) {
  const chain = [url];
  let current = url;

  for (let i = 0; i < maxRedirects; i++) {
    try {
      const response = await axios.head(current, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 5000,
      });

      const location = response.headers?.location;
      if (!location) break;

      const nextUrl = location.startsWith("http")
        ? location
        : new URL(location, current).href;

      if (nextUrl === current) break;
      chain.push(nextUrl);
      current = nextUrl;
    } catch {
      break;
    }
  }

  return chain;
}

async function lookupDomainAge(domain) {
  const apiKey = process.env.WHOIS_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get(
      `https://www.whoisxmlapi.com/whoisserver/WhoisService`,
      {
        params: {
          domainName: domain,
          apiKey,
          outputFormat: "JSON",
        },
        timeout: 8000,
      }
    );

    const record = response.data?.WhoisRecord;
    if (!record?.createdDate) return null;

    const created = new Date(record.createdDate);
    const now = new Date();
    const ageDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));

    return {
      ageDays,
      createdDate: record.createdDate,
      registrar: record.registrarName || null,
    };
  } catch {
    return null;
  }
}

async function checkSafeBrowsing(url) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.post(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        client: { clientId: "trustshield", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      },
      { timeout: 8000 }
    );

    if (response.data.matches?.length) {
      return response.data.matches[0].threatType;
    }
    return null;
  } catch {
    return null;
  }
}

async function scanUrl(url) {
  const domain = extractDomain(url);

  const signals = {
    url,
    domain,
    hasHttps: url.startsWith("https://"),
    redirectChain: [],
    redirectCount: 0,
    safeBrowsingThreat: null,
    domainAgeDays: null,
    domainCreatedDate: null,
    domainRegistrar: null,
    phishingKeywords: [],
    phishingKeywordCount: 0,
  };

  const [redirectChain, domainAge, safeBrowsingThreat, phishingKeywords] = await Promise.all([
    followRedirects(url).catch(() => [url]),
    lookupDomainAge(domain).catch(() => null),
    checkSafeBrowsing(url).catch(() => null),
    Promise.resolve(detectPhishingKeywords(url)),
  ]);

  signals.redirectChain = redirectChain;
  signals.redirectCount = redirectChain.length - 1;
  signals.safeBrowsingThreat = safeBrowsingThreat;
  signals.phishingKeywords = phishingKeywords;
  signals.phishingKeywordCount = phishingKeywords.length;

  if (domainAge) {
    signals.domainAgeDays = domainAge.ageDays;
    signals.domainCreatedDate = domainAge.createdDate;
    signals.domainRegistrar = domainAge.registrar;
  }

  const reasons = [];
  let score = 100;

  if (signals.hasHttps) {
    reasons.push("URL uses HTTPS encryption");
  } else {
    reasons.push("URL does not use HTTPS — data may be transmitted insecurely");
    score -= 15;
  }

  if (safeBrowsingThreat) {
    reasons.push(`Flagged by Google Safe Browsing: ${safeBrowsingThreat}`);
    score -= 50;
  } else {
    reasons.push("Not found on Google Safe Browsing blacklist");
  }

  if (signals.domainAgeDays !== null) {
    if (signals.domainAgeDays < 30) {
      reasons.push(`Domain is very new (${signals.domainAgeDays} days old) — commonly used in phishing`);
      score -= 25;
    } else if (signals.domainAgeDays < 90) {
      reasons.push(`Domain is relatively new (${signals.domainAgeDays} days old)`);
      score -= 10;
    } else {
      reasons.push(`Domain registered ${signals.domainAgeDays} days ago`);
    }
  } else {
    reasons.push("Domain age could not be determined");
  }

  if (signals.redirectCount > 0) {
    if (signals.redirectCount >= 3) {
      reasons.push(`URL redirects ${signals.redirectCount} times — long redirect chains can hide malicious destinations`);
      score -= 20;
    } else {
      reasons.push(`URL redirects ${signals.redirectCount} time(s)`);
      score -= 5;
    }
  } else {
    reasons.push("No redirect chains detected");
  }

  if (phishingKeywords.length > 0) {
    reasons.push(`URL contains ${phishingKeywords.length} phishing-associated keyword(s): ${phishingKeywords.slice(0, 5).join(", ")}${phishingKeywords.length > 5 ? "..." : ""}`);
    score -= phishingKeywords.length * 3;
  } else {
    reasons.push("No suspicious keywords detected in URL");
  }

  reasons.push(`Domain: ${domain}`);

  score = Math.max(0, Math.min(100, score));

  let verdict;
  if (safeBrowsingThreat || (signals.domainAgeDays !== null && signals.domainAgeDays < 30 && phishingKeywords.length >= 3)) {
    verdict = "dangerous";
  } else if (
    !signals.hasHttps ||
    (signals.domainAgeDays !== null && signals.domainAgeDays < 90) ||
    signals.redirectCount >= 3 ||
    phishingKeywords.length >= 2
  ) {
    verdict = "suspicious";
  } else {
    verdict = "safe";
  }

  const confidence = verdict === "dangerous" ? Math.max(85, score) : verdict === "suspicious" ? Math.max(60, Math.min(80, score)) : Math.max(70, score);

  return {
    verdict,
    confidence,
    reasons,
    metadata: signals,
  };
}

module.exports = { scanUrl };
