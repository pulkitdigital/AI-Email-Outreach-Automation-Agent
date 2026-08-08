import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIProvider,
  CategorizeLeadInput,
  CategorizeLeadResult,
  ClassifyCategoryInput,
  ClassifyCategoryResult,
  ExtractLeadFieldsFromTextInput,
  ExtractLeadFieldsFromTextResult,
  GenerateCategoryContentInput,
  GenerateCategoryContentResult,
  GenerateDeckContentInput,
  GenerateDeckContentResult,
  GenerateEmailCopyInput,
  GenerateEmailCopyResult,
} from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { parseCategorizationResponse } from './categorizationResponse.js';
import { parseCategoryClassificationResponse } from './categoryClassificationResponse.js';
import { parseCategoryContentResponse } from './categoryContentResponse.js';
import { parseEmailCopyResponse } from './emailCopyResponse.js';
import { AIConfigError } from './errors.js';
import { buildCategorizationPrompt } from './prompts/categorization.js';
import { buildCategoryClassificationPrompt } from './prompts/categoryClassification.js';
import { buildCategoryContentPrompt } from './prompts/categoryContent.js';
import { buildEmailCopyPrompt } from './prompts/emailCopy.js';

/**
 * Gemini implementation of AIProvider. categorizeLead (Phase 2), generateEmailCopy (Phase 4), and
 * generateCategoryContent (Phase 3 category_content migration) are fully implemented;
 * generateDeckContent and extractLeadFieldsFromText remain stubbed for later phases.
 */
export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!env.GEMINI_API_KEY) {
      throw new AIConfigError('GEMINI_API_KEY is not set — required when AI_PROVIDER=gemini');
    }
    if (!this.client) {
      this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }
    return this.client;
  }

  getProviderName(): 'gemini' {
    return 'gemini';
  }

  async categorizeLead(input: CategorizeLeadInput): Promise<CategorizeLeadResult> {
    const model = this.getClient().getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const result = await model.generateContent(buildCategorizationPrompt(input));
    const text = result.response.text();

    return parseCategorizationResponse(text, input.candidateCategories);
  }

  async generateEmailCopy(input: GenerateEmailCopyInput): Promise<GenerateEmailCopyResult> {
    const model = this.getClient().getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
    });

    const result = await model.generateContent(buildEmailCopyPrompt(input));
    return parseEmailCopyResponse(result.response.text());
  }

  async classifyCategory(input: ClassifyCategoryInput): Promise<ClassifyCategoryResult> {
    const model = this.getClient().getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const result = await model.generateContent(buildCategoryClassificationPrompt(input.name));
    return parseCategoryClassificationResponse(result.response.text());
  }

  async generateDeckContent(_input: GenerateDeckContentInput): Promise<GenerateDeckContentResult> {
    throw new Error('GeminiProvider.generateDeckContent not implemented yet — later phase');
  }

  async generateCategoryContent(
    input: GenerateCategoryContentInput,
  ): Promise<GenerateCategoryContentResult> {
    const model = this.getClient().getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    });

    const result = await model.generateContent(buildCategoryContentPrompt(input));
    return parseCategoryContentResponse(result.response.text());
  }

  /**
   * Phase 1's pdfParser calls this for unstructured PDF text and must catch the throw — it
   * means "no confident AI extraction available", not an ingestion failure. See
   * Docs/ARCHITECTURE.md § 1 Ingestion Layer and shared/src/types/ai.ts.
   */
  async extractLeadFieldsFromText(
    _input: ExtractLeadFieldsFromTextInput,
  ): Promise<ExtractLeadFieldsFromTextResult> {
    throw new Error('GeminiProvider.extractLeadFieldsFromText not implemented yet — later phase');
  }
}
