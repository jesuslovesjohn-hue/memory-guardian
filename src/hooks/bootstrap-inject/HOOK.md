---
name: bootstrap-inject
description: "在 Agent 啟動時注入 Critical Context 和 RAG 歷史記憶"
metadata:
  openclaw:
    emoji: "💉"
    events: ["agent:bootstrap"]
    homepage: "https://github.com/openclaw/memory-guardian"
---

# Bootstrap Inject Hook

此 Hook 是 Memory Guardian 插件的核心組件，負責在 Agent 啟動時將保護的上下文注入到 System Prompt。

## 功能

當 agent:bootstrap 事件觸發時：

1. 讀取緩存的 Critical Context（如果存在）
2. 將其格式化為 `<critical_context>` XML 塊
3. 讀取用戶最新輸入（如果可用）
4. 執行 RAG 檢索獲取相關歷史記憶
5. 將 `<historical_memory>` XML 注入到 bootstrapFiles

## 注入位置

```
System Prompt
    ↓
SOUL.md, USER.md, etc.
    ↓
<critical_context>...</critical_context>  ← Anti-Amnesia 注入
    ↓
<historical_memory>...</historical_memory>  ← RAG 注入
    ↓
Agent 開始處理用戶輸入
```

## 性能保證

- RAG 檢索目標：< 300ms
- 如果超時，會輸出警告但不阻塞

## 配置

```json
{
  "plugins": {
    "entries": {
      "memory-guardian": {
        "enabled": true,
        "config": {
          "ragTopK": 5
        }
      }
    }
  }
}
```

## 注意事項

- 此 Hook 會修改 `event.context.bootstrapFiles` 數組
- Critical Context 會在注入後清除緩存
- RAG 注入需要 FAISS 服務已初始化且索引不為空
