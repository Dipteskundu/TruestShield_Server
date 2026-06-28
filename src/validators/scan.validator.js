const { z } = require("zod");

const scanTextSchema = z.object({
  body: z.object({
    type: z.enum(["email", "job", "message"]),
    content: z.string().min(10, "Content must be at least 10 characters"),
  }),
});

const scanUrlSchema = z.object({
  body: z.object({
    url: z.string().url("Must be a valid URL"),
  }),
});

module.exports = { scanTextSchema, scanUrlSchema };
