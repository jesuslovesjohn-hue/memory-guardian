/**
 * FAISS 向量存儲模組
 * 使用 faiss-node 進行本地向量索引和檢索
 */
import type { TextChunk, SearchResult } from '../types.js';
/**
 * FAISS 向量存儲類
 * 管理向量索引和元數據
 */
export declare class FaissVectorStore {
    private index;
    private documents;
    private nextId;
    private indexPath;
    private metaPath;
    private isDirty;
    constructor(options?: {
        indexPath?: string;
        metaPath?: string;
    });
    /**
     * 初始化向量存儲
     * 如果存在已保存的索引，則加載；否則創建新索引
     */
    initialize(): Promise<void>;
    /**
     * 添加單個向量文檔
     */
    add(chunk: TextChunk, embedding: Float32Array): Promise<number>;
    /**
     * 批量添加向量文檔
     */
    addBatch(items: Array<{
        chunk: TextChunk;
        embedding: Float32Array;
    }>): Promise<number[]>;
    /**
     * 搜索最相似的向量
     * @param queryEmbedding 查詢向量
     * @param k 返回的結果數量
     * @returns 搜索結果數組
     */
    search(queryEmbedding: Float32Array, k?: number): Promise<SearchResult[]>;
    /**
     * 獲取文檔數量
     */
    getDocumentCount(): number;
    /**
     * 保存索引和元數據到磁盤
     */
    save(): Promise<void>;
    /**
     * 從磁盤加載索引和元數據
     */
    load(): Promise<void>;
    /**
     * 如果有未保存的更改，自動保存
     */
    flush(): Promise<void>;
    /**
     * 清空索引
     */
    clear(): Promise<void>;
    /**
     * 獲取所有文檔 ID
     */
    getAllDocumentIds(): number[];
    /**
     * 根據 ID 獲取文檔
     */
    getDocument(id: number): TextChunk | undefined;
    /**
     * 刪除文檔（標記刪除，實際不從 FAISS 移除）
     * 注意：FAISS IndexFlatIP 不支持刪除，需要重建索引
     */
    deleteDocument(id: number): Promise<boolean>;
}
/**
 * 獲取全局 FAISS 存儲實例
 */
export declare function getVectorStore(options?: {
    indexPath?: string;
    metaPath?: string;
}): Promise<FaissVectorStore>;
/**
 * 重置全局存儲（用於測試）
 */
export declare function resetVectorStore(): void;
