// Server-only Storage retention worker. Never place this code or its credentials in the browser.
// The database lists only objects whose owner has an expired, confirmed closure.
// Storage deletion is deliberately delegated to the supported Storage REST API.
export const MAX_OBJECTS_PER_TICK = 50;

function serviceKey(env) {
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}');
    return typeof keys.default === 'string' ? keys.default : '';
  } catch { return ''; }
}

async function authenticated(req, secret, cryptoImpl) {
  if (!secret || secret.length < 32) return false;
  const presented = req.headers.get('x-iydu-retention-token') || '';
  const encoder = new TextEncoder();
  const [correct, given] = await Promise.all([
    cryptoImpl.subtle.digest('SHA-256', encoder.encode(secret)),
    cryptoImpl.subtle.digest('SHA-256', encoder.encode(presented))
  ]);
  const a = new Uint8Array(correct), b = new Uint8Array(given);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function validRow(row) {
  return row && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.user_id) &&
    typeof row.bucket_id === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(row.bucket_id) &&
    typeof row.object_name === 'string' &&
    row.object_name.length > 0 && row.object_name.length <= 1024;
}

export function createRetentionHandler({
  env,
  fetchImpl = fetch,
  cryptoImpl = crypto
}) {
  const reply = (payload, status) =>
    new Response(JSON.stringify(payload), {status, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store'
    }});
  return async function retentionHandler(req) {
    if (req.method !== 'POST') return reply({code: 'METHOD_NOT_ALLOWED'}, 405);

    const cronSecret = env('RETENTION_CRON_SECRET');
    if (!cronSecret || cronSecret.length < 32) return reply({code: 'NOT_CONFIGURED'}, 503);
    if (!await authenticated(req, cronSecret, cryptoImpl)) {
      return reply({code: 'UNAUTHORIZED'}, 401);
    }
    const base = env('SUPABASE_URL') || '';
    const key = serviceKey(env);
    if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(base) || !key) {
      return reply({code: 'NOT_CONFIGURED'}, 503);
    }
    const root = base.replace(/\/$/, '');
    const authHeaders = {
      apikey: key,
      ...(key.startsWith('eyJ') ? {Authorization: 'Bearer ' + key} : {}),
      'Content-Type': 'application/json'
    };
    let items;
    try {
      const result = await fetchImpl(root + '/rest/v1/rpc/iydu_due_storage_objects', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({p_limit: MAX_OBJECTS_PER_TICK}),
        signal: AbortSignal.timeout(10000)
      });
      if (!result.ok) throw new Error('RPC_FAILED');
      items = await result.json();
    } catch {
      return reply({code: 'LIST_UNAVAILABLE'}, 503);
    }
    if (!Array.isArray(items) || items.length > MAX_OBJECTS_PER_TICK ||
        items.some(item => !validRow(item))) {
      return reply({code: 'INVALID_BATCH'}, 503);
    }
    if (items.length === 0) return reply({ok: true, attempted: 0, buckets: 0}, 200);

    const buckets = new Map();
    for (const item of items) {
      if (!buckets.has(item.bucket_id)) buckets.set(item.bucket_id, new Set());
      buckets.get(item.bucket_id).add(item.object_name);
    }

    let attempted = 0;
    for (const [bucket, objectNames] of buckets) {
      try {
        // The API removes the underlying file and its metadata together.
        // SQL deletion from storage.objects would leave orphaned bytes.
        const result = await fetchImpl(root + '/storage/v1/object/' + encodeURIComponent(bucket), {
          method: 'DELETE',
          headers: authHeaders,
          body: JSON.stringify({prefixes: [...objectNames]}),
          signal: AbortSignal.timeout(20000)
        });
        if (!result.ok) throw new Error('STORAGE_DELETE_FAILED');
        attempted += objectNames.size;
      } catch {
        // No Auth deletion here: pg_cron calls purge_due_accounts separately and
        // refuses to delete users while ANY owned Storage object remains.
        return reply({code: 'STORAGE_UNAVAILABLE', attempted}, 503);
      }
    }
    // Attempts are not proofs of deletion; the DB cron checks actual remaining rows.
    return reply({ok: true, attempted, buckets: buckets.size}, 200);
  };
}
