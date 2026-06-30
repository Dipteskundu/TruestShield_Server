const axios = require("axios");
const { decrypt } = require("./encryptionService");

const PROVIDERS = {
  anthropic: {
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    models: [
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Fast and efficient" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", description: "Balanced performance" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", description: "Most capable" },
    ],
    formatRequest: (messages, model) => ({
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: {
        model,
        max_tokens: 1024,
        messages,
      },
    }),
    parseResponse: (data) => data.content?.[0]?.text || null,
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: [
      { id: "gpt-4o", name: "GPT-4o", description: "Most capable" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Legacy, fast" },
    ],
    formatRequest: (messages, model) => ({
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        Authorization: "",
        "Content-Type": "application/json",
      },
      body: {
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.3,
      },
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || null,
  },
  gemini: {
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    models: [
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Fast and efficient" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Most capable" },
    ],
    formatRequest: (messages, model) => {
      const contents = messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          contents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.3,
          },
        },
      };
    },
    parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || null,
  },
};

function getProviderConfig(provider, model) {
  const config = PROVIDERS[provider];
  if (!config) return null;

  const selectedModel = model || config.models[0].id;
  return { ...config, selectedModel };
}

async function callAI(messages, provider = "system", model = null, customApiKey = null) {
  if (provider === "system" || !provider) {
    return callSystemAI(messages);
  }

  const config = getProviderConfig(provider, model);
  if (!config) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  const apiKey = customApiKey || process.env[`${provider.toUpperCase()}_API_KEY`];
  if (!apiKey) {
    return callSystemAI(messages);
  }

  const request = config.formatRequest(messages, config.selectedModel);

  if (provider === "anthropic") {
    request.headers["x-api-key"] = apiKey;
  } else if (provider === "openai") {
    request.headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider === "gemini") {
    request.url += `?key=${apiKey}`;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.post(request.url, request.body, {
        headers: request.headers,
        timeout: 30000,
      });

      const text = config.parseResponse(response.data);
      return text;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }

  return null;
}

async function callSystemAI(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1024,
          messages,
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
        }
      );
      return response.data.content?.[0]?.text || null;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

async function testProviderConnection(provider, endpoint, apiKey, model) {
  const testMessages = [{ role: "user", content: "Say 'connection successful' in exactly 2 words." }];

  if (provider === "custom") {
    return testCustomEndpoint(endpoint, apiKey, model, testMessages);
  }

  const config = getProviderConfig(provider, model);
  if (!config) {
    return { success: false, message: `Unknown provider: ${provider}` };
  }

  try {
    const request = config.formatRequest(testMessages, config.selectedModel);

    if (provider === "anthropic") {
      request.headers["x-api-key"] = apiKey;
    } else if (provider === "openai") {
      request.headers.Authorization = `Bearer ${apiKey}`;
    } else if (provider === "gemini") {
      request.url += `?key=${apiKey}`;
    }

    const response = await axios.post(request.url, request.body, {
      headers: request.headers,
      timeout: 15000,
    });

    const text = config.parseResponse(response.data);
    if (text) {
      return { success: true, message: "Connection successful", responsePreview: text.slice(0, 100) };
    }
    return { success: false, message: "Invalid response format from provider" };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.error?.message || error.message || "Connection failed",
    };
  }
}

async function testCustomEndpoint(endpoint, apiKey, model, messages) {
  try {
    const url = endpoint.replace(/\/$/, "");
    const response = await axios.post(
      `${url}/chat/completions`,
      {
        model: model || "gpt-3.5-turbo",
        messages,
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const text = response.data.choices?.[0]?.message?.content;
    if (text) {
      return { success: true, message: "Connection successful", responsePreview: text.slice(0, 100) };
    }
    return { success: false, message: "Invalid response format" };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.error?.message || error.message || "Connection failed",
    };
  }
}

function getAvailableProviders() {
  return Object.entries(PROVIDERS).map(([key, config]) => ({
    id: key,
    name: config.name,
    models: config.models,
    hasApiKey: !!process.env[`${key.toUpperCase()}_API_KEY`],
  }));
}

async function callWithUserPreference(messages, userPreferences) {
  if (!userPreferences || userPreferences.provider === "system") {
    return callSystemAI(messages);
  }

  if (userPreferences.provider === "custom" && userPreferences.customProvider) {
    const { endpoint, apiKey, model } = userPreferences.customProvider;
    const decryptedKey = decrypt(apiKey);
    const request = {
      url: `${endpoint.replace(/\/$/, "")}/chat/completions`,
      headers: {
        Authorization: `Bearer ${decryptedKey}`,
        "Content-Type": "application/json",
      },
      body: {
        model: model || "gpt-3.5-turbo",
        messages,
        max_tokens: 1024,
        temperature: 0.3,
      },
    };

    const response = await axios.post(request.url, request.body, {
      headers: request.headers,
      timeout: 30000,
    });

    return response.data.choices?.[0]?.message?.content || null;
  }

  const config = getProviderConfig(userPreferences.provider, userPreferences.model);
  if (!config) {
    return callSystemAI(messages);
  }

  const decryptedKey = userPreferences.apiKey ? decrypt(userPreferences.apiKey) : null;
  return callAI(messages, userPreferences.provider, userPreferences.model, decryptedKey);
}

module.exports = {
  PROVIDERS,
  getProviderConfig,
  callAI,
  callSystemAI,
  testProviderConnection,
  getAvailableProviders,
  callWithUserPreference,
};
