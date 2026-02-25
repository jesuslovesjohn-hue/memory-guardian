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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { initEmbeddings, embedText, embedTexts, disposeEmbeddings } from '../utils/embeddings.js';
import { getVectorStore } from '../utils/faiss-store.js';
import { chunkText, chunkMarkdown } from '../utils/chunk.js';
/**
 * FAISS 向量化服務類
 */
export class FaissVectorizerService {
    api;
    config;
    workspaceDir;
    store = null;
    taskQueue = [];
    isProcessing = false;
    processIntervalId = null;
    initialized = false;
    constructor(api, config, workspaceDir) {
        this.api = api;
        this.config = config;
        this.workspaceDir = workspaceDir;
    }
    /**
     * 初始化服務
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        this.api.logger.info('[FaissVectorizer] 正在初始化...');
        const startTime = Date.now();
        try {
            // 1. 初始化 embedding 模型
            await initEmbeddings(this.config.embeddingModel);
            // 2. 初始化向量存儲
            const indexPath = join(this.workspaceDir, '.memory-guardian', 'vector.index');
            const metaPath = join(this.workspaceDir, '.memory-guardian', 'vector.meta.json');
            // 確保目錄存在
            const dir = join(this.workspaceDir, '.memory-guardian');
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            this.store = await getVectorStore({ indexPath, metaPath });
            const elapsed = Date.now() - startTime;
            this.api.logger.info(`[FaissVectorizer] 初始化完成，耗時 ${elapsed}ms`);
            this.api.logger.info(`  - 當前索引文檔數: ${this.store.getDocumentCount()}`);
            this.initialized = true;
        }
        catch (error) {
            this.api.logger.error(`[FaissVectorizer] 初始化失敗: ${error}`);
            throw error;
        }
    }
    /**
     * 啟動任務處理循環
     */
    startProcessing() {
        if (this.processIntervalId) {
            return;
        }
        // 每 5 秒處理一批任務
        this.processIntervalId = setInterval(() => {
            this.processTasks().catch((error) => {
                this.api.logger.error(`[FaissVectorizer] 處理任務錯誤: ${error}`);
            });
        }, 5000);
        this.api.logger.info('[FaissVectorizer] 任務處理循環已啟動');
    }
    /**
     * 停止任務處理循環
     */
    stopProcessing() {
        if (this.processIntervalId) {
            clearInterval(this.processIntervalId);
            this.processIntervalId = null;
        }
    }
    /**
     * 添加索引任務到隊列
     */
    addTask(task) {
        const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const fullTask = {
            ...task,
            id,
            createdAt: Date.now(),
        };
        this.taskQueue.push(fullTask);
        // 按優先級排序（高優先級在前）
        this.taskQueue.sort((a, b) => b.priority - a.priority);
        this.api.logger.debug(`[FaissVectorizer] 任務已加入隊列: ${id}`);
        return id;
    }
    /**
     * 處理隊列中的任務
     */
    async processTasks() {
        if (this.isProcessing || this.taskQueue.length === 0 || !this.store) {
            return;
        }
        this.isProcessing = true;
        try {
            // 每次處理最多 10 個任務
            const batch = this.taskQueue.splice(0, 10);
            this.api.logger.debug(`[FaissVectorizer] 處理 ${batch.length} 個任務`);
            for (const task of batch) {
                await this.processTask(task);
            }
            // 保存索引
            await this.store.flush();
        }
        finally {
            this.isProcessing = false;
        }
    }
    /**
     * 處理單個任務
     */
    async processTask(task) {
        if (!this.store) {
            throw new Error('向量存儲未初始化');
        }
        try {
            let chunks;
            switch (task.type) {
                case 'text':
                    chunks = chunkText(task.content, {
                        chunkSize: this.config.chunkSize,
                        chunkOverlap: this.config.chunkOverlap,
                        sourcePath: task.sourcePath,
                        sessionKey: task.sessionKey,
                        metadata: task.metadata,
                    });
                    break;
                case 'file':
                    if (task.sourcePath.endsWith('.md')) {
                        chunks = chunkMarkdown(task.content, {
                            chunkSize: this.config.chunkSize,
                            chunkOverlap: this.config.chunkOverlap,
                            sourcePath: task.sourcePath,
                            sessionKey: task.sessionKey,
                            metadata: task.metadata,
                        });
                    }
                    else {
                        chunks = chunkText(task.content, {
                            chunkSize: this.config.chunkSize,
                            chunkOverlap: this.config.chunkOverlap,
                            sourcePath: task.sourcePath,
                            sessionKey: task.sessionKey,
                            metadata: task.metadata,
                        });
                    }
                    break;
                case 'conversation':
                    chunks = chunkText(task.content, {
                        chunkSize: this.config.chunkSize,
                        chunkOverlap: this.config.chunkOverlap,
                        sourcePath: task.sourcePath,
                        sessionKey: task.sessionKey,
                        metadata: { ...task.metadata, type: 'conversation' },
                    });
                    break;
                default:
                    this.api.logger.warn(`[FaissVectorizer] 未知任務類型: ${task.type}`);
                    return;
            }
            if (chunks.length === 0) {
                return;
            }
            // 批量向量化
            const texts = chunks.map(c => c.text);
            const embeddings = await embedTexts(texts);
            // 批量添加到索引
            const items = chunks.map((chunk, i) => ({
                chunk,
                embedding: embeddings[i],
            }));
            const ids = await this.store.addBatch(items);
            this.api.logger.debug(`[FaissVectorizer] 已索引 ${ids.length} 個切塊，來源: ${task.sourcePath}`);
        }
        catch (error) {
            this.api.logger.error(`[FaissVectorizer] 處理任務失敗: ${task.id}` + ": " + String(error));
        }
    }
    /**
     * 搜索相似向量
     */
    async search(query, topK) {
        if (!this.store) {
            throw new Error('向量存儲未初始化');
        }
        const startTime = Date.now();
        const k = topK || this.config.ragTopK;
        // 向量化查詢
        const queryEmbedding = await embedText(query);
        // 搜索
        const results = await this.store.search(queryEmbedding, k);
        const elapsed = Date.now() - startTime;
        this.api.logger.debug(`[FaissVectorizer] 搜索完成，耗時 ${elapsed}ms，返回 ${results.length} 個結果`);
        return results;
    }
    /**
     * 索引工作空間中的文件
     */
    async indexWorkspace() {
        const memoryDir = join(this.workspaceDir, 'memory');
        let indexed = 0;
        let errors = 0;
        if (!existsSync(memoryDir)) {
            return { indexed, errors };
        }
        const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            try {
                const filePath = join(memoryDir, file);
                const stat = statSync(filePath);
                // 跳過太大的文件（> 1MB）
                if (stat.size > 1024 * 1024) {
                    this.api.logger.warn(`[FaissVectorizer] 跳過過大的文件: ${file}`);
                    continue;
                }
                const content = readFileSync(filePath, 'utf-8');
                this.addTask({
                    type: 'file',
                    content,
                    sourcePath: filePath,
                    priority: 1,
                });
                indexed++;
            }
            catch (error) {
                this.api.logger.error(`[FaissVectorizer] 索引文件失敗: ${file}` + ": " + String(error));
                errors++;
            }
        }
        return { indexed, errors };
    }
    /**
     * 獲取索引統計信息
     */
    getStats() {
        return {
            initialized: this.initialized,
            documentCount: this.store?.getDocumentCount() || 0,
            queueLength: this.taskQueue.length,
            isProcessing: this.isProcessing,
        };
    }
    /**
     * 關閉服務
     */
    async shutdown() {
        this.stopProcessing();
        if (this.store) {
            await this.store.flush();
        }
        await disposeEmbeddings();
        this.api.logger.info('[FaissVectorizer] 服務已關閉');
    }
}
// 全局服務實例
let globalService = null;
/**
 * 創建 FAISS 向量化服務
 */
export function createFaissVectorizerService(api, config, workspaceDir) {
    const service = new FaissVectorizerService(api, config, workspaceDir);
    globalService = service;
    return {
        id: 'faiss-vectorizer',
        async start() {
            await service.initialize();
            service.startProcessing();
            // 啟動時索引工作空間
            const { indexed, errors } = await service.indexWorkspace();
            api.logger.info(`[FaissVectorizer] 工作空間索引完成: ${indexed} 個文件，${errors} 個錯誤`);
        },
        async stop() {
            await service.shutdown();
            globalService = null;
        },
    };
}
/**
 * 獲取全局服務實例
 */
export function getFaissVectorizerService() {
    return globalService;
}
