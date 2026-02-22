/**
 * RAG Inject Hook Handler
 *
 * 監聽 before_prompt_build 事件
 * 每次 Agent 回覆前自動執行 RAG 檢索並注入相關記憶
 */
interface BeforePromptBuildEvent {
    prompt: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
}
interface BeforePromptBuildContext {
    agentId: string;
    sessionKey: string;
    sessionId: string;
    workspaceDir: string;
}
type BeforePromptBuildHandler = (event: BeforePromptBuildEvent, ctx: BeforePromptBuildContext) => Promise<{
    prependContext?: string;
    systemPrompt?: string;
} | void>;
declare const handler: BeforePromptBuildHandler;
export default handler;
