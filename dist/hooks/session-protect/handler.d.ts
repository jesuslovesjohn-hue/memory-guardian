/**
 * Session Protect Hook Handler
 *
 * 監聽 command:new 和 command:reset 事件
 * 在 session 重置前提取並保存關鍵上下文
 */
import type { HookHandler } from '../../types.js';
declare const handler: HookHandler;
export default handler;
