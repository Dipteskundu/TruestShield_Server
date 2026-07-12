const mongoose = require("mongoose");

const DocumentTreeNodeSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    nodeId: {
      type: String,
      required: true,
    },
    parentId: {
      type: String,
      default: null,
    },
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    level: {
      type: Number,
      required: true,
    },
    pageStart: {
      type: Number,
      required: true,
    },
    pageEnd: {
      type: Number,
      required: true,
    },
    path: {
      type: String,
      required: true,
    },
    crossRefs: {
      type: [String],
      default: [],
    },
    content: {
      type: String,
      default: null,
    },
    isLeaf: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
);

DocumentTreeNodeSchema.index({ documentId: 1, level: 1 });
DocumentTreeNodeSchema.index({ documentId: 1, nodeId: 1 });
DocumentTreeNodeSchema.index({ documentId: 1, parentId: 1 });
DocumentTreeNodeSchema.index({ documentId: 1, isLeaf: 1 });

module.exports = mongoose.model("DocumentTreeNode", DocumentTreeNodeSchema);
