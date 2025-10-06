import jwt from 'jsonwebtoken';

export function testJWTWithSampleData() {
  console.log('\n=== TESTING WITH BROADCASTIFY SAMPLE DATA ===');

  const sampleApiKey = 'FbSINwWz3z7Ht11BEGSkGbBE7ibh0AZb';
  const sampleApiKeyId = '87d631b';
  const sampleAppId = 'd123adc123';

  const payload = {
    iss: sampleAppId,
    iat: 1699693200,
    exp: 1699693260,
  };

  console.log('Sample API Key:', sampleApiKey);
  console.log('Sample API Key ID:', sampleApiKeyId);
  console.log('Sample App ID:', sampleAppId);
  console.log('Sample Payload:', JSON.stringify(payload, null, 2));

  const sampleJWT = jwt.sign(payload, sampleApiKey, {
    algorithm: 'HS256',
    keyid: sampleApiKeyId,
  });

  console.log('Generated Sample JWT:', sampleJWT);
  console.log('\nExpected Sample JWT from docs:');
  console.log('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ijg3ZDYzMWIifQ.eyJpc3MiOiJkMTIzYWRjMTIzIiwiaWF0IjoxNjk5NjkzMjAwLCJleHAiOjE2OTk2OTMyNjB9.jOPMn4dsoIrMh4faUBjZ_rMu6iIhOBmDNVeId8DWn6A');

  console.log('\nDo they match?', sampleJWT === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ijg3ZDYzMWIifQ.eyJpc3MiOiJkMTIzYWRjMTIzIiwiaWF0IjoxNjk5NjkzMjAwLCJleHAiOjE2OTk2OTMyNjB9.jOPMn4dsoIrMh4faUBjZ_rMu6iIhOBmDNVeId8DWn6A');

  const decoded = jwt.decode(sampleJWT, { complete: true });
  console.log('\nDecoded Header:', JSON.stringify(decoded?.header, null, 2));
  console.log('Decoded Payload:', JSON.stringify(decoded?.payload, null, 2));

  console.log('=== TEST END ===\n');

  return sampleJWT;
}

export function verifyJWTSignature(token: string, secret: string): boolean {
  try {
    jwt.verify(token, secret, { algorithms: ['HS256'] });
    console.log('✓ JWT signature is VALID');
    return true;
  } catch (error) {
    console.log('✗ JWT signature is INVALID');
    console.error('Verification error:', error);
    return false;
  }
}
