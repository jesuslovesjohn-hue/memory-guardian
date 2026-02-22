/**
 * Memory Guardian - 類型定義
 * 四層防護上下文記憶系統
 */
export interface MemoryGuardianConfig {
    /** 心跳摘要間隔（毫秒），默認 1 小時 */
    summarizeIntervalMs: number;
    /** RAG 檢索返回的最相關文本數量 */
    ragTopK: number;
    /** 文本切塊大小（字符） */
    chunkSize: number;
    /** 切塊重疊長度 */
    chunkOverlap: number;
    /** 反遺忘注入時提取的最近消息數量 */
    recentMessagesCount: number;
    /** Embedding 模型名稱 */
    embeddingModel: string;
    /** 本地 LLM API 端點 */
    localLlmEndpoint: string;
    /** 本地 LLM 模型名稱 */
    localLlmModel: string;
}
export declare const DEFAULT_CONFIG: MemoryGuardianConfig;
export interface TextChunk {
    /** 切塊唯一 ID */
    id: string;
    /** 原始文本內容 */
    text: string;
    /** 來源文件路徑 */
    sourcePath: string;
    /** 在源文件中的偏移位置 */
    offset: number;
    /** 時間戳 */
    timestamp: number;
    /** Session Key */
    sessionKey?: string;
    /** 元數據 */
    metadata?: Record<string, unknown>;
}
export interface VectorDocument {
    /** 文檔 ID（與 FAISS index 對應） */
    id: number;
    /** 文本切塊 */
    chunk: TextChunk;
    /** 384 維向量 */
    embedding: Float32Array;
}
export interface SearchResult {
    /** 文檔 ID */
    id: number;
    /** 距離分數（越小越相似） */
    distance: number;
    /** 對應的文本切塊 */
    chunk: TextChunk;
}
export interface DailyReport {
    /** 生成時間 */
    generatedAt: string;
    /** Session Key */
    sessionKey: string;
    /** 對話摘要 */
    summary: string;
    /** 決策點列表 */
    decisions: string[];
    /** 待辦事項列表 */
    actionItems: string[];
    /** 原始消息數量 */
    messageCount: number;
}
export interface CriticalContext {
    /** 最新日報摘要 */
    dailyReport?: DailyReport;
    /** 最近 N 條消息 */
    recentMessages: string[];
    /** 最近的 <thinking> 思考鏈內容 */
    thinkingChains: string[];
    /** 生成時間戳 */
    timestamp: number;
}
export interface RagInjection {
    /** 檢索查詢 */
    query: string;
    /** 檢索結果 */
    results: SearchResult[];
    /** 組裝後的歷史記憶 XML */
    historicalMemoryXml: string;
    /** 檢索耗時（毫秒） */
    searchTimeMs: number;
}
export interface PluginApi {
    logger: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
        debug: (msg: string) => void;
    };
    config: {
        get: <T>(path: string, defaultValue?: T) => T;
    };
    registerService: (service: {
        id: string;
        start: () => void | Promise<void>;
        stop: () => void | Promise<void>;
    }) => void;
    registerGatewayMethod: (name: string, handler: (ctx: {
        respond: (ok: boolean, data: unknown) => void;
        params: unknown;
    }) => void) => void;
}
export interface HookEvent {
    type: 'command' | 'session' | 'agent' | 'gateway';
    action: string;
    sessionKey: string;
    timestamp: Date;
    messages: string[];
    context: {
        sessionEntry?: unknown;
        sessionId?: string;
        sessionFile?: string;
        commandSource?: string;
        senderId?: string;
        workspaceDir?: string;
        bootstrapFiles?: Array<{
            path: string;
            content: string;
            priority?: number;
        }>;
        cfg?: unknown;
    };
}
export type HookHandler = (event: HookEvent) => void | Promise<void>;
