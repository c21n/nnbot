/**
 * STT (Speech-to-Text) 服务类型定义
 *
 * 支持多种STT服务提供商：Whisper、本地模型、讯飞等
 */

/** STT服务提供商类型 */
export type STTProvider = 'whisper' | 'local' | 'xunfei';

/** STT服务配置 */
export interface ISTTConfig {
  readonly enabled: boolean;
  readonly provider: STTProvider;
  readonly whisper?: {
    readonly apiKey: string;
    readonly model: string;
    readonly baseUrl?: string;
  };
  readonly local?: {
    readonly modelPath: string;
  };
  readonly xunfei?: {
    readonly appId: string;
    readonly apiKey: string;
    readonly apiSecret: string;
  };
}

/** STT转写结果 */
export interface ISTTResult {
  readonly text: string;
  readonly confidence?: number; // 置信度 0-1
  readonly duration?: number; // 音频时长（秒）
  readonly language?: string; // 识别的语言
}

/** STT服务接口 */
export interface ISTTService {
  /** 语音转文字 */
  transcribe(audioData: Buffer, mimeType: string): Promise<ISTTResult>;
  /** 检查服务是否可用 */
  isAvailable(): Promise<boolean>;
  /** 获取服务提供商类型 */
  getProvider(): STTProvider;
}

/** STT服务工厂接口 */
export interface ISTTServiceFactory {
  /** 创建STT服务实例 */
  createService(provider: STTProvider, config: ISTTConfig): ISTTService;
  /** 获取支持的提供商列表 */
  getSupportedProviders(): readonly STTProvider[];
}

/** STT错误类型 */
export enum STTErrorType {
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_AUDIO = 'INVALID_AUDIO',
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
}

/** STT错误 */
export interface ISTTError {
  readonly type: STTErrorType;
  readonly message: string;
  readonly provider: STTProvider;
  readonly retryable: boolean;
}