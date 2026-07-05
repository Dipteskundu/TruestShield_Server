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
      .number()
      .int()
      .refine((v) => [1, 7, 30, 90, 365].includes(v), {
        message: "Must be 1, 7, 30, 90, or 365",
      })
      .optional(),
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

module.exports = { documentUploadSchema, chatSchema, documentIdSchema, documentTokenSchema };
