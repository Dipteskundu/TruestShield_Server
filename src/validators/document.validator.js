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

module.exports = { documentUploadSchema, chatSchema, documentIdSchema };
