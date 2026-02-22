/**
 * 本地 LLM 摘要模組
 * 使用 Ollama API 進行輕量級文本摘要
 */
const DEFAULT_ENDPOINT = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'qwen2.5:7b';
const TIMEOUT_MS = 60000; // 60 秒超時
/**
 * 調用本地 LLM 生成摘要
 */
async function callLocalLlm(prompt, config) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: config.model,
                prompt,
                stream: false,
                options: {
                    temperature: 0.3, // 低溫度以獲得更一致的摘要
                    top_p: 0.9,
                    num_predict: 1024, // 限制輸出長度
                },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`LLM API 錯誤: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return data.response || '';
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`LLM 請求超時 (${TIMEOUT_MS}ms)`);
        }
        throw error;
    }
}
/**
 * 生成對話日報
 * 從對話記錄中提取摘要、決策點和待辦事項
 */
export async function generateDailyReport(conversationLog, sessionKey, config = {}) {
    const llmConfig = {
        endpoint: config.endpoint || DEFAULT_ENDPOINT,
        model: config.model || DEFAULT_MODEL,
    };
    const prompt = `你是一個專業的對話分析助手。請分析以下對話記錄，並以 JSON 格式輸出：

<conversation>
${conversationLog}
</conversation>

請輸出以下 JSON 結構（嚴格遵循格式，不要添加任何額外說明）：
{
  "summary": "對話的核心內容摘要（100-200字）",
  "decisions": ["決策點1", "決策點2", ...],
  "actionItems": ["待辦事項1", "待辦事項2", ...]
}

規則：
1. summary 應概括對話的主題和關鍵信息
2. decisions 列出對話中做出的任何決定或結論
3. actionItems 列出需要後續跟進的任務
4. 如果某項為空，使用空數組 []
5. 只輸出 JSON，不要添加任何解釋`;
    try {
        const response = await callLocalLlm(prompt, llmConfig);
        // 嘗試解析 JSON
        const parsed = parseJsonResponse(response);
        return {
            generatedAt: new Date().toISOString(),
            sessionKey,
            summary: parsed.summary || '無法生成摘要',
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
            messageCount: (conversationLog.match(/\[User\]:|\[Assistant\]:/g) || []).length,
        };
    }
    catch (error) {
        console.error('[MemoryGuardian] 生成日報失敗:', error);
        // 返回降級結果
        return {
            generatedAt: new Date().toISOString(),
            sessionKey,
            summary: `摘要生成失敗: ${error instanceof Error ? error.message : String(error)}`,
            decisions: [],
            actionItems: [],
            messageCount: 0,
        };
    }
}
/**
 * 從 LLM 輸出中解析 JSON
 * 處理可能的格式問題（如 markdown code blocks）
 */
function parseJsonResponse(response) {
    // 移除可能的 markdown code block
    let cleaned = response
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    // 嘗試直接解析
    try {
        return JSON.parse(cleaned);
    }
    catch {
        // 嘗試提取 JSON 部分
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            }
            catch {
                // 解析失敗
            }
        }
    }
    // 返回空結果
    return {};
}
/**
 * 生成簡短摘要（用於 RAG 注入）
 */
export async function generateBriefSummary(text, config = {}) {
    const llmConfig = {
        endpoint: config.endpoint || DEFAULT_ENDPOINT,
        model: config.model || DEFAULT_MODEL,
    };
    const prompt = `請用一句話（不超過50字）概括以下內容的核心要點：

${text}

只輸出摘要，不要添加任何解釋。`;
    try {
        return await callLocalLlm(prompt, llmConfig);
    }
    catch (error) {
        console.error('[MemoryGuardian] 生成簡短摘要失敗:', error);
        return text.slice(0, 100) + '...';
    }
}
/**
 * 檢查本地 LLM 服務是否可用
 */
export async function checkLlmAvailability(config = {}) {
    const llmConfig = {
        endpoint: config.endpoint || DEFAULT_ENDPOINT,
        model: config.model || DEFAULT_MODEL,
    };
    // 將 /api/generate 替換為 /api/tags 來檢查服務狀態
    const healthEndpoint = llmConfig.endpoint.replace('/api/generate', '/api/tags');
    try {
        const response = await fetch(healthEndpoint, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        // 檢查模型是否存在
        if (data.models && Array.isArray(data.models)) {
            return data.models.some((m) => m.name === llmConfig.model || m.name.startsWith(llmConfig.model));
        }
        return true;
    }
    catch {
        return false;
    }
}
