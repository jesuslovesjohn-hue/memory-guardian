/**
 * Bootstrap Inject Hook Handler
 *
 * 監聯 agent:bootstrap 事件
 * 在 Agent 啟動時注入 Critical Context 和 RAG 歷史記憶
 */
import type { HookHandler } from '../../types.js';
declare const handler: HookHandler;
export default handler;
