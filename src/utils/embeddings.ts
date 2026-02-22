/**
 * Embeddings 模組
 * 使用 @xenova/transformers 本地運行 all-MiniLM-L6-v2 模型
 * 產生 384 維特徵向量
 */

import { pipeline, type Pipeline } from '@xenova/transformers';

// Singleton pipeline instance
let embeddingPipeline: Pipeline | null = null;
let initPromise: Promise<Pipeline> | null = null;

/**
 * 初始化 embedding pipeline
 * 使用 singleton 模式避免重複加載模型
 */
export async function initEmbeddings(modelName: string = 'Xenova/all-MiniLM-L6-v2'): Promise<Pipeline> {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    console.log(`[MemoryGuardian] 正在加載 embedding 模型: ${modelName}`);
    const startTime = Date.now();
    
    try {
      // 使用 feature-extraction pipeline
      // quantized: true 使用量化模型，減少內存佔用
      embeddingPipeline = await pipeline('feature-extraction', modelName, {
        quantized: true,
      });
      
      const loadTime = Date.now() - startTime;
      console.log(`[MemoryGuardian] Embedding 模型加載完成，耗時 ${loadTime}ms`);
      
      return embeddingPipeline;
    } catch (error) {
      initPromise = null;
      throw new Error(`加載 embedding 模型失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  return initPromise;
}

/**
 * 將單個文本轉換為 384 維向量
 * @param text 輸入文本
 * @returns Float32Array 384 維向量
 */
export async function embedText(text: string): Promise<Float32Array> {
  if (!embeddingPipeline) {
    await initEmbeddings();
  }

  if (!embeddingPipeline) {
    throw new Error('Embedding pipeline 未初始化');
  }

  // Transformers.js 返回的是 Tensor 對象
  const output = await embeddingPipeline(text, {
    pooling: 'mean',      // 使用 mean pooling
    normalize: true,       // L2 正規化，方便餘弦相似度計算
  });

  // 提取數據為 Float32Array
  // output.data 是扁平化的 Float32Array
  const embedding = new Float32Array(output.data as ArrayLike<number>);
  
  // 確保維度正確（all-MiniLM-L6-v2 是 384 維）
  if (embedding.length !== 384) {
    console.warn(`[MemoryGuardian] 向量維度異常: ${embedding.length}，期望 384`);
  }

  return embedding;
}

/**
 * 批量將文本轉換為向量
 * @param texts 文本數組
 * @returns Float32Array 數組
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) {
    return [];
  }

  if (!embeddingPipeline) {
    await initEmbeddings();
  }

  if (!embeddingPipeline) {
    throw new Error('Embedding pipeline 未初始化');
  }

  const embeddings: Float32Array[] = [];
  
  // 批量處理以提高效率
  // 但單個請求避免過大，分批處理
  const batchSize = 32;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    // 對批次中的每個文本進行 embedding
    const batchPromises = batch.map(async (text) => {
      const output = await embeddingPipeline!(text, {
        pooling: 'mean',
        normalize: true,
      });
      return new Float32Array(output.data as ArrayLike<number>);
    });

    const batchResults = await Promise.all(batchPromises);
    embeddings.push(...batchResults);
  }

  return embeddings;
}

/**
 * 計算兩個向量的餘弦相似度
 * 由於向量已經 L2 正規化，直接計算點積即可
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`向量維度不匹配: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }

  return dotProduct;
}

/**
 * 釋放 embedding pipeline 資源
 */
export async function disposeEmbeddings(): Promise<void> {
  if (embeddingPipeline) {
    // @xenova/transformers 的 pipeline 可能有 dispose 方法
    if (typeof (embeddingPipeline as any).dispose === 'function') {
      await (embeddingPipeline as any).dispose();
    }
    embeddingPipeline = null;
    initPromise = null;
    console.log('[MemoryGuardian] Embedding pipeline 已釋放');
  }
}

/**
 * 獲取 embedding 維度
 */
export function getEmbeddingDimension(): number {
  return 384;  // all-MiniLM-L6-v2 固定 384 維
}
