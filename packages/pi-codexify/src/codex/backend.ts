const BACKEND_ROOT = 'https://chatgpt.com/backend-api/';

export function backendUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), BACKEND_ROOT).toString();
}

export async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function formatResponseStatus(response: Pick<Response, 'status' | 'statusText'>): string {
  return `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
}
