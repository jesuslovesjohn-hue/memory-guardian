/**
 * 組件 1: 心跳摘要器 (Heartbeat Summarizer)
 *
 * 功能：
 * - 定時（默認每小時）讀取當前會話的 Markdown log
 * - 調用本地 LLM 進行輕量級總結
 * - 提取：① 對話摘要 ② 決策點 ③ 待辦事項
 * - 輸出到 ~/.openclaw/workspace/reports/daily_report_latest.md
 *
 * 與 OpenClaw 的整合方式：
 * - 註冊為 Plugin Service，隨 Gateway 啟動/停止
 * - 使用 setInterval 實現定時任務（與 OpenClaw Heartbeat 系統配合）
 */
import type { MemoryGuardianConfig, DailyReport, PluginApi } from '../types.js';
/**
 * 創建心跳摘要器服務
 *
 * @param api OpenClaw Plugin API
 * @param config 配置選項
 * @param workspaceDir 工作空間目錄
 */
export declare function createHeartbeatSummarizer(api: PluginApi, config: MemoryGuardianConfig, workspaceDir: string): {
    id: string;
    start: () => Promise<void>;
    stop: () => void;
};
/**
 * 手動觸發摘要生成（供 RPC 調用）
 */
export declare function triggerSummarization(config: MemoryGuardianConfig, workspaceDir: string): Promise<DailyReport | null>;
/**
 * 讀取最新的日報
 */
export declare function getLatestReport(workspaceDir: string): string | null;
