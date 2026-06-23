import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// Convert a data URL or regular URL to Anthropic image source
function toAnthropicImageSource(
  url: string
): Anthropic.Base64ImageSource | Anthropic.URLImageSource {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("Invalid data URL format");
    return {
      type: "base64",
      media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: match[2],
    };
  }
  return { type: "url", url };
}

// Convert OpenAI-style message content to Anthropic content blocks
function toAnthropicContent(
  content: MessageContent | MessageContent[]
): Anthropic.ContentBlockParam[] {
  const parts = Array.isArray(content) ? content : [content];
  const result: Anthropic.ContentBlockParam[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      result.push({ type: "text", text: part });
    } else if (part.type === "text") {
      result.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      result.push({ type: "image", source: toAnthropicImageSource(part.image_url.url) });
    } else {
      // file_url not supported by Anthropic — skip
      console.warn("file_url content type is not supported by Anthropic API, skipping");
    }
  }
  return result;
}

// Convert OpenAI-style messages to Anthropic MessageParam[]
function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
    const blocks = toAnthropicContent(msg.content);
    if (blocks.length === 0) continue;
    // Collapse to plain string if single text block
    if (blocks.length === 1 && blocks[0].type === "text") {
      result.push({ role, content: blocks[0].text });
    } else {
      result.push({ role, content: blocks });
    }
  }
  return result;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey: ENV.anthropicApiKey });

  // Extract system prompt from system-role messages
  const systemParts: string[] = [];
  for (const msg of params.messages) {
    if (msg.role !== "system") continue;
    const c = Array.isArray(msg.content) ? msg.content : [msg.content];
    systemParts.push(
      c.map(p => (typeof p === "string" ? p : p.type === "text" ? p.text : "")).join("\n")
    );
  }
  const system = systemParts.join("\n") || undefined;

  // Handle json_schema response format → Anthropic tool_use for structured output
  const rf = params.responseFormat ?? params.response_format;
  const os = params.outputSchema ?? params.output_schema;

  let claudeTools: Anthropic.Tool[] | undefined;
  let claudeToolChoice: Anthropic.ToolChoice | undefined;
  let jsonToolName: string | undefined;

  if (rf?.type === "json_schema") {
    jsonToolName = rf.json_schema.name;
    claudeTools = [{
      name: rf.json_schema.name,
      description: "Output the structured result",
      input_schema: rf.json_schema.schema as Anthropic.Tool["input_schema"],
    }];
    claudeToolChoice = { type: "tool", name: rf.json_schema.name };
  } else if (os) {
    jsonToolName = os.name;
    claudeTools = [{
      name: os.name,
      description: "Output the structured result",
      input_schema: os.schema as Anthropic.Tool["input_schema"],
    }];
    claudeToolChoice = { type: "tool", name: os.name };
  }

  const maxTokens = params.maxTokens ?? params.max_tokens ?? 8096;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: toAnthropicMessages(params.messages),
    ...(claudeTools ? { tools: claudeTools, tool_choice: claudeToolChoice } : {}),
  });

  // Convert Anthropic response blocks back to OpenAI-style InvokeResult
  let contentText = "";
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      contentText += block.text;
    } else if (block.type === "tool_use") {
      if (block.name === jsonToolName) {
        // For json_schema mode, the tool input IS the structured result
        contentText = JSON.stringify(block.input);
      } else {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      }
    }
  }

  const finishReason =
    response.stop_reason === "end_turn" ? "stop"
    : response.stop_reason === "tool_use" ? "tool_calls"
    : (response.stop_reason ?? null);

  return {
    id: response.id,
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: contentText,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: finishReason,
    }],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
