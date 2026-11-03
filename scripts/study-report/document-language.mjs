import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'src/standalone/studyReport/documentLanguage.ts');

/** W10's fixed English copy uses the product registry's English document identity. */
export async function documentLanguageSource() {
  const metadata = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "import {getLocaleDefinitionByLanguage} from './src/services/general/localeRegistry.ts'; const entry=getLocaleDefinitionByLanguage('en'); if(!entry) throw new Error('English report locale is absent'); console.log(JSON.stringify({canonicalLocale:entry.canonicalLocale,direction:entry.direction}));",
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  );
  return prettier.format(
    '// Generated from the typed product locale registry by scripts/study-report/document-language.mjs.\n' +
      '// W10 report copy is English; host/browser locale never selects its document language.\n' +
      '// This serialized artifact is checked byte-for-byte against that registry before packaging.\n' +
      `export const REPORT_DOCUMENT_LANGUAGE: Readonly<{ canonicalLocale: string; direction: 'ltr' | 'rtl' }> = Object.freeze(JSON.parse(${JSON.stringify(JSON.stringify(metadata))}));\n`,
    { ...(await prettier.resolveConfig(output)), filepath: output },
  );
}

export async function checkDocumentLanguage(file = output) {
  if (fs.readFileSync(file, 'utf8') !== (await documentLanguageSource())) {
    throw new Error('Report document language is stale; run pnpm study-report:language:write');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) fs.writeFileSync(output, await documentLanguageSource());
  else await checkDocumentLanguage();
}
