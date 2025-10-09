import jwt from 'jsonwebtoken';

interface AuthenticatedUser {
  username: string;
  uid: string;
  token: string;
  exp: number;
}

let cachedAuth: AuthenticatedUser | null = null;

export function generateBroadcastifyJWT(uid?: string, token?: string): string {
  const apiKeyId = process.env.BROADCASTIFY_API_KEY_ID;
  const apiKeySecret = process.env.BROADCASTIFY_API_KEY_SECRET;
  const appId = process.env.BROADCASTIFY_APP_ID;

  if (!apiKeyId || !apiKeySecret || !appId) {
    throw new Error('Broadcastify API credentials not configured. Need API_KEY_ID, API_KEY_SECRET, and APP_ID');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: {
    iss: string;
    iat: number;
    exp: number;
    sub?: number;
    utk?: string;
  } = {
    iss: appId,
    iat: now,
    exp: now + 3600,
  };

  if (uid && token) {
    payload.sub = parseInt(uid);
    payload.utk = token;
  }

  return jwt.sign(payload, apiKeySecret, {
    algorithm: 'HS256',
    keyid: apiKeyId,
  });
}

export async function authenticateUser(): Promise<AuthenticatedUser> {
  if (cachedAuth && cachedAuth.exp > Date.now() / 1000) {
    return cachedAuth;
  }

  const username = 'motion42069';
  const password = 'ef7a0n5a5ml';

  const authJWT = generateBroadcastifyJWT();

  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch('https://api.bcfy.io/common/v1/auth', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authJWT}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Broadcastify authentication failed:', response.status, errorText);
    throw new Error(`Authentication failed: ${response.statusText}`);
  }

  const data: AuthenticatedUser = await response.json();
  cachedAuth = data;

  return data;
}
