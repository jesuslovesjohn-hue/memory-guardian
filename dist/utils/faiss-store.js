/**
 * FAISS 向量存儲模組
 * 使用 faiss-node 進行本地向量索引和檢索
 */
import { IndexFlatIP } from 'faiss-node';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getEmbeddingDimension } from './embeddings.js';
// FAISS 索引路徑
const DEFAULT_INDEX_PATH = join(process.env.HOME || '~', '.openclaw', 'memory', 'vector.index');
const DEFAULT_META_PATH = join(process.env.HOME || '~', '.openclaw', 'memory', 'vector.meta.json');
// 向量維度 (all-MiniLM-L6-v2 = 384)
const DIMENSION = getEmbeddingDimension();
/**
 * FAISS 向量存儲類
 * 管理向量索引和元數據
 */
export class FaissVectorStore {
    index = null;
    documents = new Map();
    nextId = 0;
    indexPath;
    metaPath;
    isDirty = false;
    constructor(options = {}) {
        this.indexPath = options.indexPath || DEFAULT_INDEX_PATH;
        this.metaPath = options.metaPath || DEFAULT_META_PATH;
    }
    /**
     * 初始化向量存儲
     * 如果存在已保存的索引，則加載；否則創建新索引
     */
    async initialize() {
        // 確保目錄存在
        const dir = dirname(this.indexPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // 嘗試加載現有索引
        if (existsSync(this.indexPath) && existsSync(this.metaPath)) {
            await this.load();
            console.log(`[MemoryGuardian] FAISS 索引已加載，共 ${this.documents.size} 個文檔`);
        }
        else {
            // 創建新的 IndexFlatIP（內積索引，適合正規化後的向量）
            this.index = new IndexFlatIP(DIMENSION);
            console.log('[MemoryGuardian] 已創建新的 FAISS 索引');
        }
    }
    /**
     * 添加單個向量文檔
     */
    async add(chunk, embedding) {
        if (!this.index) {
            throw new Error('FAISS 索引未初始化');
        }
        if (embedding.length !== DIMENSION) {
            throw new Error(`向量維度錯誤: ${embedding.length}，期望 ${DIMENSION}`);
        }
        const id = this.nextId++;
        // 添加到 FAISS 索引
        this.index.add(Array.from(embedding));
        // 保存元數據
        this.documents.set(id, chunk);
        this.isDirty = true;
        return id;
    }
    /**
     * 批量添加向量文檔
     */
    async addBatch(items) {
        if (!this.index) {
            throw new Error('FAISS 索引未初始化');
        }
        const ids = [];
        for (const { chunk, embedding } of items) {
            if (embedding.length !== DIMENSION) {
                console.warn(`[MemoryGuardian] 跳過維度錯誤的向量: ${embedding.length}`);
                continue;
            }
            const id = this.nextId++;
            this.index.add(Array.from(embedding));
            this.documents.set(id, chunk);
            ids.push(id);
        }
        this.isDirty = true;
        return ids;
    }
    /**
     * 搜索最相似的向量
     * @param queryEmbedding 查詢向量
     * @param k 返回的結果數量
     * @returns 搜索結果數組
     */
    async search(queryEmbedding, k = 5) {
        if (!this.index) {
            throw new Error('FAISS 索引未初始化');
        }
        if (this.documents.size === 0) {
            return [];
        }
        // 確保 k 不超過文檔數量
        const actualK = Math.min(k, this.documents.size);
        // 執行搜索
        // IndexFlatIP 返回內積分數（對於正規化向量等同於餘弦相似度）
        const results = this.index.search(Array.from(queryEmbedding), actualK);
        const searchResults = [];
        for (let i = 0; i < results.labels.length; i++) {
            const id = results.labels[i];
            const distance = 1 - results.distances[i]; // 轉換為距離（內積越大距離越小）
            // FAISS 可能返回 -1 表示無效結果
            if (id < 0)
                continue;
            const chunk = this.documents.get(id);
            if (!chunk) {
                console.warn(`[MemoryGuardian] 找不到文檔 ID: ${id}`);
                continue;
            }
            searchResults.push({ id, distance, chunk });
        }
        return searchResults;
    }
    /**
     * 獲取文檔數量
     */
    getDocumentCount() {
        return this.documents.size;
    }
    /**
     * 保存索引和元數據到磁盤
     */
    async save() {
        if (!this.index) {
            throw new Error('FAISS 索引未初始化');
        }
        // 確保目錄存在
        const dir = dirname(this.indexPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        // 保存 FAISS 索引
        this.index.write(this.indexPath);
        // 保存元數據
        const metadata = {
            nextId: this.nextId,
            documents: Array.from(this.documents.entries()),
        };
        writeFileSync(this.metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
        this.isDirty = false;
        console.log(`[MemoryGuardian] 索引已保存: ${this.documents.size} 個文檔`);
    }
    /**
     * 從磁盤加載索引和元數據
     */
    async load() {
        if (!existsSync(this.indexPath) || !existsSync(this.metaPath)) {
            throw new Error('索引文件不存在');
        }
        // 加載 FAISS 索引
        this.index = IndexFlatIP.read(this.indexPath);
        // 加載元數據
        const metaContent = readFileSync(this.metaPath, 'utf-8');
        const metadata = JSON.parse(metaContent);
        this.nextId = metadata.nextId;
        this.documents = new Map(metadata.documents);
        this.isDirty = false;
    }
    /**
     * 如果有未保存的更改，自動保存
     */
    async flush() {
        if (this.isDirty) {
            await this.save();
        }
    }
    /**
     * 清空索引
     */
    async clear() {
        this.index = new IndexFlatIP(DIMENSION);
        this.documents.clear();
        this.nextId = 0;
        this.isDirty = true;
        console.log('[MemoryGuardian] FAISS 索引已清空');
    }
    /**
     * 獲取所有文檔 ID
     */
    getAllDocumentIds() {
        return Array.from(this.documents.keys());
    }
    /**
     * 根據 ID 獲取文檔
     */
    getDocument(id) {
        return this.documents.get(id);
    }
    /**
     * 刪除文檔（標記刪除，實際不從 FAISS 移除）
     * 注意：FAISS IndexFlatIP 不支持刪除，需要重建索引
     */
    async deleteDocument(id) {
        if (this.documents.has(id)) {
            this.documents.delete(id);
            this.isDirty = true;
            return true;
        }
        return false;
    }
}
// 全局單例
let globalStore = null;
/**
 * 獲取全局 FAISS 存儲實例
 */
export async function getVectorStore(options) {
    if (!globalStore) {
        globalStore = new FaissVectorStore(options);
        await globalStore.initialize();
    }
    return globalStore;
}
/**
 * 重置全局存儲（用於測試）
 */
export function resetVectorStore() {
    globalStore = null;
}
