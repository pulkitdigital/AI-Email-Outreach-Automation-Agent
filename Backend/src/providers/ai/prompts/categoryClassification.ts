/** Shared prompt text for both Gemini and OpenAI — keeps the two providers behaviorally consistent. */
export function buildCategoryClassificationPrompt(name: string): string {
  return `You are helping set up a new lead category for BeBeyond Digital Solutions, a digital agency whose services fall into exactly 4 fixed service groups:

- digital_marketing: SMM, performance marketing, branding, GMB, SEO/GEO, influencer marketing — typically local/consumer-facing service businesses (restaurants, clinics, real estate, education, hospitality, salons, gyms, etc).
- web_app_solutions: websites, e-commerce platforms, app development, Shopify, WhatsApp automation — typically software/tech/manufacturing/logistics/wholesale businesses that lack digital infrastructure.
- creative_services: logo design, video/photo production, branding creatives — typically photography/videography/design-studio/content-creation businesses.
- marketplace_commerce: Amazon/Flipkart/Meesho/Myntra seller setup — typically physical-goods/apparel/FMCG/D2C brands selling products online.

A new category is being created with the name: "${name}"

Classify it into exactly one of the 4 service groups above (use the exact snake_case value), and propose 3 to 5 starter keyword rules the categorization engine can use to automatically match future leads into this category. Mirror how the existing categories were seeded: an "industry"-field match is a strong, deliberate signal (weight around 0.6), an "any"-field match is a broader, weaker signal (weight around 0.35).

Respond with ONLY a JSON object in exactly this shape, no other text, no markdown fences:
{
  "serviceGroup": "<one of: digital_marketing, web_app_solutions, creative_services, marketplace_commerce>",
  "rules": [
    { "matchField": "<'industry' or 'any'>", "pattern": "<a single lowercase keyword or short phrase>", "weight": <number between 0.35 and 0.6> }
  ]
}`;
}
