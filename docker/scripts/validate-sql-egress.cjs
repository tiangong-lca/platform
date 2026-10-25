#!/usr/bin/env node
'use strict';

// Bounded accidental-configuration check, not a SQL sandbox or a proof against
// dynamic SQL, indirect name resolution, or an operator's later configuration.
const fs = require('node:fs');
const officialHosts = new Set([
  'qgzvkongdjqiiamzbbts.supabase.co',
  'submidrhbtknjxfympna.supabase.co',
]);

function withoutComments(source) {
  let result = '';
  let quote = '';
  let blockDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (blockDepth) {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        i += 1;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        i += 1;
      }
      result += char === '\n' ? '\n' : ' ';
    } else if (quote) {
      result += char;
      if (char === '\\' && next) {
        result += next;
        i += 1;
      } else if (char === quote && next === quote) {
        result += next;
        i += 1;
      } else if (char === quote) quote = '';
    } else if (char === '-' && next === '-') {
      while (i < source.length && source[i] !== '\n') i += 1;
      result += '\n';
    } else if (char === '/' && next === '*') {
      blockDepth = 1;
      i += 1;
      result += ' ';
    } else {
      if (char === "'" || char === '"') quote = char;
      result += char;
    }
  }
  return result;
}

function unsafeEgressReason(source) {
  // pg_dump COMMENT ON statements are inert schema descriptions. Bare official
  // project identity/refusal constants likewise are not outbound URL defaults.
  const active = withoutComments(source)
    .replace(/\bCOMMENT\s+ON\b(?:[^';]|'(?:''|[^'])*')*;/giu, '')
    .replace(/\\u([0-9a-f]{4})/giu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/giu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//gu, '/')
    .replace(/'\s*\|\|\s*'/gu, '')
    .replace(/"([a-z_][a-z0-9_]*)"/giu, '$1');

  for (const match of active.matchAll(/https?:\/\/[^\s'"\\<>]+/giu)) {
    try {
      const host = new URL(match[0]).hostname.toLowerCase().replace(/\.$/u, '');
      if (officialHosts.has(host)) return 'official hosted HTTP target';
    } catch {
      // Other malformed/custom literals are outside this bounded target check.
    }
  }
  if (
    /\/functions\/v1\/webhook_(?:flow|process)_embedding(?=[?'"\s/]|$)/iu.test(active) ||
    /\binvoke_edge_(?:function|webhook)\s*\([^;]*?'webhook_(?:flow|process)_embedding'/iu.test(
      active,
    )
  )
    return 'retired non-FT webhook dispatch';
  return null;
}

if (require.main === module) {
  try {
    const reason = unsafeEgressReason(fs.readFileSync(process.argv[2], 'utf8'));
    if (reason) {
      console.error(
        `[desensitize] refusing SQL artifact: ${reason}; inspect the target before import.`,
      );
      process.exitCode = 2;
    }
  } catch {
    console.error('[desensitize] SQL target validation failed; output was not replaced.');
    process.exitCode = 2;
  }
}
module.exports = { unsafeEgressReason };
