/**
 * STT Service Factory
 *
 * Creates STT service instances based on configuration
 */

import type { ISTTService, ISTTServiceFactory, STTProvider, ISTTConfig } from "../types/stt.types.js";
import { WhisperSTTService, type WhisperConfig } from "./whisper-service.js";
import { LocalSTTService, type LocalSTTConfig } from "./local-stt-service.js";

export class STTServiceFactory implements ISTTServiceFactory {
  /**
   * Create STT service instance based on provider type
   */
  createService(provider: STTProvider, config: ISTTConfig): ISTTService {
    switch (provider) {
      case 'whisper':
        return this.createWhisperService(config);
      case 'local':
        return this.createLocalService(config);
      case 'xunfei':
        // TODO: Implement Xunfei STT service
        throw new Error('Xunfei STT service not implemented yet');
      default:
        throw new Error(`Unknown STT provider: ${provider}`);
    }
  }

  /**
   * Get list of supported providers
   */
  getSupportedProviders(): readonly STTProvider[] {
    return ['whisper', 'local'];
  }

  /**
   * Create Whisper STT service
   */
  private createWhisperService(config: ISTTConfig): WhisperSTTService {
    if (!config.whisper) {
      throw new Error('Whisper configuration is required');
    }

    const whisperConfig: WhisperConfig = {
      apiKey: config.whisper.apiKey,
      model: config.whisper.model || 'whisper-1',
      baseUrl: config.whisper.baseUrl,
    };

    return new WhisperSTTService(whisperConfig);
  }

  /**
   * Create local STT service
   */
  private createLocalService(config: ISTTConfig): LocalSTTService {
    if (!config.local) {
      throw new Error('Local STT configuration is required');
    }

    const localConfig: LocalSTTConfig = {
      modelPath: config.local.modelPath,
    };

    return new LocalSTTService(localConfig);
  }
}

/**
 * Default STT service factory instance
 */
export const sttServiceFactory = new STTServiceFactory();