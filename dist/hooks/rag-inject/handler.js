/**
 * RAG Inject Hook Handler
 *
 * 監聽 before_prompt_build 事件
 * 每次 Agent 回覆前自動執行 RAG 檢索並注入相關記憶
 */
import { performRagRetrieval } from '../../components/rag-injector.js';
import { DEFAULT_CONFIG } from '../../types.js';
// 檢索時間閾值 (ms)
const MAX_RETRIEVAL_TIME = 300;
// 最小查詢長度（太短的查詢不做 RAG）
const MIN_QUERY_LENGTH = 5;
// 緩存最近的查詢結果避免重複檢索
let lastQuery = null;
let lastResult = null;
let lastTimestamp = 0;
const CACHE_TTL = 5000; // 5 秒緩存
/**
 * 格式化 RAG 結果為 XML（含去重）
 */
function formatRagResultsXml(results) {
    if (results.length === 0) {
        return '';
    }
    // 去重：按 text 內容去重，保留相關度最高的
    const seen = new Set();
    const dedupedResults = results.filter(r => {
        const textKey = r.chunk.text.trim().substring(0, 200); // 用前200字符作為key
        if (seen.has(textKey)) {
            return false;
        }
        seen.add(textKey);
        return true;
    });
    if (dedupedResults.length === 0) {
        return '';
    }
    const items = dedupedResults.map((r, idx) => {
        const relevance = (1 - r.distance).toFixed(2);
        const source = r.chunk.sourcePath.replace(/^.*\/\.openclaw\/workspace\//, '');
        return `[${idx + 1}] (來源: ${source}, 相關度: ${relevance})
${r.chunk.text.trim()}`;
    }).join('\n\n');
    return `<historical_memory>
以下是與當前對話相關的歷史記憶片段：

${items}
</historical_memory>`;
}
/**
 * 從 event messages 提取用戶查詢
 */
function extractUserQuery(event) {
    // 從 messages 數組獲取最後一條用戶消息
    if (event.messages && Array.isArray(event.messages)) {
        for (let i = event.messages.length - 1; i >= 0; i--) {
            const msg = event.messages[i];
            if (msg?.role === 'user' && msg?.content) {
                return typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content);
            }
        }
    }
    return null;
}
// 只對這些 agents 啟用 RAG 注入（其他 agents 有自己嘅 workspace 同身份）
const ALLOWED_AGENTS = ['main', 'main-lite'];
const handler = async (event, ctx) => {
    const startTime = Date.now();
    try {
        // 檢查是否為允許的 agent
        if (!ALLOWED_AGENTS.includes(ctx.agentId)) {
            console.log(`[rag-inject] 跳過 agent "${ctx.agentId}"（只對 main/main-lite 啟用）`);
            return;
        }
        // 提取用戶查詢
        const userQuery = extractUserQuery(event);
        if (!userQuery || userQuery.length < MIN_QUERY_LENGTH) {
            return;
        }
        // 檢查緩存
        const now = Date.now();
        if (lastQuery === userQuery && lastResult && (now - lastTimestamp) < CACHE_TTL) {
            console.log(`[rag-inject] 使用緩存結果`);
            return { prependContext: lastResult };
        }
        console.log(`[rag-inject] 開始 RAG 檢索: "${userQuery.substring(0, 50)}..."`);
        // 執行 RAG 檢索
        const ragResult = await performRagRetrieval(userQuery, {
            ...DEFAULT_CONFIG,
            ragTopK: 5,
        });
        const elapsed = Date.now() - startTime;
        if (!ragResult || ragResult.results.length === 0) {
            console.log(`[rag-inject] 無相關結果，耗時 ${elapsed}ms`);
            return;
        }
        // 檢查是否超時
        if (elapsed > MAX_RETRIEVAL_TIME) {
            console.warn(`[rag-inject] 檢索超時: ${elapsed}ms > ${MAX_RETRIEVAL_TIME}ms`);
        }
        // 格式化結果
        const formattedContext = formatRagResultsXml(ragResult.results);
        // 更新緩存
        lastQuery = userQuery;
        lastResult = formattedContext;
        lastTimestamp = now;
        console.log(`[rag-inject] 檢索完成，返回 ${ragResult.results.length} 條結果，耗時 ${elapsed}ms`);
        return { prependContext: formattedContext };
    }
    catch (error) {
        console.error(`[rag-inject] 檢索失敗:`, error);
        return;
    }
};
export default handler;
