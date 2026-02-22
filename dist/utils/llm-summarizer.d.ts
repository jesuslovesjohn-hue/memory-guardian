/**
 * 本地 LLM 摘要模組
 * 使用 Ollama API 進行輕量級文本摘要
 */
import type { DailyReport } from '../types.js';
interface LlmConfig {
    endpoint: string;
    model: string;
}
/**
 * 生成對話日報
 * 從對話記錄中提取摘要、決策點和待辦事項
 */
export declare function generateDailyReport(conversationLog: string, sessionKey: string, config?: Partial<LlmConfig>): Promise<DailyReport>;
/**
 * 生成簡短摘要（用於 RAG 注入）
 */
export declare function generateBriefSummary(text: string, config?: Partial<LlmConfig>): Promise<string>;
/**
 * 檢查本地 LLM 服務是否可用
 */
export declare function checkLlmAvailability(config?: Partial<LlmConfig>): Promise<boolean>;
export {};
