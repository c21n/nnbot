/**
 * Whisper STT Service
 *
 * Uses OpenAI's Whisper API for speech-to-text transcription
 */

import axios, { type AxiosInstance } from "axios";
import type { ISTTService, ISTTResult, STTProvider } from "../types/stt.types.js";

export interface WhisperConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
}

export class WhisperSTTService implements ISTTService {
  private client: AxiosInstance;
  private model: string;
  private provider: STTProvider = 'whisper';

  constructor(config: WhisperConfig) {
    this.model = config.model || 'whisper-1';

    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000, // 60 second timeout for transcription
    });
  }

  /**
   * Transcribe audio to text using Whisper API
   */
  async transcribe(audioData: Buffer, mimeType: string): Promise<ISTTResult> {
    try {
      // Create FormData for file upload
      const formData = new FormData();
      const blob = new Blob([audioData], { type: mimeType });
      formData.append('file', blob, `audio.${this.getExtension(mimeType)}`);
      formData.append('model', this.model);

      const response = await this.client.post('/audio/transcriptions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return {
        text: response.data.text || '',
        language: response.data.language,
      };
    } catch (error) {
      console.error('Whisper transcription failed:', error);
      throw error;
    }
  }

  /**
   * Check if Whisper service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to list models to check if API key is valid
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get provider type
   */
  getProvider(): STTProvider {
    return this.provider;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/m4a': 'm4a',
      'audio/opus': 'opus',
      'audio/webm': 'webm',
    };
    return mimeToExt[mimeType] || 'wav';
  }
}