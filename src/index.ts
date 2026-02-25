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

import type { MemoryGuardianConfig, PluginApi, DailyReport } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { createHeartbeatSummarizer, triggerSummarization, getLatestReport } from './components/heartbeat-summarizer.js';
import { createFaissVectorizerService, getFaissVectorizerService } from './components/faiss-vectorizer.js';
import { performRagRetrieval } from './components/rag-injector.js';
import sessionProtectHandler from './hooks/session-protect/handler.js';
import bootstrapInjectHandler from './hooks/bootstrap-inject/handler.js';
import ragInjectHandler from './hooks/rag-inject/handler.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 獲取當前文件目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Plugin 導出格式
 */
export const id = 'memory-guardian';
export const name = 'Memory Guardian';

/**
 * 合併用戶配置與默認配置
 */
function mergeConfig(userConfig: Partial<MemoryGuardianConfig> = {}): MemoryGuardianConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };
}

/**
 * 獲取 workspace 目錄
 * 優先使用當前 agent 的 workspace，回退到默認目錄
 */
function getWorkspaceDir(api: PluginApi): string {
  // 嘗試從 API 獲取當前 agent 的 workspace
  try {
    const agentWorkspace = (api as any).getAgentWorkspace?.() 
      || (api as any).agentWorkspace 
      || (api as any).workspace;
    if (agentWorkspace) {
      return agentWorkspace;
    }
  } catch (e) {
    // 忽略錯誤，使用回退
  }
  
  // 回退到默認目錄（僅適用於 main/main-lite）
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  return join(home, '.openclaw', 'workspace');
}

/**
 * Plugin 註冊函數
 */
export function register(api: PluginApi): void {
  api.logger.info('[MemoryGuardian] 正在註冊插件...');

  // 獲取配置 - OpenClaw 使用 api.pluginConfig
  const userConfig = (api as any).pluginConfig as Partial<MemoryGuardianConfig> || {};
  const config = mergeConfig(userConfig);
  const workspaceDir = getWorkspaceDir(api);

  api.logger.info(`[MemoryGuardian] 配置:`);
  api.logger.info(`  - Workspace: ${workspaceDir}`);
  api.logger.info(`  - 摘要間隔: ${config.summarizeIntervalMs}ms`);
  api.logger.info(`  - RAG Top-K: ${config.ragTopK}`);
  api.logger.info(`  - Embedding 模型: ${config.embeddingModel}`);

  // ============================================================
  // 1. 註冊 Heartbeat Summarizer 服務
  // ============================================================
  const summarizer = createHeartbeatSummarizer(api, config, workspaceDir);
  api.registerService(summarizer);

  // ============================================================
  // 2. 註冊 FAISS Vectorizer 服務
  // ============================================================
  const vectorizer = createFaissVectorizerService(api, config, workspaceDir);
  api.registerService(vectorizer);

  // ============================================================
  // 3. 註冊 Hooks
  // ============================================================
  // 註冊 Session Protect Hook (攔截 /new, /reset)
  try {
    // 使用 .on() 方法註冊 command 事件
    (api as any).on('command:new', (event: any) => sessionProtectHandler({ ...event, type: 'command', action: 'new' }));
    (api as any).on('command:reset', (event: any) => sessionProtectHandler({ ...event, type: 'command', action: 'reset' }));
    api.logger.info('[MemoryGuardian] Session Protect Hook 已註冊 (command:new, command:reset)');
  } catch (error) {
    api.logger.error('[MemoryGuardian] 註冊 Session Protect Hook 失敗:' + ": " + String(error));
  }

  // 註冊 Bootstrap Inject Hook (新 session 啟動時注入上下文)
  try {
    // @ts-ignore - OpenClaw API 支援 opts.name 但 types 未更新
    api.registerHook(['agent:bootstrap'], bootstrapInjectHandler, {
      name: 'mg-bootstrap-inject',
      description: '新 session 啟動時注入 critical_context'
    });
    api.logger.info('[MemoryGuardian] Bootstrap Inject Hook 已註冊');
  } catch (error) {
    api.logger.error('[MemoryGuardian] 註冊 Bootstrap Inject Hook 失敗:' + ": " + String(error));
  }

  // 註冊 RAG Inject Hook (每次回覆前自動 RAG)
  try {
    (api as any).on('before_prompt_build', ragInjectHandler);
    api.logger.info('[MemoryGuardian] RAG Inject Hook 已註冊');
  } catch (error) {
    api.logger.error('[MemoryGuardian] 註冊 RAG Inject Hook 失敗:' + ": " + String(error));
  }

  // ============================================================
  // 4. 註冊 Gateway RPC 方法
  // ============================================================

  // 狀態查詢
  api.registerGatewayMethod('memory-guardian.status', ({ respond }) => {
    const faissService = getFaissVectorizerService();
    const faissStats = faissService?.getStats() || {
      initialized: false,
      documentCount: 0,
      queueLength: 0,
      isProcessing: false,
    };

    respond(true, {
      plugin: 'memory-guardian',
      version: '1.0.0',
      workspace: workspaceDir,
      config: {
        summarizeIntervalMs: config.summarizeIntervalMs,
        ragTopK: config.ragTopK,
        embeddingModel: config.embeddingModel,
      },
      faiss: faissStats,
    });
  });

  // 手動觸發摘要
  api.registerGatewayMethod('memory-guardian.summarize', async ({ respond }) => {
    try {
      const report = await triggerSummarization(config, workspaceDir);
      if (report) {
        respond(true, { success: true, report });
      } else {
        respond(true, { success: false, error: 'No session log found' });
      }
    } catch (error) {
      respond(false, { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // 獲取最新日報
  api.registerGatewayMethod('memory-guardian.report', ({ respond }) => {
    const report = getLatestReport(workspaceDir);
    if (report) {
      respond(true, { success: true, content: report });
    } else {
      respond(true, { success: false, error: 'No report found' });
    }
  });

  // RAG 檢索
  api.registerGatewayMethod('memory-guardian.search', async ({ respond, params }) => {
    const { query, topK } = params as { query?: string; topK?: number };
    
    if (!query) {
      respond(false, { error: 'Query is required' });
      return;
    }

    try {
      const configWithTopK = topK ? { ...config, ragTopK: topK } : config;
      const result = await performRagRetrieval(query, configWithTopK);
      
      if (result) {
        respond(true, {
          success: true,
          query: result.query,
          searchTimeMs: result.searchTimeMs,
          results: result.results.map(r => ({
            id: r.id,
            distance: r.distance,
            text: r.chunk.text,
            source: r.chunk.sourcePath,
            timestamp: r.chunk.timestamp,
          })),
        });
      } else {
        respond(true, { success: false, error: 'No results or service not ready' });
      }
    } catch (error) {
      respond(false, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // 索引文本
  api.registerGatewayMethod('memory-guardian.index', async ({ respond, params }) => {
    const { text, sourcePath, sessionKey } = params as { 
      text?: string; 
      sourcePath?: string; 
      sessionKey?: string;
    };
    
    if (!text) {
      respond(false, { error: 'Text is required' });
      return;
    }

    const faissService = getFaissVectorizerService();
    if (!faissService) {
      respond(false, { error: 'FAISS service not initialized' });
      return;
    }

    const taskId = faissService.addTask({
      type: 'text',
      content: text,
      sourcePath: sourcePath || 'rpc-input',
      sessionKey,
      priority: 5,
    });

    respond(true, { success: true, taskId });
  });

  // 重建索引
  api.registerGatewayMethod('memory-guardian.reindex', async ({ respond }) => {
    const faissService = getFaissVectorizerService();
    if (!faissService) {
      respond(false, { error: 'FAISS service not initialized' });
      return;
    }

    try {
      const result = await faissService.indexWorkspace();
      respond(true, { success: true, ...result });
    } catch (error) {
      respond(false, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  api.logger.info('[MemoryGuardian] 插件註冊完成');
}

/**
 * 默認導出（兼容兩種導入方式）
 */
export default function(api: PluginApi): void {
  register(api);
}
