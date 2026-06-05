/**
 * Multimodal Plugin
 *
 * Handles multimodal message processing (images, voice)
 * Integrates with STT and vision services
 */

import { createPlugin } from "../core/create-plugin.js";
import type { Event, Response, PluginServices, AIChatHooks, LLMMessage } from "../interfaces.js";
import type { IMultimodalMessage, IMultimodalContent } from "../multimodal/types/multimodal.types.js";
import { MultimodalProcessor } from "../multimodal/services/multimodal-processor.js";
import { VisionLLMAdapter } from "../multimodal/services/vision-llm-adapter.js";
import { MediaStorageService } from "../multimodal/services/media-storage.js";

export default createPlugin({
  name: "multimodal",
  description: "Multimodal message processing (images, voice)",
  version: "1.0.0",
  priority: 95, // Before ai_chat (100) but after memory (99)

  hooks: {
    /**
     * Before LLM call - process multimodal content
     */
    async beforeLLM(messages: LLMMessage[], event: Event): Promise<LLMMessage[]> {
      // Check if event has multimodal content
      if (!event.multimodal || event.multimodal.contents.length === 0) {
        return messages;
      }

      const multimodal = event.multimodal;

      // Process voice content (STT)
      const processedMultimodal = await processVoiceContent(multimodal);

      // If we have images and vision is supported, build vision message
      const images = processedMultimodal.contents.filter((c) => c.type === "image");
      if (images.length > 0) {
        // Check if we should use vision
        const shouldUseVision = await checkVisionSupport(event);
        if (shouldUseVision) {
          // Build vision message
          const visionMessage = buildVisionMessage(
            event.message,
            images
          );

          // Replace the last user message with vision message
          const updatedMessages = [...messages];
          const lastUserIdx = updatedMessages.length - 1;
          if (lastUserIdx >= 0 && updatedMessages[lastUserIdx].role === "user") {
            updatedMessages[lastUserIdx] = visionMessage;
          } else {
            updatedMessages.push(visionMessage);
          }

          return updatedMessages;
        }
      }

      // If we have voice transcription, append to message
      const voiceTexts = processedMultimodal.contents
        .filter((c) => c.type === "voice" && c.metadata?.transcription)
        .map((c) => c.metadata?.transcription as string);

      if (voiceTexts.length > 0) {
        const updatedMessages = [...messages];
        const lastUserIdx = updatedMessages.length - 1;
        if (lastUserIdx >= 0 && updatedMessages[lastUserIdx].role === "user") {
          const originalContent = updatedMessages[lastUserIdx].content as string;
          updatedMessages[lastUserIdx] = {
            ...updatedMessages[lastUserIdx],
            content: `${originalContent}\n\n[语音转写]: ${voiceTexts.join("\n")}`,
          };
        }
      }

      return messages;
    },

    /**
     * After LLM call - store multimodal content if configured
     */
    async afterLLM(response: string, event: Event): Promise<string> {
      // Store original media if configured
      if (event.multimodal && event.multimodal.contents.length > 0) {
        await storeMultimodalContent(event.multimodal, event.userId);
      }

      return response;
    },
  },

  /**
   * Handle multimodal events (optional - can be handled via hooks only)
   */
  async handle(event: Event, services: PluginServices): Promise<Response | null> {
    // This plugin primarily works via hooks
    // Return null to let other plugins handle the event
    return null;
  },

  help(): string {
    return [
      "📸 多模态消息处理",
      "",
      "支持接收和理解图片、语音消息。",
      "",
      "功能：",
      "- 图片理解：使用视觉LLM分析图片内容",
      "- 语音转写：使用STT服务将语音转为文字",
      "- 自动降级：服务不可用时回退到纯文本模式",
      "",
      "配置：",
      "- multimodal.enabled: 启用/禁用多模态功能",
      "- multimodal.vision.enabled: 启用/禁用视觉功能",
      "- multimodal.stt.enabled: 启用/禁用语音转写功能",
    ].join("\n");
  },
});

/**
 * Process voice content using STT service
 */
async function processVoiceContent(
  multimodal: IMultimodalMessage
): Promise<IMultimodalMessage> {
  const processedContents: IMultimodalContent[] = [];

  for (const content of multimodal.contents) {
    if (content.type === "voice" && content.data) {
      try {
        // Get STT service from global config
        const sttService = getSTTService();
        if (sttService) {
          const audioBuffer = Buffer.from(content.data, "base64");
          const mimeType = content.mimeType || "audio/wav";
          const result = await sttService.transcribe(audioBuffer, mimeType);

          processedContents.push({
            ...content,
            metadata: {
              ...content.metadata,
              transcription: result.text,
              confidence: result.confidence,
              language: result.language,
            },
          });
        } else {
          processedContents.push(content);
        }
      } catch (error) {
        console.error("[Multimodal] Voice transcription failed:", error);
        processedContents.push(content);
      }
    } else {
      processedContents.push(content);
    }
  }

  return {
    ...multimodal,
    contents: processedContents,
  };
}

/**
 * Check if vision is supported for this event
 */
async function checkVisionSupport(event: Event): Promise<boolean> {
  // Check if vision is enabled in config
  const config = getConfig();
  if (!config?.multimodal?.vision?.enabled) {
    return false;
  }

  // Check if LLM service supports vision
  const llmService = getLLMService();
  if (!llmService?.chatWithVision) {
    return false;
  }

  return true;
}

/**
 * Build vision message from text and images
 */
function buildVisionMessage(
  text: string,
  images: IMultimodalContent[]
): LLMMessage {
  const contentParts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: string } }
  > = [];

  // Add text part
  if (text) {
    contentParts.push({
      type: "text",
      text,
    });
  }

  // Add image parts
  for (const image of images) {
    const mimeType = image.mimeType || "image/jpeg";
    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${image.data}`,
        detail: "auto",
      },
    });
  }

  return {
    role: "user",
    content: contentParts as any, // Type assertion needed for compatibility
  };
}

/**
 * Store multimodal content if configured
 */
async function storeMultimodalContent(
  multimodal: IMultimodalMessage,
  userId: string
): Promise<void> {
  const config = getConfig();
  if (!config?.multimodal?.storage?.storeOriginal) {
    return;
  }

  try {
    const storageService = getMediaStorageService();
    if (!storageService) {
      return;
    }

    for (const content of multimodal.contents) {
      if (content.data) {
        const buffer = Buffer.from(content.data, "base64");
        const filename = `${content.type}_${Date.now()}`;
        const mimeType = content.mimeType || "application/octet-stream";

        await storageService.storeMedia(buffer, filename, mimeType, userId, {
          type: content.type,
        });
      }
    }
  } catch (error) {
    console.error("[Multimodal] Failed to store media:", error);
  }
}

// Helper functions to access global services
// These would be injected via plugin services in a real implementation

let globalConfig: any = null;
let globalLLMService: any = null;
let globalSTTService: any = null;
let globalMediaStorageService: any = null;

function getConfig(): any {
  return globalConfig;
}

function getLLMService(): any {
  return globalLLMService;
}

function getSTTService(): any {
  return globalSTTService;
}

function getMediaStorageService(): any {
  return globalMediaStorageService;
}

/**
 * Initialize multimodal services
 */
export async function initMultimodalServices(
  config: any,
  llmService: any,
  onebotAdapter: any
): Promise<void> {
  globalConfig = config;

  // Initialize vision adapter
  if (config?.multimodal?.vision?.enabled) {
    const visionModel = config.llm?.providers?.[config.llm.currentProvider]?.visionModel;
    globalLLMService = new VisionLLMAdapter(llmService, visionModel);
  }

  // Initialize STT service
  if (config?.multimodal?.stt?.enabled) {
    try {
      const { sttServiceFactory } = await import("../multimodal/services/stt-factory.js");
      const provider = config.multimodal.stt.provider || "whisper";
      globalSTTService = sttServiceFactory.createService(provider, config.multimodal.stt);
    } catch (error) {
      console.error("[Multimodal] Failed to initialize STT service:", error);
    }
  }

  // Initialize media storage
  if (config?.multimodal?.storage?.storeOriginal) {
    try {
      globalMediaStorageService = new MediaStorageService(config.multimodal.storage);
      await globalMediaStorageService.init();
    } catch (error) {
      console.error("[Multimodal] Failed to initialize media storage:", error);
    }
  }

  console.log("[Multimodal] Services initialized");
}