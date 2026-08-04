-- Adds PDF rendering columns to pitch_decks, mirroring file_key/file_url. See
-- Backend/src/modules/deckGeneration/pptxToPdf.ts and deckGenerationService.ts —
-- deck generation now converts the built .pptx to .pdf via LibreOffice headless immediately
-- after the .pptx itself is built/uploaded, storing both artifacts. The pptx stays the
-- source-of-truth (dashboard download, future re-conversion); the pdf is what outreach emails
-- attach (Brevo/Gmail render far more reliably as PDF, and it needs no viewer app). A deck
-- isn't considered generation_status = 'ready' until BOTH exist — conversion failure fails the
-- whole deck generation job, same as a pptx-build failure already did.

ALTER TABLE pitch_decks ADD COLUMN pdf_file_key TEXT;
ALTER TABLE pitch_decks ADD COLUMN pdf_file_url TEXT;
