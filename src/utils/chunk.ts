/**
 * 文本切塊模組
 * 將長文本切分為適合 embedding 的小塊
 */

import type { TextChunk } from '../types.js';
import { randomUUID } from 'crypto';

export interface ChunkOptions {
  /** 每個切塊的目標大小（字符數） */
  chunkSize: number;
  /** 切塊之間的重疊長度 */
  chunkOverlap: number;
  /** 來源文件路徑 */
  sourcePath: string;
  /** Session Key */
  sessionKey?: string;
  /** 額外元數據 */
  metadata?: Record<string, unknown>;
}

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_CHUNK_OVERLAP = 64;

/**
 * 將文本切分為多個 chunk
 * 使用滑動窗口方式，保證上下文連續性
 */
export function chunkText(text: string, options: Partial<ChunkOptions> = {}): TextChunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    sourcePath = 'unknown',
    sessionKey,
    metadata,
  } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  const timestamp = Date.now();

  // 如果文本長度小於 chunkSize，直接返回單個 chunk
  if (text.length <= chunkSize) {
    chunks.push({
      id: randomUUID(),
      text: text.trim(),
      sourcePath,
      offset: 0,
      timestamp,
      sessionKey,
      metadata,
    });
    return chunks;
  }

  // 滑動窗口切分
  let offset = 0;
  const step = chunkSize - chunkOverlap;

  while (offset < text.length) {
    let endPos = offset + chunkSize;
    
    // 確保不超出文本長度
    if (endPos > text.length) {
      endPos = text.length;
    }

    // 嘗試在自然邊界（句號、換行）處切分
    const chunkText = text.slice(offset, endPos);
    const adjustedChunk = adjustChunkBoundary(chunkText, text, offset, endPos);

    if (adjustedChunk.text.trim().length > 0) {
      chunks.push({
        id: randomUUID(),
        text: adjustedChunk.text.trim(),
        sourcePath,
        offset,
        timestamp,
        sessionKey,
        metadata,
      });
    }

    // 移動到下一個位置
    offset += step;

    // 如果已經到達文本末尾，退出循環
    if (offset >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * 調整切塊邊界，優先在自然斷點處切分
 */
function adjustChunkBoundary(
  chunk: string,
  fullText: string,
  startOffset: number,
  endOffset: number
): { text: string; adjustedEnd: number } {
  // 如果已經到達文本末尾，不需要調整
  if (endOffset >= fullText.length) {
    return { text: chunk, adjustedEnd: endOffset };
  }

  // 在 chunk 末尾尋找最近的自然邊界
  const boundaryPatterns = [
    /\n\n/g,     // 段落
    /\n/g,       // 換行
    /[。！？]/g, // 中文句號
    /[.!?]/g,    // 英文句號
    /[，,；;]/g, // 逗號、分號
  ];

  // 只在最後 1/4 的位置尋找邊界
  const searchStart = Math.floor(chunk.length * 0.75);
  const searchRegion = chunk.slice(searchStart);

  for (const pattern of boundaryPatterns) {
    const matches = [...searchRegion.matchAll(pattern)];
    if (matches.length > 0) {
      // 使用最後一個匹配
      const lastMatch = matches[matches.length - 1];
      const boundaryPos = searchStart + lastMatch.index! + lastMatch[0].length;
      return {
        text: chunk.slice(0, boundaryPos),
        adjustedEnd: startOffset + boundaryPos,
      };
    }
  }

  // 沒有找到自然邊界，返回原始切塊
  return { text: chunk, adjustedEnd: endOffset };
}

/**
 * 將對話記錄切分為 chunks
 * 專門處理 OpenClaw 的對話格式
 */
export function chunkConversation(
  messages: Array<{ role: string; content: string; timestamp?: number }>,
  options: Partial<ChunkOptions> = {}
): TextChunk[] {
  const formattedMessages = messages.map((msg) => {
    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
    return `[${roleLabel}]: ${msg.content}`;
  });

  // 將對話組合成文本，每條消息用換行分隔
  const conversationText = formattedMessages.join('\n\n');

  return chunkText(conversationText, {
    ...options,
    metadata: {
      ...options.metadata,
      type: 'conversation',
      messageCount: messages.length,
    },
  });
}

/**
 * 從 Markdown 文件內容中提取並切分
 */
export function chunkMarkdown(content: string, options: Partial<ChunkOptions> = {}): TextChunk[] {
  // 預處理：移除過多的空行
  const cleaned = content.replace(/\n{3,}/g, '\n\n');
  
  // 嘗試按標題分割
  const sections = splitByHeaders(cleaned);
  
  const allChunks: TextChunk[] = [];
  
  for (const section of sections) {
    if (section.content.trim().length === 0) continue;
    
    const chunks = chunkText(section.content, {
      ...options,
      metadata: {
        ...options.metadata,
        sectionHeader: section.header,
        type: 'markdown',
      },
    });
    
    allChunks.push(...chunks);
  }

  return allChunks;
}

/**
 * 按 Markdown 標題分割文本
 */
function splitByHeaders(content: string): Array<{ header: string; content: string }> {
  const headerPattern = /^(#{1,6})\s+(.+)$/gm;
  const matches = [...content.matchAll(headerPattern)];
  
  if (matches.length === 0) {
    return [{ header: '', content }];
  }

  const sections: Array<{ header: string; content: string }> = [];
  
  // 添加第一個標題之前的內容
  if (matches[0].index! > 0) {
    sections.push({
      header: '',
      content: content.slice(0, matches[0].index!),
    });
  }

  // 按標題分割
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    const startPos = currentMatch.index!;
    const endPos = nextMatch ? nextMatch.index! : content.length;
    
    sections.push({
      header: currentMatch[2],
      content: content.slice(startPos, endPos),
    });
  }

  return sections;
}

/**
 * 估算文本的 token 數量（粗略估計）
 * 中文約 1.5 字符/token，英文約 4 字符/token
 */
export function estimateTokens(text: string): number {
  // 統計中文字符數
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 統計英文和數字
  const englishChars = text.length - chineseChars;
  
  // 粗略估計
  const chineseTokens = chineseChars / 1.5;
  const englishTokens = englishChars / 4;
  
  return Math.ceil(chineseTokens + englishTokens);
}
