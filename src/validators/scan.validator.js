const { z } = require("zod");

const MIN_LENGTH = { email: 20, job: 50, message: 10 };
const MAX_LENGTH = 5000;

const scanTextSchema = z.object({
  body: z
    .object({
      type: z.enum(["email", "job", "message"]),
      content: z.string(),
    })
    .refine(
      (data) => data.content.length >= MIN_LENGTH[data.type],
      (data) => ({
        message: `Content for ${data.type} must be at least ${MIN_LENGTH[data.type]} characters`,
        path: ["content"],
      })
    )
    .refine(
      (data) => data.content.length <= MAX_LENGTH,
      { message: `Content must not exceed ${MAX_LENGTH} characters`, path: ["content"] }
    ),
});

const scanUrlSchema = z.object({
  body: z.object({
    url: z.string().url("Must be a valid URL"),
  }),
});

module.exports = { scanTextSchema, scanUrlSchema };
