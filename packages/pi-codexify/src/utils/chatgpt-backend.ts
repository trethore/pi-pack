const CHATGPT_BACKEND_API_ROOT = 'https://chatgpt.com/backend-api/';

export function buildChatGptBackendApiUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), CHATGPT_BACKEND_API_ROOT).toString();
}
