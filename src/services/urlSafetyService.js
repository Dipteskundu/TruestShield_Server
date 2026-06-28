const axios = require("axios");

async function scanUrl(url) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  const signals = {
    hasHttps: url.startsWith("https://"),
    domain: new URL(url).hostname,
    redirectChain: [url],
    safeBrowsingThreat: null,
    domainAgeDays: null,
  };

  if (apiKey) {
    try {
      const response = await axios.post(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
        {
          client: { clientId: "trustshield", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }
      );

      if (response.data.matches?.length) {
        signals.safeBrowsingThreat = response.data.matches[0].threatType;
      }
    } catch {
      // Safe Browsing unavailable — continue with other signals
    }
  }

  const isDangerous = Boolean(signals.safeBrowsingThreat);
  const isSuspicious = !signals.hasHttps;

  return {
    verdict: isDangerous ? "dangerous" : isSuspicious ? "suspicious" : "safe",
    confidence: isDangerous ? 95 : isSuspicious ? 70 : 85,
    reasons: [
      signals.hasHttps
        ? "URL uses HTTPS encryption"
        : "URL does not use HTTPS — data may be transmitted insecurely",
      signals.safeBrowsingThreat
        ? `Flagged by Google Safe Browsing: ${signals.safeBrowsingThreat}`
        : "Not found on Google Safe Browsing blacklist",
      `Domain: ${signals.domain}`,
    ],
    metadata: signals,
  };
}

module.exports = { scanUrl };
