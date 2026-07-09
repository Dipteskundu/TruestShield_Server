const {
  SYSTEM_PROMPT_STATIC,
  appKnowledgeBase,
} = require("../config/chatbot-knowledge");

function buildSystemPrompt(userContext) {
  let prompt = SYSTEM_PROMPT_STATIC;

  if (userContext) {
    prompt += `
CURRENT USER CONTEXT:
The following information about the logged-in user is provided to you for this
conversation. Use it to answer their questions about their account. Do not
repeat sensitive fields. Refer to them by their first name.

${JSON.stringify(userContext, null, 2)}

If the user asks about something not covered in this context block
(for example, a specific past scan result), tell them you don't have
that level of detail here and direct them to their dashboard.
`;
  } else {
    prompt += `
CURRENT USER CONTEXT:
The user is not signed in. You can answer questions about TrustShield's features
and pricing, but you cannot provide any personal account information. If they ask
about their account, remind them to sign in.
`;
  }

  prompt += `\n${appKnowledgeBase}`;

  return prompt;
}

module.exports = { buildSystemPrompt };
