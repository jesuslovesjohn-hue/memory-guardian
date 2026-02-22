/**
 * 組件 3: FAISS 向量化器 (FAISS + Vectorizer)
 *
 * 功能：
 * - 在服務啟動時，初始化 @xenova/transformers 的 all-MiniLM-L6-v2 模型
 * - 初始化 faiss-node 並加載/創建向量索引
 * - 建立異步任務隊列，處理新消息的向量化
 * - 持久化索引到本地文件
 *
 * 與 OpenClaw 的整合：
 * - 註冊為 Plugin Service
 * - 提供 Gateway RPC 接口供外部調用
 */
import type { MemoryGuardianConfig, PluginApi, SearchResult } from '../types.js';
interface IndexTask {
    id: string;
    type: 'text' | 'file' | 'conversation';
    content: string;
    sourcePath: string;
    sessionKey?: string;
    metadata?: Record<string, unknown>;
    priority: number;
    createdAt: number;
}
/**
 * FAISS 向量化服務類
 */
export declare class FaissVectorizerService {
    private api;
    private config;
    private workspaceDir;
    private store;
    private taskQueue;
    private isProcessing;
    private processIntervalId;
    private initialized;
    constructor(api: PluginApi, config: MemoryGuardianConfig, workspaceDir: string);
    /**
     * 初始化服務
     */
    initialize(): Promise<void>;
    /**
     * 啟動任務處理循環
     */
    startProcessing(): void;
    /**
     * 停止任務處理循環
     */
    stopProcessing(): void;
    /**
     * 添加索引任務到隊列
     */
    addTask(task: Omit<IndexTask, 'id' | 'createdAt'>): string;
    /**
     * 處理隊列中的任務
     */
    private processTasks;
    /**
     * 處理單個任務
     */
    private processTask;
    /**
     * 搜索相似向量
     */
    search(query: string, topK?: number): Promise<SearchResult[]>;
    /**
     * 索引工作空間中的文件
     */
    indexWorkspace(): Promise<{
        indexed: number;
        errors: number;
    }>;
    /**
     * 獲取索引統計信息
     */
    getStats(): {
        initialized: boolean;
        documentCount: number;
        queueLength: number;
        isProcessing: boolean;
    };
    /**
     * 關閉服務
     */
    shutdown(): Promise<void>;
}
/**
 * 創建 FAISS 向量化服務
 */
export declare function createFaissVectorizerService(api: PluginApi, config: MemoryGuardianConfig, workspaceDir: string): {
    id: string;
    start: () => Promise<void>;
    stop: () => Promise<void>;
};
/**
 * 獲取全局服務實例
 */
export declare function getFaissVectorizerService(): FaissVectorizerService | null;
export {};
