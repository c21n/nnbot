/**
 * 媒体存储服务类型定义
 *
 * 支持原始媒体文件的存储、检索和清理
 */

/** 媒体存储配置 */
export interface IMediaStorageConfig {
  readonly storeOriginal: boolean;
  readonly path: string; // 存储根目录，如 "data/media"
  readonly maxFileSize: string; // 最大文件大小，如 "10MB"
  readonly retentionDays: number; // 保留天数
}

/** 媒体文件元数据 */
export interface IMediaMetadata {
  readonly id: string; // 唯一标识
  readonly filename: string; // 原始文件名
  readonly mimeType: string; // 媒体类型
  readonly size: number; // 文件大小（字节）
  readonly path: string; // 存储路径
  readonly createdAt: number; // 创建时间戳
  readonly userId: string; // 上传用户ID
  readonly sessionId?: string; // 会话ID
  readonly messageId?: string; // 消息ID
}

/** 媒体存储服务接口 */
export interface IMediaStorageService {
  /** 存储媒体文件 */
  storeMedia(
    data: Buffer,
    filename: string,
    mimeType: string,
    userId: string,
    metadata?: Readonly<Record<string, unknown>>
  ): Promise<IMediaMetadata>;
  /** 获取媒体文件 */
  getMedia(id: string): Promise<Buffer | null>;
  /** 获取媒体元数据 */
  getMetadata(id: string): Promise<IMediaMetadata | null>;
  /** 删除媒体文件 */
  deleteMedia(id: string): Promise<boolean>;
  /** 清理过期媒体 */
  cleanupExpired(): Promise<number>; // 返回清理的文件数量
  /** 获取存储统计信息 */
  getStats(): Promise<IMediaStorageStats>;
}

/** 存储统计信息 */
export interface IMediaStorageStats {
  readonly totalFiles: number;
  readonly totalSize: number; // 总大小（字节）
  readonly oldestFile?: number; // 最老文件的时间戳
  readonly newestFile?: number; // 最新文件的时间戳
}

/** 文件大小解析结果 */
export interface IFileSize {
  readonly bytes: number;
  readonly unit: 'B' | 'KB' | 'MB' | 'GB';
  readonly formatted: string; // 如 "10MB"
}

/** 存储错误类型 */
export enum StorageErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  STORAGE_FULL = 'STORAGE_FULL',
  INVALID_PATH = 'INVALID_PATH',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  WRITE_FAILED = 'WRITE_FAILED',
  READ_FAILED = 'READ_FAILED',
}

/** 存储错误 */
export interface IStorageError {
  readonly type: StorageErrorType;
  readonly message: string;
  readonly path?: string;
  readonly retryable: boolean;
}