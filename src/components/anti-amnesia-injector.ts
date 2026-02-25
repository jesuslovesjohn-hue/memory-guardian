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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { CriticalContext, DailyReport, MemoryGuardianConfig } from '../types.js';

// Critical Context 緩存路徑
const getCriticalContextPath = (workspaceDir: string) =>
  join(workspaceDir, '.memory-guardian', 'critical_context.json');

// Daily Report 路徑
const getDailyReportPath = (workspaceDir: string) =>
  join(workspaceDir, 'reports', 'daily_report_latest.md');

/**
 * 從 Transcript 文件中提取最近的消息
 * OpenClaw 的 transcript 格式：JSONL (type="message", message={role, content})
 */
function extractRecentMessages(
  transcriptPath: string,
  count: number = 30
): string[] {
  if (!existsSync(transcriptPath)) {
    return [];
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    // 取最後 N 條
    const recentLines = lines.slice(-count);
    
    const messages: string[] = [];
    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line);
        // OpenClaw format: {"type":"message","message":{"role":"...","content":...}}
        if (entry.type === 'message' && entry.message) {
          const role = entry.message.role;
          const contentData = entry.message.content;
          
          if (role && contentData) {
            const roleLabel = role === 'user' ? 'User' : 'Assistant';
            
            // content 可能是 string 或 array of content parts
            let textContent: string;
            if (typeof contentData === 'string') {
              textContent = contentData;
            } else if (Array.isArray(contentData)) {
              // Extract text from content parts
              textContent = contentData
                .filter((part: any) => part.type === 'text' && part.text)
                .map((part: any) => part.text)
                .join(' ');
            } else {
              textContent = JSON.stringify(contentData);
            }
            
            messages.push(`[${roleLabel}]: ${textContent.slice(0, 500)}`);
          }
        }
      } catch {
        // 跳過無效的 JSON 行
      }
    }
    
    return messages;
  } catch (error) {
    console.error('[AntiAmnesia] 讀取 transcript 失敗:', error);
    return [];
  }
}

/**
 * 從消息中提取 <thinking> 塊
 */
function extractThinkingChains(messages: string[]): string[] {
  const thinkingPattern = /<thinking>([\s\S]*?)<\/thinking>/gi;
  const chains: string[] = [];

  for (const msg of messages) {
    const matches = msg.matchAll(thinkingPattern);
    for (const match of matches) {
      const thinking = match[1].trim();
      if (thinking.length > 0) {
        // 限制每個思考鏈的長度
        chains.push(thinking.slice(0, 500));
      }
    }
  }

  // 只保留最近的 5 個思考鏈
  return chains.slice(-5);
}

/**
 * 解析 Daily Report Markdown 為結構化數據
 */
function parseDailyReport(markdown: string): DailyReport | null {
  try {
    // 提取摘要
    const summaryMatch = markdown.match(/## 📝 Summary\s*\n\s*([\s\S]*?)(?=\n## |$)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';

    // 提取決策點
    const decisionsMatch = markdown.match(/## 🎯 Decisions\s*\n([\s\S]*?)(?=\n## |$)/);
    const decisions: string[] = [];
    if (decisionsMatch) {
      const items = decisionsMatch[1].matchAll(/^- (.+)$/gm);
      for (const item of items) {
        decisions.push(item[1]);
      }
    }

    // 提取待辦事項
    const actionsMatch = markdown.match(/## ✅ Action Items\s*\n([\s\S]*?)(?=\n## |$)/);
    const actionItems: string[] = [];
    if (actionsMatch) {
      const items = actionsMatch[1].matchAll(/^- \[[ x]\] (.+)$/gm);
      for (const item of items) {
        actionItems.push(item[1]);
      }
    }

    // 提取元數據
    const generatedMatch = markdown.match(/> Generated: (.+)/);
    const sessionMatch = markdown.match(/> Session: (.+)/);
    const countMatch = markdown.match(/> Messages analyzed: (\d+)/);

    return {
      generatedAt: generatedMatch?.[1] || new Date().toISOString(),
      sessionKey: sessionMatch?.[1] || 'unknown',
      summary,
      decisions,
      actionItems,
      messageCount: countMatch ? parseInt(countMatch[1], 10) : 0,
    };
  } catch (error) {
    console.error('[AntiAmnesia] 解析 Daily Report 失敗:', error);
    return null;
  }
}

/**
 * 構建 Critical Context
 * 在 session reset/new 時調用
 */
export async function buildCriticalContext(
  config: MemoryGuardianConfig,
  workspaceDir: string,
  transcriptPath?: string
): Promise<CriticalContext> {
  const context: CriticalContext = {
    dailyReport: undefined,
    recentMessages: [],
    thinkingChains: [],
    timestamp: Date.now(),
  };

  // 1. 讀取 Daily Report
  const reportPath = getDailyReportPath(workspaceDir);
  if (existsSync(reportPath)) {
    try {
      const markdown = readFileSync(reportPath, 'utf-8');
      context.dailyReport = parseDailyReport(markdown) || undefined;
    } catch (error) {
      console.error('[AntiAmnesia] 讀取 Daily Report 失敗:', error);
    }
  }

  // 2. 提取最近消息
  if (transcriptPath && existsSync(transcriptPath)) {
    context.recentMessages = extractRecentMessages(transcriptPath, config.recentMessagesCount);
  }

  // 3. 提取思考鏈
  context.thinkingChains = extractThinkingChains(context.recentMessages);

  return context;
}

/**
 * 將 Critical Context 格式化為 XML
 * 用於注入到 System Prompt
 */
export function formatCriticalContextXml(context: CriticalContext): string {
  const parts: string[] = ['<critical_context>'];
  
  // 添加時間戳
  parts.push(`  <generated_at>${new Date(context.timestamp).toISOString()}</generated_at>`);

  // 添加日報摘要
  if (context.dailyReport) {
    parts.push('  <daily_summary>');
    parts.push(`    <summary>${escapeXml(context.dailyReport.summary)}</summary>`);
    
    if (context.dailyReport.decisions.length > 0) {
      parts.push('    <decisions>');
      for (const decision of context.dailyReport.decisions) {
        parts.push(`      <decision>${escapeXml(decision)}</decision>`);
      }
      parts.push('    </decisions>');
    }

    if (context.dailyReport.actionItems.length > 0) {
      parts.push('    <action_items>');
      for (const item of context.dailyReport.actionItems) {
        parts.push(`      <item>${escapeXml(item)}</item>`);
      }
      parts.push('    </action_items>');
    }
    parts.push('  </daily_summary>');
  }

  // 添加最近消息摘要
  if (context.recentMessages.length > 0) {
    parts.push('  <recent_conversation>');
    // 只包含最後 10 條消息（避免過長）
    const recentSlice = context.recentMessages.slice(-10);
    for (const msg of recentSlice) {
      parts.push(`    <message>${escapeXml(msg.slice(0, 300))}</message>`);
    }
    parts.push('  </recent_conversation>');
  }

  // 添加思考鏈
  if (context.thinkingChains.length > 0) {
    parts.push('  <reasoning_context>');
    for (const chain of context.thinkingChains) {
      parts.push(`    <thought>${escapeXml(chain)}</thought>`);
    }
    parts.push('  </reasoning_context>');
  }

  parts.push('</critical_context>');
  return parts.join('\n');
}

/**
 * XML 特殊字符轉義
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 保存 Critical Context 到緩存文件
 * 供 bootstrap-inject Hook 讀取
 */
export function saveCriticalContext(
  context: CriticalContext,
  workspaceDir: string
): void {
  const cachePath = getCriticalContextPath(workspaceDir);
  const dir = dirname(cachePath);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(cachePath, JSON.stringify(context, null, 2), 'utf-8');
  console.log(`[AntiAmnesia] Critical Context 已保存: ${cachePath}`);
}

/**
 * 讀取緩存的 Critical Context
 */
export function loadCriticalContext(workspaceDir: string): CriticalContext | null {
  const cachePath = getCriticalContextPath(workspaceDir);
  
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 清除 Critical Context 緩存
 */
export function clearCriticalContext(workspaceDir: string): void {
  const cachePath = getCriticalContextPath(workspaceDir);
  
  if (existsSync(cachePath)) {
    const { unlinkSync } = require('fs');
    unlinkSync(cachePath);
    console.log('[AntiAmnesia] Critical Context 緩存已清除');
  }
}
