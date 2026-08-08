-- Phase 1 of "DB-driven category content": adds category_content, a table that will eventually
-- replace the two hardcoded TS arrays that currently drive per-category deck personalization —
-- serviceCatalog.ts's SERVICE_CATEGORIES ('our_services') and staticContent.ts's
-- HOW_CAN_WE_HELP_BY_CATEGORY ('how_can_we_help'). This migration only adds the table and seeds
-- it with the EXACT existing content for the 4 current categories — no application code reads
-- from this table yet (serviceCatalog.ts/staticContent.ts/OurServicesSlide.tsx/
-- HowCanWeHelpSlide.tsx are all untouched). is_ai_generated exists now so a future phase can add
-- AI-generated rows for new categories without a further schema change.

CREATE TABLE category_content (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id       UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    content_type      TEXT NOT NULL CHECK (content_type IN ('our_services', 'how_can_we_help')),
    display_name      TEXT NOT NULL,
    accent_color      TEXT,
    -- 'our_services' rows: array of service name strings (serviceCatalog.ts's `services`).
    services          JSONB,
    -- 'how_can_we_help' rows: array of benefit label strings — must match staticContent.ts's
    -- HOW_CAN_WE_HELP labels exactly (HowCanWeHelpSlide.tsx keys its icon lookup by label text).
    benefits          JSONB,
    is_ai_generated   BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, content_type)
);

CREATE INDEX idx_category_content_category_id ON category_content (category_id);

-- ============================================================================
-- Seed: 'our_services' rows — exact copy of serviceCatalog.ts's SERVICE_CATEGORIES
-- (accent_color values are BRAND_COLORS.teal = '219EBC' / BRAND_COLORS.orange = 'FB8500',
-- Backend/src/modules/deckGeneration/brand.ts).
-- ============================================================================
INSERT INTO category_content (category_id, content_type, display_name, accent_color, services, is_ai_generated)
SELECT id, 'our_services', 'Digital Marketing', '219EBC',
       '["SMM", "Performance Marketing", "Branding", "GMB", "SEO / GEO", "Influencer Marketing"]'::jsonb,
       false
FROM categories WHERE slug = 'digital-marketing';

INSERT INTO category_content (category_id, content_type, display_name, accent_color, services, is_ai_generated)
SELECT id, 'our_services', 'Web & App Solutions', 'FB8500',
       '["Website", "E-commerce Website", "App Development", "Shopify Website", "WhatsApp Automation"]'::jsonb,
       false
FROM categories WHERE slug = 'web-app-solutions';

INSERT INTO category_content (category_id, content_type, display_name, accent_color, services, is_ai_generated)
SELECT id, 'our_services', 'Creative Services', '219EBC',
       '["Logo Design", "Design Creatives", "Video Editing", "Photoshoot & Videoshoot", "Ad Shoot Listing"]'::jsonb,
       false
FROM categories WHERE slug = 'creative-services';

INSERT INTO category_content (category_id, content_type, display_name, accent_color, services, is_ai_generated)
SELECT id, 'our_services', 'Marketplace & Commerce', 'FB8500',
       '["E-commerce Marketplace Setup", "Amazon, Flipkart, Meesho, Myntra"]'::jsonb,
       false
FROM categories WHERE slug = 'marketplace-commerce';

-- ============================================================================
-- Seed: 'how_can_we_help' rows — exact copy of staticContent.ts's HOW_CAN_WE_HELP_BY_CATEGORY.
-- display_name reuses the category's own display name (not present as a separate value in the
-- original mapping, which only ever keyed off the category slug) purely so this row satisfies
-- the same NOT NULL display_name column the 'our_services' rows use; the benefits array itself
-- is what actually drives HowCanWeHelpSlide.tsx and is copied verbatim. accent_color is left NULL
-- here on purpose — the original slide alternates card color by grid position (i % 2), not by
-- category, so there is no per-category accent color in the source data to carry over.
-- ============================================================================
INSERT INTO category_content (category_id, content_type, display_name, benefits, is_ai_generated)
SELECT id, 'how_can_we_help', 'Digital Marketing',
       '["Increased Visibility", "Optimized Marketing Spend", "Excitement for Growth"]'::jsonb,
       false
FROM categories WHERE slug = 'digital-marketing';

INSERT INTO category_content (category_id, content_type, display_name, benefits, is_ai_generated)
SELECT id, 'how_can_we_help', 'Web & App Solutions',
       '["Streamlined Processes", "Confidence and Trust", "Competitive Advantage"]'::jsonb,
       false
FROM categories WHERE slug = 'web-app-solutions';

INSERT INTO category_content (category_id, content_type, display_name, benefits, is_ai_generated)
SELECT id, 'how_can_we_help', 'Creative Services',
       '["Sense of Achievement", "Confidence and Trust", "Increased Visibility"]'::jsonb,
       false
FROM categories WHERE slug = 'creative-services';

INSERT INTO category_content (category_id, content_type, display_name, benefits, is_ai_generated)
SELECT id, 'how_can_we_help', 'Marketplace & Commerce',
       '["Peace of Mind", "Excitement for Growth", "Competitive Advantage"]'::jsonb,
       false
FROM categories WHERE slug = 'marketplace-commerce';
