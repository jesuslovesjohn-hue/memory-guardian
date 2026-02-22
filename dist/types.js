/**
 * Memory Guardian - 類型定義
 * 四層防護上下文記憶系統
 */
export const DEFAULT_CONFIG = {
    summarizeIntervalMs: 3600000, // 1 hour
    ragTopK: 5,
    chunkSize: 512,
    chunkOverlap: 64,
    recentMessagesCount: 30,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    localLlmEndpoint: 'http://localhost:11434/api/generate',
    localLlmModel: 'qwen2.5:7b',
};
