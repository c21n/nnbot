/**
 * 视觉LLM服务类型定义
 *
 * 支持视觉能力的LLM接口和配置
 */

/** 视觉模型配置 */
export interface IVisionModelConfig {
  readonly enabled: boolean;
  readonly model?: string; // 视觉模型名称，如果不设置则使用主LLM模型
  readonly maxImages?: number; // 单次请求最大图片数，默认5
  readonly maxImageSize?: number; // 单张图片最大大小（字节），默认10MB
}

/** 视觉消息内容类型 */
export type VisionContentPart =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'image_url';
      readonly image_url: {
        readonly url: string; // base64 data URL 或 http URL
        readonly detail?: 'low' | 'high' | 'auto';
      };
    };

/** 视觉消息 */
export interface IVisionMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string | readonly VisionContentPart[];
}

/** 视觉LLM服务接口 */
export interface IVisionLLMService {
  /** 使用视觉能力处理消息 */
  chatWithVision(
    messages: readonly IVisionMessage[],
    options?: {
      readonly model?: string;
      readonly temperature?: number;
      readonly maxTokens?: number;
    }
  ): Promise<string>;
  /** 检查是否支持视觉 */
  supportsVision(): boolean;
  /** 获取支持的视觉模型列表 */
  getVisionModels(): readonly string[];
}

/** 视觉处理结果 */
export interface IVisionResult {
  readonly description: string; // 图片描述
  readonly confidence?: number; // 置信度
  readonly objects?: readonly string[]; // 识别到的对象
  readonly text?: string; // OCR提取的文字（如果有）
}

/** 视觉错误类型 */
export enum VisionErrorType {
  MODEL_NOT_SUPPORTED = 'MODEL_NOT_SUPPORTED',
  IMAGE_TOO_LARGE = 'IMAGE_TOO_LARGE',
  INVALID_IMAGE = 'INVALID_IMAGE',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  TIMEOUT = 'TIMEOUT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
}

/** 视觉错误 */
export interface IVisionError {
  readonly type: VisionErrorType;
  readonly message: string;
  readonly model?: string;
  readonly retryable: boolean;
}