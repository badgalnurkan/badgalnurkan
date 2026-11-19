import { createRetentionHandler } from './handler.mjs';

// Configure RETENTION_CRON_SECRET separately in Edge Secrets and in Supabase Vault.
// Deploy with verify_jwt=false ONLY because the handler verifies that dedicated secret.
// Never expose a browser route, user JWT access, or service key in frontend assets.
Deno.serve(createRetentionHandler({env: name => Deno.env.get(name) || ''}));
