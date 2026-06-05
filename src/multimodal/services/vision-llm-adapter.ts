/**
 * Vision LLM Adapter
 *
 * Wraps LLM service to support vision capabilities
 * Converts multimodal content to LLM-compatible format
 */

import type { ILLMService, LLMMessage, LLMChatOptions } from "../../interfaces.js";
import type { IMultimodalContent, SupportedImageMimeType } from "../types/multimodal.types.js";
import type { IVisionLLMService, IVisionMessage, VisionContentPart } from "../types/vision.types.js";

export class VisionLLMAdapter implements IVisionLLMService {
  private llmService: ILLMService;
  private visionModel?: string;

  constructor(llmService: ILLMService, visionModel?: string) {
    this.llmService = llmService;
    this.visionModel = visionModel;
  }

  /**
   * Send messages with vision support
   */
  async chatWithVision(
    messages: readonly IVisionMessage[],
    options?: {
      readonly model?: string;
      readonly temperature?: number;
      readonly maxTokens?: number;
    }
  ): Promise<string> {
    // Convert IVisionMessage[] to LLMMessage[]
    const llmMessages: LLMMessage[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content as string | import("../types/vision.types.js").VisionContentPart[],
    }));

    // Use vision model if specified, otherwise use default
    const model = options?.model || this.visionModel;

    const chatOptions: LLMChatOptions = {
      model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };

    // Check if LLM service supports vision
    if (this.llmService.chatWithVision) {
      return this.llmService.chatWithVision(llmMessages, chatOptions);
    }

    // Fallback: convert to plain text and use regular chat
    console.warn('[VisionLLM] LLM service does not support vision, falling back to text mode');
    const textOnlyMessages = this.convertToTextOnly(llmMessages);
    return this.llmService.chat(textOnlyMessages, chatOptions);
  }

  /**
   * Check if vision is supported
   */
  supportsVision(): boolean {
    return !!this.llmService.chatWithVision;
  }

  /**
   * Get supported vision models
   */
  getVisionModels(): readonly string[] {
    // This would need to be implemented based on the LLM provider
    // For now, return empty array
    return [];
  }

  /**
   * Build vision message from multimodal content
   */
  buildVisionMessage(
    text: string,
    images: readonly IMultimodalContent[]
  ): IVisionMessage {
    const contentParts: VisionContentPart[] = [];

    // Add text part
    if (text) {
      contentParts.push({
        type: 'text',
        text,
      });
    }

    // Add image parts
    for (const image of images) {
      if (image.type === 'image') {
        const dataUrl = this.buildDataUrl(image);
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: dataUrl,
            detail: 'auto',
          },
        });
      }
    }

    return {
      role: 'user',
      content: contentParts,
    };
  }

  /**
   * Build data URL from image content
   */
  private buildDataUrl(image: IMultimodalContent): string {
    const mimeType = image.mimeType || 'image/jpeg';
    return `data:${mimeType};base64,${image.data}`;
  }

  /**
   * Convert LLM messages with vision content to text-only messages
   */
  private convertToTextOnly(messages: LLMMessage[]): LLMMessage[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return msg;
      }

      // Convert content array to text
      const textParts: string[] = [];
      for (const part of msg.content) {
        if (part.type === 'text') {
          textParts.push(part.text);
        } else if (part.type === 'image_url') {
          textParts.push('[图片]');
        }
      }

      return {
        ...msg,
        content: textParts.join('\n'),
      };
    });
  }
}