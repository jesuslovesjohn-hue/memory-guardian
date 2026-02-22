/**
 * 組件 4: 無感 RAG 注入器 (Pre-prompt RAG Hook)
 *
 * 功能：
 * - 攔截用戶輸入，將其轉換為向量
 * - 對本地 FAISS 執行檢索（k=5）
 * - 將檢索結果組裝成 <historical_memory> XML
 * - 靜默拼接到 System Prompt 尾部
 * - 確保檢索時間 < 300ms
 *
 * 與 OpenClaw 的整合：
 * - 通過 agent:bootstrap Hook 注入到 bootstrapFiles
 * - 提供 Gateway RPC 接口供手動查詢
 */
import { getFaissVectorizerService } from './faiss-vectorizer.js';
// 檢索超時警告閾值
const SEARCH_TIMEOUT_WARNING_MS = 300;
/**
 * 執行 RAG 檢索
 *
 * @param query 用戶查詢
 * @param config 配置
 * @returns RAG 注入結果
 */
export async function performRagRetrieval(query, config) {
    const service = getFaissVectorizerService();
    if (!service) {
        console.log('[RagInjector] FAISS 服務未初始化');
        return null;
    }
    const stats = service.getStats();
    if (!stats.initialized || stats.documentCount === 0) {
        console.log('[RagInjector] 索引為空，跳過 RAG');
        return null;
    }
    const startTime = Date.now();
    try {
        // 執行檢索
        const results = await service.search(query, config.ragTopK);
        const searchTimeMs = Date.now() - startTime;
        // 性能警告
        if (searchTimeMs > SEARCH_TIMEOUT_WARNING_MS) {
            console.warn(`[RagInjector] 檢索耗時 ${searchTimeMs}ms，超過 ${SEARCH_TIMEOUT_WARNING_MS}ms 閾值`);
        }
        if (results.length === 0) {
            return {
                query,
                results: [],
                historicalMemoryXml: '',
                searchTimeMs,
            };
        }
        // 格式化為 XML
        const historicalMemoryXml = formatHistoricalMemoryXml(results, query);
        return {
            query,
            results,
            historicalMemoryXml,
            searchTimeMs,
        };
    }
    catch (error) {
        console.error('[RagInjector] RAG 檢索失敗:', error);
        return null;
    }
}
/**
 * 格式化 RAG 結果為 XML
 */
function formatHistoricalMemoryXml(results, query) {
    if (results.length === 0) {
        return '';
    }
    const parts = [
        '<historical_memory>',
        `  <query>${escapeXml(query)}</query>`,
        `  <retrieved_at>${new Date().toISOString()}</retrieved_at>`,
        '  <memories>',
    ];
    for (const result of results) {
        parts.push('    <memory>');
        parts.push(`      <relevance_score>${(1 - result.distance).toFixed(4)}</relevance_score>`);
        parts.push(`      <source>${escapeXml(result.chunk.sourcePath)}</source>`);
        if (result.chunk.sessionKey) {
            parts.push(`      <session>${escapeXml(result.chunk.sessionKey)}</session>`);
        }
        parts.push(`      <timestamp>${new Date(result.chunk.timestamp).toISOString()}</timestamp>`);
        parts.push(`      <content>${escapeXml(result.chunk.text)}</content>`);
        parts.push('    </memory>');
    }
    parts.push('  </memories>');
    parts.push('</historical_memory>');
    return parts.join('\n');
}
/**
 * XML 特殊字符轉義
 */
function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/**
 * 獲取 RAG 注入的 Markdown 內容
 * 用於注入到 bootstrapFiles
 */
export async function getRagInjectionContent(query, config) {
    const injection = await performRagRetrieval(query, config);
    if (!injection || injection.results.length === 0) {
        return null;
    }
    // 返回 XML 格式的歷史記憶
    return `
<!-- Memory Guardian: Historical Memory Injection -->
<!-- Query: ${escapeXml(query)} -->
<!-- Retrieved: ${injection.results.length} relevant memories in ${injection.searchTimeMs}ms -->

${injection.historicalMemoryXml}
`;
}
/**
 * 創建 RAG 注入的 bootstrap 文件對象
 * 供 agent:bootstrap Hook 使用
 */
export async function createRagBootstrapFile(query, config) {
    const content = await getRagInjectionContent(query, config);
    if (!content) {
        return null;
    }
    return {
        path: 'MEMORY_GUARDIAN_RAG.md',
        content,
        priority: -100, // 低優先級，放在 System Prompt 後面
    };
}
/**
 * 判斷查詢是否需要 RAG
 * 排除簡單的問候語和命令
 */
export function shouldPerformRag(query) {
    const trimmed = query.trim().toLowerCase();
    // 排除命令
    if (trimmed.startsWith('/')) {
        return false;
    }
    // 排除太短的查詢
    if (trimmed.length < 5) {
        return false;
    }
    // 排除簡單問候
    const greetings = [
        'hi', 'hello', 'hey', '你好', '嗨', '哈囉',
        'good morning', 'good evening', 'good night',
        '早安', '午安', '晚安', '早', '晚',
    ];
    if (greetings.includes(trimmed)) {
        return false;
    }
    // 排除只有 emoji 的消息
    const emojiOnly = /^[\p{Emoji}\s]+$/u.test(trimmed);
    if (emojiOnly) {
        return false;
    }
    return true;
}
/**
 * 計算查詢的檢索關鍵詞
 * 用於優化檢索效果
 */
export function extractQueryKeywords(query) {
    // 移除標點符號
    const cleaned = query.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');
    // 分詞
    const words = cleaned.split(/\s+/).filter(w => w.length > 1);
    // 移除停用詞
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'can', 'must',
        '的', '了', '是', '在', '有', '和', '與', '或', '但',
        '這', '那', '我', '你', '他', '她', '它', '們',
    ]);
    return words.filter(w => !stopWords.has(w.toLowerCase()));
}
