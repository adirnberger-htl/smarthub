import https from 'https';

/**
 * Fetch JSON from an HTTPS URL with timeout support
 */
function fetchJsonSingle(url: string, timeout = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      family: 4,
      headers: {
        'User-Agent': 'SmartHub/1.0'
      }
    };
    const request = https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    request.on('error', reject);

    request.setTimeout(timeout, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Fetch JSON from an HTTPS URL with timeout support and retry logic.
 * 
 * Some APIs (e.g. OpenMeteo) return rate-limit errors as HTTP 200 with
 * `{"error": true, "reason": "..."}` in the body. The optional `shouldRetry`
 * callback lets callers inspect the parsed body and throw to trigger a retry.
 */
export async function fetchJson(
  url: string,
  timeout = 30000,
  retries = 3,
  delayMs = 1000,
  shouldRetry?: (data: any) => void
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const data = await fetchJsonSingle(url, timeout);
      
      // Let the caller check the response body for soft errors (HTTP 200 but logically failed)
      if (shouldRetry) {
        shouldRetry(data); // Throw inside to trigger retry
      }
      
      return data;
    } catch (error: any) {
      console.warn(`Fetch attempt ${attempt} failed for URL ${url}: ${error.message || error}`);
      if (attempt === retries) {
        throw error;
      }
      // Delay before retrying with exponential backoff if rate limited (429 or body-level rate limit)
      const isRateLimit = error.message?.includes('429') || error.message?.includes('rate') || error.message?.includes('concurrent');
      const actualDelay = isRateLimit ? delayMs * attempt * 3 : delayMs;
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }
}
