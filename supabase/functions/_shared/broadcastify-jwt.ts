interface BroadcastifyJWTPayload {
  iss: string;
  iat: number;
  exp: number;
  sub?: number;
  utk?: string;
}

interface AuthenticatedUser {
  username: string;
  uid: string;
  token: string;
  exp: number;
}

let cachedAuth: AuthenticatedUser | null = null;

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateSignature(
  header: string,
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${header}.${payload}`);
  const secretKey = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureString = String.fromCharCode(...signatureArray);
  return base64UrlEncode(signatureString);
}

export async function generateBroadcastifyJWT(
  uid?: string,
  token?: string
): Promise<string> {
  const apiKeyId = Deno.env.get('BROADCASTIFY_API_KEY_ID');
  const apiKeySecret = Deno.env.get('BROADCASTIFY_API_KEY_SECRET');
  const appId = Deno.env.get('BROADCASTIFY_APP_ID');

  if (!apiKeyId || !apiKeySecret || !appId) {
    throw new Error(
      'Broadcastify API credentials not configured. Need API_KEY_ID, API_KEY_SECRET, and APP_ID'
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: apiKeyId,
  };

  const payload: BroadcastifyJWTPayload = {
    iss: appId,
    iat: now,
    exp: now + 3600,
  };

  if (uid && token) {
    payload.sub = parseInt(uid);
    payload.utk = token;
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  const signature = await generateSignature(
    encodedHeader,
    encodedPayload,
    apiKeySecret
  );

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function authenticateUser(): Promise<AuthenticatedUser> {
  if (cachedAuth && cachedAuth.exp > Date.now() / 1000) {
    return cachedAuth;
  }

  const username = Deno.env.get('BROADCASTIFY_USERNAME');
  const password = Deno.env.get('BROADCASTIFY_PASSWORD');

  if (!username || !password) {
    throw new Error(
      'Broadcastify credentials not configured. Need BROADCASTIFY_USERNAME and BROADCASTIFY_PASSWORD'
    );
  }

  const authJWT = await generateBroadcastifyJWT();

  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch('https://api.bcfy.io/common/v1/auth', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authJWT}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      'Broadcastify authentication failed:',
      response.status,
      errorText
    );
    if (response.status === 401) {
      throw new Error(
        'Broadcastify API key rejected (401). The key is inactive — accept the Terms and fund the prepaid balance at https://bcfy.io/dev/overview'
      );
    }
    throw new Error(
      `Authentication failed: ${response.status} ${response.statusText}`
    );
  }

  const data: AuthenticatedUser = await response.json();
  cachedAuth = data;

  return data;
}
