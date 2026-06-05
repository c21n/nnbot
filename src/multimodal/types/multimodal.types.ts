/**
 * 多模态消息处理核心类型定义
 *
 * 支持图片和语音消息的接收、处理和存储
 */

/** 多模态内容类型 */
export type MultimodalContentType = 'image' | 'voice' | 'text';

/** 支持的图片格式 */
export type SupportedImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

/** 支持的音频格式 */
export type SupportedAudioMimeType =
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/ogg'
  | 'audio/m4a'
  | 'audio/opus';

/** 多模态内容项 */
export interface IMultimodalContent {
  readonly type: MultimodalContentType;
  readonly data: string; // base64编码或文本内容
  readonly mimeType?: SupportedImageMimeType | SupportedAudioMimeType;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 多模态消息 */
export interface IMultimodalMessage {
  readonly contents: readonly IMultimodalContent[];
  readonly text?: string; // 提取的纯文本（用于日志、存储等）
}

/** OneBot消息段类型 */
export interface IOneBotSegment {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** OneBot图片消息段 */
export interface IOneBotImageSegment extends IOneBotSegment {
  readonly type: 'image';
  readonly data: {
    readonly file: string;
    readonly url?: string;
    readonly file_size?: string;
    readonly file_id?: string;
  };
}

/** OneBot语音消息段 */
export interface IOneBotVoiceSegment extends IOneBotSegment {
  readonly type: 'record';
  readonly data: {
    readonly file: string;
    readonly url?: string;
    readonly file_size?: string;
    readonly file_id?: string;
  };
}

/** OneBot文本消息段 */
export interface IOneBotTextSegment extends IOneBotSegment {
  readonly type: 'text';
  readonly data: {
    readonly text: string;
  };
}

/** 多模态处理器接口 */
export interface IMultimodalProcessor {
  /** 处理OneBot消息段，提取多模态内容 */
  processSegments(segments: readonly IOneBotSegment[]): Promise<IMultimodalMessage>;
  /** 下载媒体文件 */
  downloadMedia(url: string): Promise<Buffer>;
  /** 将图片转为base64 */
  imageToBase64(imageData: Buffer, mimeType: SupportedImageMimeType): string;
  /** 验证媒体文件大小 */
  validateFileSize(data: Buffer, maxSize: number): boolean;
}

/** 消息处理结果 */
export interface IMessageProcessResult {
  readonly multimodal?: IMultimodalMessage;
  readonly text: string; // 最终的文本内容（包含媒体描述）
  readonly hasMedia: boolean;
  readonly mediaCount: {
    readonly images: number;
    readonly voices: number;
  };
}