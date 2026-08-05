import OpenAI from 'openai';
import type {
  AIProvider,
  CategorizeLeadInput,
  CategorizeLeadResult,
  ClassifyCategoryInput,
  ClassifyCategoryResult,
  ExtractLeadFieldsFromTextInput,
  ExtractLeadFieldsFromTextResult,
  GenerateDeckContentInput,
  GenerateDeckContentResult,
  GenerateEmailCopyInput,
  GenerateEmailCopyResult,
} from '@bebeyond/shared';
import { env } from '../../config/env.js';
import { parseCategorizationResponse } from './categorizationResponse.js';
import { parseCategoryClassificationResponse } from './categoryClassificationResponse.js';
import { parseEmailCopyResponse } from './emailCopyResponse.js';
import { AIConfigError } from './errors.js';
import { buildCategorizationPrompt } from './prompts/categorization.js';
import { buildCategoryClassificationPrompt } from './prompts/categoryClassification.js';
import { buildEmailCopyPrompt } from './prompts/emailCopy.js';

/**
 * OpenAI implementation of AIProvider. categorizeLead (Phase 2) and generateEmailCopy
 * (Phase 4) are fully implemented; generateDeckContent and extractLeadFieldsFromText remain
 * stubbed for later phases.
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!env.OPENAI_API_KEY) {
      throw new AIConfigError('OPENAI_API_KEY is not set — required when AI_PROVIDER=openai');
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    return this.client;
  }

  getProviderName(): 'openai' {
    return 'openai';
  }

  async categorizeLead(input: CategorizeLeadInput): Promise<CategorizeLeadResult> {
    const completion = await this.getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'user', content: buildCategorizationPrompt(input) }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI categorization response had no content');
    }

    const candidateIds = new Set(input.candidateCategories.map((c) => c.id));
    return parseCategorizationResponse(text, candidateIds);
  }

  async generateEmailCopy(input: GenerateEmailCopyInput): Promise<GenerateEmailCopyResult> {
    const completion = await this.getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'user', content: buildEmailCopyPrompt(input) }],
      response_format: { type: 'json_object' },
      temperature: 0.6,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI email copy response had no content');
    }

    return parseEmailCopyResponse(text);
  }

  async classifyCategory(input: ClassifyCategoryInput): Promise<ClassifyCategoryResult> {
    const completion = await this.getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'user', content: buildCategoryClassificationPrompt(input.name) }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI category classification response had no content');
    }

    return parseCategoryClassificationResponse(text);
  }

  async generateDeckContent(_input: GenerateDeckContentInput): Promise<GenerateDeckContentResult> {
    throw new Error('OpenAIProvider.generateDeckContent not implemented yet — later phase');
  }

  /**
   * Phase 1's pdfParser calls this for unstructured PDF text and must catch the throw — it
   * means "no confident AI extraction available", not an ingestion failure. See
   * Docs/ARCHITECTURE.md § 1 Ingestion Layer and shared/src/types/ai.ts.
   */
  async extractLeadFieldsFromText(
    _input: ExtractLeadFieldsFromTextInput,
  ): Promise<ExtractLeadFieldsFromTextResult> {
    throw new Error('OpenAIProvider.extractLeadFieldsFromText not implemented yet — later phase');
  }
}
