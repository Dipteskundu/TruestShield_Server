const { z } = require("zod");

const aiPreferencesSchema = z.object({
  body: z.object({
    provider: z.enum(["system", "anthropic", "openai", "gemini", "custom"]),
    model: z.string().nullable().optional(),
  }),
});

const customProviderSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required").max(50),
    endpoint: z.string().url("Must be a valid URL"),
    apiKey: z.string().min(1, "API key is required"),
    model: z.string().min(1, "Model name is required"),
  }),
});

const testProviderSchema = z.object({
  body: z.object({
    provider: z.enum(["anthropic", "openai", "gemini", "custom"]),
    endpoint: z.string().url().optional(),
    apiKey: z.string().min(1, "API key is required"),
    model: z.string().min(1, "Model name is required"),
  }),
});

module.exports = { aiPreferencesSchema, customProviderSchema, testProviderSchema };
