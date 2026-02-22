/**
 * 文本切塊模組
 * 將長文本切分為適合 embedding 的小塊
 */
import type { TextChunk } from '../types.js';
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
/**
 * 將文本切分為多個 chunk
 * 使用滑動窗口方式，保證上下文連續性
 */
export declare function chunkText(text: string, options?: Partial<ChunkOptions>): TextChunk[];
/**
 * 將對話記錄切分為 chunks
 * 專門處理 OpenClaw 的對話格式
 */
export declare function chunkConversation(messages: Array<{
    role: string;
    content: string;
    timestamp?: number;
}>, options?: Partial<ChunkOptions>): TextChunk[];
/**
 * 從 Markdown 文件內容中提取並切分
 */
export declare function chunkMarkdown(content: string, options?: Partial<ChunkOptions>): TextChunk[];
/**
 * 估算文本的 token 數量（粗略估計）
 * 中文約 1.5 字符/token，英文約 4 字符/token
 */
export declare function estimateTokens(text: string): number;
