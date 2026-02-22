/**
 * Bootstrap Inject Hook Handler
 * 
 * 監聯 agent:bootstrap 事件
 * 在 Agent 啟動時注入 Critical Context 和 RAG 歷史記憶
 */

import type { HookHandler, HookEvent } from '../../types.js';
import { loadCriticalContext, formatCriticalContextXml, clearCriticalContext } from '../../components/anti-amnesia-injector.js';
import { createRagBootstrapFile, shouldPerformRag } from '../../components/rag-injector.js';
import { DEFAULT_CONFIG } from '../../types.js';

const handler: HookHandler = async (event: HookEvent): Promise<void> => {
  // 只處理 agent:bootstrap 事件
  if (event.type !== 'agent' || event.action !== 'bootstrap') {
    return;
  }

  console.log(`[bootstrap-inject] 觸發: agent:bootstrap`);

  // 獲取 workspace 目錄
  const workspaceDir = event.context.workspaceDir;
  if (!workspaceDir) {
    console.warn('[bootstrap-inject] 無法獲取 workspace 目錄，跳過');
    return;
  }

  // 確保 bootstrapFiles 數組存在
  if (!event.context.bootstrapFiles) {
    event.context.bootstrapFiles = [];
  }

  const bootstrapFiles = event.context.bootstrapFiles;
  let injectedCount = 0;

  // ============================================================
  // 1. 注入 Critical Context（Anti-Amnesia）
  // ============================================================
  try {
    const criticalContext = loadCriticalContext(workspaceDir);
    
    if (criticalContext) {
      const xml = formatCriticalContextXml(criticalContext);
      
      bootstrapFiles.push({
        path: 'MEMORY_GUARDIAN_CONTEXT.md',
        content: `<!-- Memory Guardian: Critical Context Injection -->
<!-- This context was preserved during the last session reset -->

${xml}
`,
        priority: -50,  // 在 SOUL.md 等之後，但在 RAG 之前
      });

      console.log('[bootstrap-inject] Critical Context 已注入');
      console.log(`  - 包含日報: ${criticalContext.dailyReport ? '是' : '否'}`);
      console.log(`  - 最近消息: ${criticalContext.recentMessages.length} 條`);
      
      // 清除緩存（只注入一次）
      clearCriticalContext(workspaceDir);
      injectedCount++;
    }
  } catch (error) {
    console.error('[bootstrap-inject] 注入 Critical Context 失敗:', error);
  }

  // ============================================================
  // 2. 注入 RAG 歷史記憶
  // ============================================================
  try {
    // 嘗試從最近的 bootstrapFiles 中獲取用戶輸入
    // 或者使用會話上下文中的最後一條用戶消息
    let userQuery: string | null = null;

    // 這裡我們使用一個簡化的方法：
    // 如果有用戶輸入，它應該在某個地方可用
    // 實際實現可能需要從 session entry 中獲取
    // 目前我們使用 Critical Context 中的最後一條用戶消息
    const criticalContext = loadCriticalContext(workspaceDir);
    if (criticalContext && criticalContext.recentMessages.length > 0) {
      // 找到最後一條用戶消息
      for (let i = criticalContext.recentMessages.length - 1; i >= 0; i--) {
        const msg = criticalContext.recentMessages[i];
        if (msg.startsWith('[User]:')) {
          userQuery = msg.replace('[User]:', '').trim();
          break;
        }
      }
    }

    // 如果沒有找到用戶查詢，使用 session key 作為回退
    if (!userQuery && event.sessionKey) {
      userQuery = event.sessionKey;
    }

    // 檢查是否應該執行 RAG
    if (userQuery && shouldPerformRag(userQuery)) {
      const ragFile = await createRagBootstrapFile(userQuery, DEFAULT_CONFIG);
      
      if (ragFile) {
        bootstrapFiles.push(ragFile);
        console.log('[bootstrap-inject] RAG 歷史記憶已注入');
        injectedCount++;
      }
    }
  } catch (error) {
    console.error('[bootstrap-inject] 注入 RAG 歷史記憶失敗:', error);
  }

  if (injectedCount > 0) {
    console.log(`[bootstrap-inject] 完成，共注入 ${injectedCount} 個上下文塊`);
  }
};

export default handler;
