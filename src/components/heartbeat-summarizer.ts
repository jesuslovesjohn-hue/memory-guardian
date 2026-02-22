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

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { MemoryGuardianConfig, DailyReport, PluginApi } from '../types.js';
import { generateDailyReport, checkLlmAvailability } from '../utils/llm-summarizer.js';

// 報告輸出路徑
const getReportPath = (workspaceDir: string) => 
  join(workspaceDir, 'reports', 'daily_report_latest.md');

// Memory 日誌路徑
const getMemoryDir = (workspaceDir: string) => 
  join(workspaceDir, 'memory');

/**
 * 獲取最新的 session log 文件
 */
function getLatestSessionLog(memoryDir: string): string | null {
  if (!existsSync(memoryDir)) {
    return null;
  }

  const files = readdirSync(memoryDir)
    .filter(f => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(f))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  return join(memoryDir, files[0]);
}

/**
 * 讀取會話日誌內容
 */
function readSessionLog(logPath: string): string {
  try {
    return readFileSync(logPath, 'utf-8');
  } catch (error) {
    console.error(`[HeartbeatSummarizer] 讀取日誌失敗: ${logPath}`, error);
    return '';
  }
}

/**
 * 將日報輸出為 Markdown 格式
 */
function formatReportAsMarkdown(report: DailyReport): string {
  const lines: string[] = [
    `# Daily Report`,
    '',
    `> Generated: ${report.generatedAt}`,
    `> Session: ${report.sessionKey}`,
    `> Messages analyzed: ${report.messageCount}`,
    '',
    '## 📝 Summary',
    '',
    report.summary,
    '',
  ];

  if (report.decisions.length > 0) {
    lines.push('## 🎯 Decisions', '');
    for (const decision of report.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push('');
  }

  if (report.actionItems.length > 0) {
    lines.push('## ✅ Action Items', '');
    for (const item of report.actionItems) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 保存日報到文件
 */
function saveReport(report: DailyReport, reportPath: string): void {
  const dir = dirname(reportPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const markdown = formatReportAsMarkdown(report);
  writeFileSync(reportPath, markdown, 'utf-8');
  console.log(`[HeartbeatSummarizer] 日報已保存: ${reportPath}`);
}

/**
 * 創建心跳摘要器服務
 * 
 * @param api OpenClaw Plugin API
 * @param config 配置選項
 * @param workspaceDir 工作空間目錄
 */
export function createHeartbeatSummarizer(
  api: PluginApi,
  config: MemoryGuardianConfig,
  workspaceDir: string
): {
  id: string;
  start: () => Promise<void>;
  stop: () => void;
} {
  let intervalId: NodeJS.Timeout | null = null;
  let isRunning = false;

  const memoryDir = getMemoryDir(workspaceDir);
  const reportPath = getReportPath(workspaceDir);

  /**
   * 執行一次摘要任務
   */
  async function runSummarization(): Promise<void> {
    if (isRunning) {
      api.logger.debug('[HeartbeatSummarizer] 上一次任務仍在執行，跳過');
      return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
      api.logger.info('[HeartbeatSummarizer] 開始生成日報...');

      // 獲取最新的 session log
      const logPath = getLatestSessionLog(memoryDir);
      if (!logPath) {
        api.logger.debug('[HeartbeatSummarizer] 沒有找到 session log，跳過');
        return;
      }

      // 讀取日誌內容
      const logContent = readSessionLog(logPath);
      if (!logContent || logContent.trim().length === 0) {
        api.logger.debug('[HeartbeatSummarizer] 日誌內容為空，跳過');
        return;
      }

      // 檢查 LLM 可用性
      const llmAvailable = await checkLlmAvailability({
        endpoint: config.localLlmEndpoint,
        model: config.localLlmModel,
      });

      if (!llmAvailable) {
        api.logger.warn('[HeartbeatSummarizer] 本地 LLM 不可用，跳過摘要生成');
        return;
      }

      // 生成日報
      const sessionKey = logPath.split('/').pop()?.replace('.md', '') || 'unknown';
      const report = await generateDailyReport(logContent, sessionKey, {
        endpoint: config.localLlmEndpoint,
        model: config.localLlmModel,
      });

      // 保存日報
      saveReport(report, reportPath);

      const elapsed = Date.now() - startTime;
      api.logger.info(`[HeartbeatSummarizer] 日報生成完成，耗時 ${elapsed}ms`);

    } catch (error) {
      api.logger.error(`[HeartbeatSummarizer] 生成日報失敗: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      isRunning = false;
    }
  }

  return {
    id: 'heartbeat-summarizer',

    /**
     * 啟動服務
     * 註冊定時任務
     */
    async start(): Promise<void> {
      api.logger.info('[HeartbeatSummarizer] 啟動心跳摘要服務');
      api.logger.info(`  - 間隔: ${config.summarizeIntervalMs}ms (${config.summarizeIntervalMs / 60000} 分鐘)`);
      api.logger.info(`  - LLM: ${config.localLlmModel} @ ${config.localLlmEndpoint}`);
      api.logger.info(`  - 輸出: ${reportPath}`);

      // 啟動時執行一次
      await runSummarization();

      // 設置定時任務
      intervalId = setInterval(() => {
        runSummarization().catch((error) => {
          api.logger.error(`[HeartbeatSummarizer] 定時任務錯誤: ${error}`);
        });
      }, config.summarizeIntervalMs);
    },

    /**
     * 停止服務
     */
    stop(): void {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      api.logger.info('[HeartbeatSummarizer] 心跳摘要服務已停止');
    },
  };
}

/**
 * 手動觸發摘要生成（供 RPC 調用）
 */
export async function triggerSummarization(
  config: MemoryGuardianConfig,
  workspaceDir: string
): Promise<DailyReport | null> {
  const memoryDir = getMemoryDir(workspaceDir);
  const reportPath = getReportPath(workspaceDir);

  const logPath = getLatestSessionLog(memoryDir);
  if (!logPath) {
    return null;
  }

  const logContent = readSessionLog(logPath);
  if (!logContent) {
    return null;
  }

  const sessionKey = logPath.split('/').pop()?.replace('.md', '') || 'unknown';
  const report = await generateDailyReport(logContent, sessionKey, {
    endpoint: config.localLlmEndpoint,
    model: config.localLlmModel,
  });

  saveReport(report, reportPath);
  return report;
}

/**
 * 讀取最新的日報
 */
export function getLatestReport(workspaceDir: string): string | null {
  const reportPath = getReportPath(workspaceDir);
  if (!existsSync(reportPath)) {
    return null;
  }
  return readFileSync(reportPath, 'utf-8');
}
