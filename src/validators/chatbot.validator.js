const { z } = require("zod");

const messageSchema = z.object({
  body: z.object({
    message: z
      .string()
      .min(1, "Message cannot be empty")
      .max(2000, "Message too long"),
    sessionId: z.string().optional(),
  }),
});

const sessionIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Session ID is required"),
  }),
});

module.exports = { messageSchema, sessionIdSchema };
