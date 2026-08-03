-- Phase 2: Categorization Engine. See Docs/ARCHITECTURE.md § 2 and Docs/DATABASE_SCHEMA.md.
--
-- Adds:
--   * categorization_rules — DB-stored, editable-without-deploy rule definitions. The rule
--     engine (Backend/src/modules/categorization/ruleEngine.ts) is a pure function over these
--     rows; there is no hardcoded if/else category logic in application code.
--   * lead_secondary_categories — a lead can match more than one category; leads.category_id
--     remains the PRIMARY category (used for deck/email personalization), this table holds the
--     rest.
--   * Seed data: the 4 known service categories, plus a starter keyword rule set proposed by
--     the agent and confirmed with the user as an initial, refinable pass — tune weights/
--     keywords directly via SQL as real lead data comes in, no code deploy required.

COMMENT ON COLUMN leads.categorization_confidence IS
  '0.000-1.000. Meaningful for both methods as of Phase 2: rule-based confidence is the summed weight of matched categorization_rules, AI confidence is self-reported by the model.';

-- ============================================================================
-- categorization_rules
-- ============================================================================
CREATE TABLE categorization_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    match_field   TEXT NOT NULL CHECK (match_field IN ('industry', 'company_name', 'website', 'raw_data', 'any')),
    match_type    TEXT NOT NULL DEFAULT 'keyword' CHECK (match_type IN ('keyword', 'regex')),
    -- keyword: case-insensitive substring/word match. regex: POSIX regex via Postgres/JS, case-insensitive.
    pattern       TEXT NOT NULL,
    -- Contribution to the category's score when this rule matches. Summed across all matched
    -- rules for a category to produce that category's confidence (capped at 1.0 in code).
    weight        NUMERIC(4, 3) NOT NULL DEFAULT 0.350,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categorization_rules_category_id ON categorization_rules (category_id);
CREATE INDEX idx_categorization_rules_active ON categorization_rules (is_active);
CREATE TRIGGER trg_categorization_rules_updated_at BEFORE UPDATE ON categorization_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- lead_secondary_categories
-- ============================================================================
CREATE TABLE lead_secondary_categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id       UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    category_id   UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    confidence    NUMERIC(4, 3) NOT NULL,
    method        TEXT NOT NULL CHECK (method IN ('rule_based', 'ai')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id, category_id)
);

CREATE INDEX idx_lead_secondary_categories_lead_id ON lead_secondary_categories (lead_id);

-- ============================================================================
-- Seed: the 4 known service categories
-- ============================================================================
INSERT INTO categories (name, slug, service_group) VALUES
    ('Digital Marketing', 'digital-marketing', 'digital_marketing'),
    ('Web & App Solutions', 'web-app-solutions', 'web_app_solutions'),
    ('Creative Services', 'creative-services', 'creative_services'),
    ('Marketplace & Commerce', 'marketplace-commerce', 'marketplace_commerce')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- Seed: starter rule set (agent-proposed, user-confirmed as a first pass to refine)
--
-- Weighting: an 'industry'-field hit is a stronger, more deliberate signal than a keyword
-- merely appearing somewhere in free-text raw_data, so it's weighted higher (0.6, enough to
-- cross the primary-match threshold on its own). 'any'-field hits are weighted lower (0.35 —
-- crosses the secondary threshold alone, needs two to cross primary), since they're a weaker,
-- broader signal. See ruleEngine.ts for how these weights combine into a confidence score.
-- ============================================================================

-- Digital Marketing: local/consumer-facing service businesses that benefit most from visibility,
-- social presence, and local search (SMM, GMB, SEO/GEO, branding, influencer marketing).
INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'industry', 'keyword', v.pattern, 0.600
FROM categories c, (VALUES
    ('restaurant'), ('cafe'), ('salon'), ('spa'), ('gym'), ('fitness'),
    ('clinic'), ('dental'), ('hospital'), ('healthcare'),
    ('real estate'), ('education'), ('coaching'), ('hotel'), ('resort'), ('travel')
) AS v(pattern)
WHERE c.slug = 'digital-marketing';

INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'any', 'keyword', v.pattern, 0.350
FROM categories c, (VALUES
    ('social media'), ('branding'), ('marketing agency'), ('tuition'), ('institute'),
    ('tourism'), ('event management'), ('wedding planner'), ('interior design'),
    ('law firm'), ('lawyer'), ('advocate'), ('consultancy'), ('consulting'),
    ('ngo'), ('non-profit'), ('automobile'), ('car dealership'), ('showroom'), ('yoga')
) AS v(pattern)
WHERE c.slug = 'digital-marketing';

-- Web & App Solutions: businesses that lack digital infrastructure or need custom software /
-- booking / ordering systems (Website, E-commerce Website, App Development, Shopify, WhatsApp Automation).
INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'industry', 'keyword', v.pattern, 0.600
FROM categories c, (VALUES
    ('software'), ('saas'), ('startup'), ('it company'),
    ('manufacturer'), ('manufacturing'), ('wholesaler'), ('distributor'), ('logistics')
) AS v(pattern)
WHERE c.slug = 'web-app-solutions';

INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'any', 'keyword', v.pattern, 0.350
FROM categories c, (VALUES
    ('website'), ('booking system'), ('online store'), ('e-commerce platform'),
    ('tech company'), ('courier'), ('delivery service'), ('b2b'), ('industrial'), ('factory'),
    ('shopify'), ('whatsapp automation'), ('mobile app'), ('app development')
) AS v(pattern)
WHERE c.slug = 'web-app-solutions';

-- Creative Services: brand/visual-identity focused businesses, or new brands needing identity
-- (Logo Design, Design Creatives, Video Editing, Photoshoot/Videoshoot).
INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'industry', 'keyword', v.pattern, 0.600
FROM categories c, (VALUES
    ('photography'), ('videography'), ('production house'), ('design studio'), ('film')
) AS v(pattern)
WHERE c.slug = 'creative-services';

INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'any', 'keyword', v.pattern, 0.350
FROM categories c, (VALUES
    ('photographer'), ('videographer'), ('video production'), ('media house'),
    ('content creator'), ('influencer'), ('artist'), ('graphic designer'), ('logo design'),
    ('branding agency'), ('fashion designer'), ('boutique'), ('jewelry designer'),
    ('bakery'), ('event photography'), ('wedding photography'), ('brand launch')
) AS v(pattern)
WHERE c.slug = 'creative-services';

-- Marketplace & Commerce: product/physical-goods businesses (Amazon/Flipkart/Meesho/Myntra setup).
INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'industry', 'keyword', v.pattern, 0.600
FROM categories c, (VALUES
    ('clothing brand'), ('apparel'), ('fashion brand'), ('fmcg'), ('cosmetics'), ('d2c')
) AS v(pattern)
WHERE c.slug = 'marketplace-commerce';

INSERT INTO categorization_rules (category_id, match_field, match_type, pattern, weight)
SELECT c.id, 'any', 'keyword', v.pattern, 0.350
FROM categories c, (VALUES
    ('amazon seller'), ('flipkart'), ('meesho'), ('myntra'), ('clothing'), ('footwear'),
    ('jewelry'), ('handicrafts'), ('handmade'), ('beauty products'), ('kitchenware'),
    ('home decor'), ('gadgets'), ('toys'), ('consumer goods'), ('kirana'),
    ('grocery brand'), ('packaged food'), ('snacks brand'), ('online seller')
) AS v(pattern)
WHERE c.slug = 'marketplace-commerce';
