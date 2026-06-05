/**
 * Multimodal module index
 *
 * Exports all multimodal types and services
 */

// Types
export * from './types/index.js';

// Services
export { MultimodalProcessor } from './services/multimodal-processor.js';
export type { MultimodalProcessorConfig } from './services/multimodal-processor.js';

export { VisionLLMAdapter } from './services/vision-llm-adapter.js';

export { WhisperSTTService } from './services/whisper-service.js';
export type { WhisperConfig } from './services/whisper-service.js';

export { LocalSTTService } from './services/local-stt-service.js';
export type { LocalSTTConfig } from './services/local-stt-service.js';

export { STTServiceFactory, sttServiceFactory } from './services/stt-factory.js';

export { MediaStorageService } from './services/media-storage.js';