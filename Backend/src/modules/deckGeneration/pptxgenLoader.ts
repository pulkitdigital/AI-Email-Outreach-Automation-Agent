import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * pptxgenjs's package.json has no "type" field and a flat (non-dot-wrapped) `exports` map,
 * which trips up TypeScript's NodeNext default-import resolution — `import PptxGenJS from
 * 'pptxgenjs'` type-checks as the whole module namespace instead of the class, so `new
 * PptxGenJS()` fails to compile ("not constructable"). Loading it via Node's own `require()`
 * sidesteps that ESM-interop resolution entirely at runtime, while `typeof
 * import('pptxgenjs').default` still gets the correct class type from the same .d.ts through a
 * plain type query. Every deck-generation module should import PptxGenJS/Slide/TableRow from
 * here, never directly from 'pptxgenjs'.
 */
const PptxGenJS = require('pptxgenjs') as typeof import('pptxgenjs').default;

export default PptxGenJS;
export type Slide = ReturnType<InstanceType<typeof PptxGenJS>['addSlide']>;
export type TableRow = import('pptxgenjs').default.TableRow;
