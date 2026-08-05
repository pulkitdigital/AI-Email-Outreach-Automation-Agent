-- "Add category" quota/rate-limit fallback: when the AI provider that classifies a new
-- category's service_group + starter rules is quota-exhausted/rate-limited (see
-- isQuotaOrRateLimitError in Backend/src/providers/ai/errors.ts and classifyNewCategory's
-- CategoryClassificationQuotaError in categorizationService.ts), the category is no longer
-- blocked from being created. Instead it's created with service_group = NULL and a single
-- generic starter rule, flagged here for a human to fill in the real service group/rules once
-- the AI provider is available again.

ALTER TABLE categories ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE categories ADD COLUMN review_reason TEXT;
