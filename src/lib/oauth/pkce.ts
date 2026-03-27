/**
 * OAuth PKCE Helper for kintai-v3
 * Authorization Code Flow with PKCE support
 */

/**
 * ランダムな code_verifier を生成（43-128文字）
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * code_verifier から code_challenge を生成（SHA256）
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * ランダムな state を生成（CSRF対策）
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Base64 URL エンコード
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * OAuth 認可URLを構築
 */
export function buildAuthorizationUrl(config: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_challenge: config.codeChallenge,
    code_challenge_method: 'S256',
    state: config.state,
    scope: config.scope || 'openid profile',
  });

  return `${config.authorizationEndpoint}?${params.toString()}`;
}
