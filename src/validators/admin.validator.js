const { z } = require("zod");

const rateLimitValue = z.number().int().min(1, "Must be at least 1").max(10000, "Cannot exceed 10,000");

const rateLimitsSchema = z.object({
  body: z.object({
    free: z.object({
      text: rateLimitValue,
      url: rateLimitValue,
      image: rateLimitValue,
    }),
    pro: z.object({
      text: rateLimitValue,
      url: rateLimitValue,
      image: rateLimitValue,
    }),
  }),
});

module.exports = { rateLimitsSchema };
