-- Apply only after the exact frontend/Edge release and mail tests pass.
-- Existing Auth sessions retain their current access. Every new session must
-- prove the email. No application profile or user password is rewritten.
BEGIN;
LOCK TABLE iydu_private.browser_verification_config IN EXCLUSIVE MODE;
INSERT INTO iydu_private.browser_verified_sessions(user_id,session_id)
 SELECT s.user_id,s.id FROM auth.sessions s
 WHERE s.not_after IS NULL OR s.not_after>statement_timestamp()
 ON CONFLICT(user_id,session_id) DO NOTHING;
UPDATE iydu_private.browser_verification_config SET enabled=true WHERE singleton;
COMMIT;
