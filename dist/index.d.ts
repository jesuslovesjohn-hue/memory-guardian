/**
 * Memory Guardian Plugin - 主入口
 * 四層防護上下文記憶系統
 *
 * 組件：
 * 1. Heartbeat Summarizer - 定時生成日報
 * 2. Anti-Amnesia Injector - 上下文保護
 * 3. FAISS Vectorizer - 向量索引
 * 4. RAG Injector - 歷史記憶注入
 *
 * 與 OpenClaw 的整合：
 * - 註冊兩個 Background Services
 * - 註冊 Hooks（session-protect, bootstrap-inject）
 * - 提供 Gateway RPC 接口
 */
import type { PluginApi } from './types.js';
/**
 * Plugin 導出格式
 */
export declare const id = "memory-guardian";
export declare const name = "Memory Guardian";
/**
 * Plugin 註冊函數
 */
export declare function register(api: PluginApi): void;
/**
 * 默認導出（兼容兩種導入方式）
 */
export default function (api: PluginApi): void;
