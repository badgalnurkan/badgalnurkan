# Improvin’ Your Day

Production entrypoint: index.html. Preserve Supabase server verification, RLS, user data and existing report calendar rules. The generated review-app.html is an isolated sample; never add its sample identity behavior to the real entrypoint.

For every user-visible release, give SITE_RELEASE a unique ID and add a dated Turkish/English entry to SITE_CHANGES in index.html. This sends “Site güncellenmiştir!” once per release. Keep release details in the notification inbox, without a separate Updates navigation page. Describe implemented changes only.

Run npm test and python scripts/build-preview.py after edits. Check responsive layouts and changed interactions in the supported preview. Keep VALIDATION.md accurate about checks and verification limits. Preserve the ongoing task's publication authorization.
