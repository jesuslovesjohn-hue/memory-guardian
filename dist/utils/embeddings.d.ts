/**
 * Embeddings 模組
 * 使用 @xenova/transformers 本地運行 all-MiniLM-L6-v2 模型
 * 產生 384 維特徵向量
 */
/**
 * 初始化 embedding pipeline
 * 使用 singleton 模式避免重複加載模型
 */
export declare function initEmbeddings(modelName?: string): Promise<any>;
/**
 * 將單個文本轉換為 384 維向量
 * @param text 輸入文本
 * @returns Float32Array 384 維向量
 */
export declare function embedText(text: string): Promise<Float32Array>;
/**
 * 批量將文本轉換為向量
 * @param texts 文本數組
 * @returns Float32Array 數組
 */
export declare function embedTexts(texts: string[]): Promise<Float32Array[]>;
/**
 * 計算兩個向量的餘弦相似度
 * 由於向量已經 L2 正規化，直接計算點積即可
 */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * 釋放 embedding pipeline 資源
 */
export declare function disposeEmbeddings(): Promise<void>;
/**
 * 獲取 embedding 維度
 */
export declare function getEmbeddingDimension(): number;
