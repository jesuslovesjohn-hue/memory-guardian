---
name: session-protect
description: "保護 Session 上下文：在 /new 或 /reset 時提取關鍵信息並緩存"
metadata:
  openclaw:
    emoji: "🛡️"
    events: ["command:new", "command:reset"]
    homepage: "https://github.com/openclaw/memory-guardian"
---

# Session Protect Hook

此 Hook 是 Memory Guardian 插件的一部分，負責在 session 重置時保護關鍵上下文。

## 功能

當用戶執行 `/new` 或 `/reset` 命令時：

1. 讀取最新的 Daily Report（如果存在）
2. 從即將被清除的 transcript 中提取最近 30 條消息
3. 提取最近的 `<thinking>` 思考鏈內容
4. 將這些信息組合成 Critical Context
5. 保存到緩存文件供後續 bootstrap 使用

## 工作流程

```
User: /new
    ↓
session-protect Hook 觸發
    ↓
讀取 Daily Report + 提取消息 + 提取思考鏈
    ↓
保存 Critical Context 到 ~/.openclaw/workspace/.memory-guardian/
    ↓
Session 重置完成
    ↓
bootstrap-inject Hook 在下次對話時讀取並注入
```

## 配置

此 Hook 使用 Memory Guardian 插件的配置：

```json
{
  "plugins": {
    "entries": {
      "memory-guardian": {
        "enabled": true,
        "config": {
          "recentMessagesCount": 30
        }
      }
    }
  }
}
```

## 依賴

- Memory Guardian 插件必須啟用
- 需要 workspace.dir 配置
