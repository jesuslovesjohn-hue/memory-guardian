/**
 * 組件 2: 反遺忘注入器 (Anti-Amnesia Injector)
 *
 * 功能：
 * - 監聽 OpenClaw 的 command:new / command:reset 事件
 * - 當上下文即將被壓縮/重置時，提取關鍵信息
 * - 組裝 <critical_context> XML 塊，準備注入到新的 Context Window
 *
 * 提取內容：
 * - daily_report_latest.md 的摘要
 * - 最近 30 條消息
 * - 最近的 <thinking>...</thinking> 思考鏈
 *
 * 注意：此模組生成數據，實際注入由 bootstrap-inject Hook 完成
 */
import type { CriticalContext, MemoryGuardianConfig } from '../types.js';
/**
 * 構建 Critical Context
 * 在 session reset/new 時調用
 */
export declare function buildCriticalContext(config: MemoryGuardianConfig, workspaceDir: string, transcriptPath?: string): Promise<CriticalContext>;
/**
 * 將 Critical Context 格式化為 XML
 * 用於注入到 System Prompt
 */
export declare function formatCriticalContextXml(context: CriticalContext): string;
/**
 * 保存 Critical Context 到緩存文件
 * 供 bootstrap-inject Hook 讀取
 */
export declare function saveCriticalContext(context: CriticalContext, workspaceDir: string): void;
/**
 * 讀取緩存的 Critical Context
 */
export declare function loadCriticalContext(workspaceDir: string): CriticalContext | null;
/**
 * 清除 Critical Context 緩存
 */
export declare function clearCriticalContext(workspaceDir: string): void;
