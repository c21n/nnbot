/**
 * Multimodal Processor
 *
 * Processes OneBot message segments and handles multimodal content
 * Coordinates STT and vision services
 */

import type { OneBotAdapter } from "../../utils/onebot.js";
import type { Config } from "../../interfaces.js";
import type {
  IMultimodalProcessor,
  IMultimodalMessage,
  IMultimodalContent,
  IOneBotSegment,
  SupportedImageMimeType,
  SupportedAudioMimeType,
} from "../types/multimodal.types.js";
import type { ISTTService } from "../types/stt.types.js";
import type { IVisionLLMService } from "../types/vision.types.js";
import { sttServiceFactory } from "./stt-factory.js";
import { VisionLLMAdapter } from "./vision-llm-adapter.js";

export interface MultimodalProcessorConfig {
  readonly enabled: boolean;
  readonly vision: {
    readonly enabled: boolean;
  };
  readonly stt: {
    readonly enabled: boolean;
    readonly provider: string;
    readonly whisper?: {
      readonly apiKey: string;
      readonly model: string;
      readonly baseUrl?: string;
    };
    readonly local?: {
      readonly modelPath: string;
    };
  };
  readonly storage: {
    readonly storeOriginal: boolean;
    readonly path: string;
    readonly maxFileSize: string;
    readonly retentionDays: number;
  };
}

export class MultimodalProcessor implements IMultimodalProcessor {
  private onebotAdapter: OneBotAdapter;
  private config: MultimodalProcessorConfig;
  private sttService?: ISTTService;
  private visionAdapter?: VisionLLMAdapter;
  private maxFileSize: number;

  constructor(
    onebotAdapter: OneBotAdapter,
    config: MultimodalProcessorConfig,
    visionAdapter?: VisionLLMAdapter
  ) {
    this.onebotAdapter = onebotAdapter;
    this.config = config;
    this.visionAdapter = visionAdapter;
    this.maxFileSize = this.parseFileSize(config.storage.maxFileSize);

    // Initialize STT service if enabled
    if (config.stt.enabled) {
      this.initSTTService();
    }
  }

  /**
   * Process OneBot message segments
   */
  async processSegments(segments: readonly IOneBotSegment[]): Promise<IMultimodalMessage> {
    const contents: IMultimodalContent[] = [];
    const textParts: string[] = [];

    for (const segment of segments) {
      try {
        if (segment.type === 'text') {
          const text = (segment.data as Record<string, unknown>)?.text as string;
          if (text) {
            textParts.push(text);
          }
        } else if (segment.type === 'image') {
          const imageContent = await this.processImageSegment(segment);
          if (imageContent) {
            contents.push(imageContent);
            textParts.push('[图片]');
          }
        } else if (segment.type === 'record') {
          const voiceContent = await this.processVoiceSegment(segment);
          if (voiceContent) {
            contents.push(voiceContent);
            textParts.push('[语音]');
          }
        }
      } catch (error) {
        console.error(`[MultimodalProcessor] Failed to process segment ${segment.type}:`, error);
        // Continue processing other segments
      }
    }

    return {
      contents,
      text: textParts.join(''),
    };
  }

  /**
   * Download media file from URL
   */
  async downloadMedia(url: string): Promise<Buffer> {
    return this.onebotAdapter.downloadMedia(url);
  }

  /**
   * Convert image to base64
   */
  imageToBase64(imageData: Buffer, mimeType: SupportedImageMimeType): string {
    return imageData.toString('base64');
  }

  /**
   * Validate file size
   */
  validateFileSize(data: Buffer, maxSize: number): boolean {
    return data.length <= maxSize;
  }

  /**
   * Process image segment
   */
  private async processImageSegment(segment: IOneBotSegment): Promise<IMultimodalContent | null> {
    const data = segment.data as Record<string, unknown>;
    const imageUrl = data?.url as string;
    const imageFile = data?.file as string;
    const imageBase64 = data?.file_base64 as string;

    // If we have base64 data, use it directly
    if (imageBase64) {
      return {
        type: 'image',
        data: imageBase64,
        mimeType: this.detectImageMimeType(imageBase64),
        metadata: {
          source: 'base64',
          file: imageFile,
        },
      };
    }

    // If we have URL, download the image
    if (imageUrl) {
      try {
        const imageData = await this.downloadMedia(imageUrl);

        // Validate file size
        if (!this.validateFileSize(imageData, this.maxFileSize)) {
          console.warn(`[MultimodalProcessor] Image too large: ${imageData.length} bytes`);
          return null;
        }

        const base64 = this.imageToBase64(imageData, 'image/jpeg');
        return {
          type: 'image',
          data: base64,
          mimeType: 'image/jpeg',
          metadata: {
            source: 'url',
            url: imageUrl,
            file: imageFile,
            size: imageData.length,
          },
        };
      } catch (error) {
        console.error('[MultimodalProcessor] Failed to download image:', error);
        return null;
      }
    }

    // If we have file_id, get the file
    const fileId = data?.file_id as string;
    if (fileId) {
      try {
        const imageData = await this.onebotAdapter.getFile(fileId);

        if (!this.validateFileSize(imageData, this.maxFileSize)) {
          console.warn(`[MultimodalProcessor] Image too large: ${imageData.length} bytes`);
          return null;
        }

        const base64 = this.imageToBase64(imageData, 'image/jpeg');
        return {
          type: 'image',
          data: base64,
          mimeType: 'image/jpeg',
          metadata: {
            source: 'file_id',
            file_id: fileId,
            file: imageFile,
            size: imageData.length,
          },
        };
      } catch (error) {
        console.error('[MultimodalProcessor] Failed to get file:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Process voice segment
   */
  private async processVoiceSegment(segment: IOneBotSegment): Promise<IMultimodalContent | null> {
    const data = segment.data as Record<string, unknown>;
    const voiceFile = data?.file as string;
    const voiceUrl = data?.url as string;
    const voiceBase64 = data?.file_base64 as string;

    // If we have base64 data, use it directly
    if (voiceBase64) {
      return {
        type: 'voice',
        data: voiceBase64,
        mimeType: this.detectAudioMimeType(voiceBase64),
        metadata: {
          source: 'base64',
          file: voiceFile,
        },
      };
    }

    // If we have URL, download the voice
    if (voiceUrl) {
      try {
        const voiceData = await this.downloadMedia(voiceUrl);

        if (!this.validateFileSize(voiceData, this.maxFileSize)) {
          console.warn(`[MultimodalProcessor] Voice too large: ${voiceData.length} bytes`);
          return null;
        }

        const base64 = voiceData.toString('base64');
        return {
          type: 'voice',
          data: base64,
          mimeType: 'audio/wav',
          metadata: {
            source: 'url',
            url: voiceUrl,
            file: voiceFile,
            size: voiceData.length,
          },
        };
      } catch (error) {
        console.error('[MultimodalProcessor] Failed to download voice:', error);
        return null;
      }
    }

    // If we have file_id, get the file
    const fileId = data?.file_id as string;
    if (fileId) {
      try {
        const voiceData = await this.onebotAdapter.getFile(fileId);

        if (!this.validateFileSize(voiceData, this.maxFileSize)) {
          console.warn(`[MultimodalProcessor] Voice too large: ${voiceData.length} bytes`);
          return null;
        }

        const base64 = voiceData.toString('base64');
        return {
          type: 'voice',
          data: base64,
          mimeType: 'audio/wav',
          metadata: {
            source: 'file_id',
            file_id: fileId,
            file: voiceFile,
            size: voiceData.length,
          },
        };
      } catch (error) {
        console.error('[MultimodalProcessor] Failed to get file:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Initialize STT service
   */
  private initSTTService(): void {
    try {
      const provider = this.config.stt.provider as 'whisper' | 'local' | 'xunfei';
      this.sttService = sttServiceFactory.createService(provider, {
        enabled: true,
        provider,
        whisper: this.config.stt.whisper,
        local: this.config.stt.local,
      });
    } catch (error) {
      console.error('[MultimodalProcessor] Failed to initialize STT service:', error);
    }
  }

  /**
   * Transcribe voice to text
   */
  async transcribeVoice(audioData: Buffer, mimeType: string): Promise<string | null> {
    if (!this.sttService) {
      return null;
    }

    try {
      const result = await this.sttService.transcribe(audioData, mimeType);
      return result.text;
    } catch (error) {
      console.error('[MultimodalProcessor] Transcription failed:', error);
      return null;
    }
  }

  /**
   * Detect image MIME type from base64 data
   */
  private detectImageMimeType(base64: string): SupportedImageMimeType {
    // Check magic bytes
    const header = base64.substring(0, 20);
    if (header.startsWith('/9j/')) return 'image/jpeg';
    if (header.startsWith('iVBOR')) return 'image/png';
    if (header.startsWith('R0lG')) return 'image/gif';
    if (header.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg'; // Default
  }

  /**
   * Detect audio MIME type from base64 data
   */
  private detectAudioMimeType(base64: string): SupportedAudioMimeType {
    // Check magic bytes
    const header = base64.substring(0, 20);
    if (header.startsWith('UklGR')) return 'audio/wav';
    if (header.startsWith('ID3')) return 'audio/mp3';
    if (header.startsWith('OggS')) return 'audio/ogg';
    return 'audio/wav'; // Default
  }

  /**
   * Parse file size string to bytes
   */
  private parseFileSize(sizeStr: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
    if (!match) {
      return 10 * 1024 * 1024; // Default 10MB
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    return value * (units[unit] || 1);
  }
}