const { z } = require("zod");

const documentUploadSchema = z.object({
  body: z.object({
    documentType: z
      .enum([
        "lease",
        "freelance",
        "nda",
        "employment",
        "tos",
        "vendor",
        "other",
      ])
      .optional(),
    text: z.string().min(50).optional(),
    fileName: z.string().optional(),
    autoDeleteDays: z
      .union([z.number().int(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined || val === null || val === "") return undefined;
        const num = typeof val === "string" ? parseInt(val, 10) : val;
        if (isNaN(num) || ![1, 7, 30, 90, 365].includes(num)) return undefined;
        return num;
      }),
  }),
});

const chatSchema = z.object({
  body: z.object({
    question: z.string().min(3, "Question must be at least 3 characters"),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
});

const documentIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const documentTokenSchema = z.object({
  params: z.object({
    token: z.string().min(1),
  }),
});

const documentChatMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1, "Message is required").max(2000, "Message must be under 2000 characters"),
    sessionId: z.string().optional(),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
});

module.exports = {
  documentUploadSchema,
  chatSchema,
  documentIdSchema,
  documentTokenSchema,
  documentChatMessageSchema,
};
