/**
 * Session Protect Hook Handler
 * 
 * 監聽 command:new 和 command:reset 事件
 * 在 session 重置前提取並保存關鍵上下文
 */

import type { HookHandler, HookEvent } from '../../types.js';
import { buildCriticalContext, saveCriticalContext } from '../../components/anti-amnesia-injector.js';
import { DEFAULT_CONFIG } from '../../types.js';
import { join } from 'path';

const handler: HookHandler = async (event: HookEvent): Promise<void> => {
  // 只處理 command:new 和 command:reset
  if (event.type !== 'command') {
    return;
  }

  if (event.action !== 'new' && event.action !== 'reset') {
    return;
  }

  console.log(`[session-protect] 觸發: ${event.action}，Session: ${event.sessionKey}`);

  // 獲取 workspace 目錄
  const workspaceDir = event.context.workspaceDir;
  if (!workspaceDir) {
    console.warn('[session-protect] 無法獲取 workspace 目錄，跳過');
    return;
  }

  // 獲取 transcript 文件路徑
  const transcriptPath = event.context.sessionFile;

  try {
    // 構建 Critical Context
    // 使用默認配置（實際部署時應從 plugin config 讀取）
    const context = await buildCriticalContext(
      DEFAULT_CONFIG,
      workspaceDir,
      transcriptPath || undefined
    );

    // 保存到緩存
    saveCriticalContext(context, workspaceDir);

    console.log(`[session-protect] Critical Context 已保存`);
    console.log(`  - Daily Report: ${context.dailyReport ? '有' : '無'}`);
    console.log(`  - 最近消息: ${context.recentMessages.length} 條`);
    console.log(`  - 思考鏈: ${context.thinkingChains.length} 個`);

    // 添加用戶提示消息
    event.messages.push('🛡️ Memory Guardian: 關鍵上下文已保存，將在下次對話中注入');

  } catch (error) {
    console.error('[session-protect] 保存 Critical Context 失敗:', error);
  }
};

export default handler;
