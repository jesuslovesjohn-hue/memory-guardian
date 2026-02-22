---
name: rag-inject
description: "無感靜默 RAG 注入 - 每次回覆前自動檢索相關歷史記憶"
metadata:
  openclaw:
    emoji: "🧠"
    events: ["before_prompt_build"]
---

# RAG Inject Hook

每次 Agent 回覆前自動執行：

1. 將用戶輸入轉化為 384 維向量
2. 對本地 FAISS 執行檢索 (k=5)
3. 將檢索結果組裝成 `<historical_memory>...</historical_memory>`
4. 靜默拼接到 System Prompt 尾部

## 性能要求

- 整體檢索時間 < 300ms
- 使用本地 embedding 模型 (Xenova/all-MiniLM-L6-v2)
- 使用本地 FAISS 向量搜索

## 輸出格式

```xml
<historical_memory>
以下是與當前對話相關的歷史記憶片段：

[1] (來源: memory/2026-02-20.md, 相關度: 0.85)
記憶內容...

[2] (來源: MEMORY.md, 相關度: 0.72)
記憶內容...
</historical_memory>
```
