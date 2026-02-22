/**
 * 組件 4: 無感 RAG 注入器 (Pre-prompt RAG Hook)
 *
 * 功能：
 * - 攔截用戶輸入，將其轉換為向量
 * - 對本地 FAISS 執行檢索（k=5）
 * - 將檢索結果組裝成 <historical_memory> XML
 * - 靜默拼接到 System Prompt 尾部
 * - 確保檢索時間 < 300ms
 *
 * 與 OpenClaw 的整合：
 * - 通過 agent:bootstrap Hook 注入到 bootstrapFiles
 * - 提供 Gateway RPC 接口供手動查詢
 */
import type { MemoryGuardianConfig, RagInjection } from '../types.js';
/**
 * 執行 RAG 檢索
 *
 * @param query 用戶查詢
 * @param config 配置
 * @returns RAG 注入結果
 */
export declare function performRagRetrieval(query: string, config: MemoryGuardianConfig): Promise<RagInjection | null>;
/**
 * 獲取 RAG 注入的 Markdown 內容
 * 用於注入到 bootstrapFiles
 */
export declare function getRagInjectionContent(query: string, config: MemoryGuardianConfig): Promise<string | null>;
/**
 * 創建 RAG 注入的 bootstrap 文件對象
 * 供 agent:bootstrap Hook 使用
 */
export declare function createRagBootstrapFile(query: string, config: MemoryGuardianConfig): Promise<{
    path: string;
    content: string;
    priority: number;
} | null>;
/**
 * 判斷查詢是否需要 RAG
 * 排除簡單的問候語和命令
 */
export declare function shouldPerformRag(query: string): boolean;
/**
 * 計算查詢的檢索關鍵詞
 * 用於優化檢索效果
 */
export declare function extractQueryKeywords(query: string): string[];
