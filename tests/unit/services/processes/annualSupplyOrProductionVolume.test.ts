import {
  ANNUAL_SUPPLY_VOLUME_DEFAULT_SUFFIX,
  ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH,
  buildAnnualSupplyVolumeMultiLang,
  buildAnnualSupplyVolumeUnitLookupRows,
  annualSupplyVolumeSuffix,
  formatAnnualSupplyVolumeText,
  getAnnualSupplyVolumeDisplayNumericText,
  getAnnualSupplyVolumeLanguages,
  normalizeAnnualSupplyVolumeMultiLang,
  normalizeAnnualSupplyVolumeText,
  parseAnnualSupplyVolumeText,
  sanitizeAnnualSupplyVolumeNumericInput,
} from '@/services/processes/annualSupplyOrProductionVolume';

describe('annualSupplyOrProductionVolume helpers', () => {
  it('parses full numeric text into editable numeric and suffix parts', () => {
    expect(parseAnnualSupplyVolumeText('123 kg/year')).toEqual({
      numericText: '123',
      suffixText: 'kg/year',
    });
    expect(parseAnnualSupplyVolumeText('-1.2E+3 kg Steel')).toEqual({
      numericText: '-1.2E+3',
      suffixText: 'kg Steel',
    });
  });

  it('parses empty and non-numeric legacy text without dropping the editable prefix', () => {
    expect(parseAnnualSupplyVolumeText('')).toEqual({
      numericText: '',
      suffixText: '',
    });
    expect(parseAnnualSupplyVolumeText('-')).toEqual({
      numericText: '',
      suffixText: '',
    });
    expect(parseAnnualSupplyVolumeText('legacy suffix text')).toEqual({
      numericText: 'legacy',
      suffixText: 'suffix text',
    });
  });

  it('formats numeric input with a derived suffix and keeps partial numeric edits visible', () => {
    expect(formatAnnualSupplyVolumeText('123', 'kg/year')).toBe('123 kg/year');
    expect(formatAnnualSupplyVolumeText('-', 'kg/year')).toBe('- kg/year');
    expect(formatAnnualSupplyVolumeText('', 'kg/year')).toBe('');
    expect(formatAnnualSupplyVolumeText('abc123', 'kg/year')).toBe('123 kg/year');
    expect(formatAnnualSupplyVolumeText('123', '')).toBe(
      `123 ${ANNUAL_SUPPLY_VOLUME_DEFAULT_SUFFIX}`,
    );
    expect(formatAnnualSupplyVolumeText('123', '', { useDefaultSuffix: false })).toBe('123');
    expect(formatAnnualSupplyVolumeText(123, 'kg/year')).toBe('');
  });

  it('keeps annual supply text at the TIDAS limit unchanged and truncates longer text', () => {
    const suffixAtLimit = 'x'.repeat(ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH - 2);
    const textAtLimit = `1 ${suffixAtLimit}`;
    const truncatedText = formatAnnualSupplyVolumeText('1', `${suffixAtLimit}tail`);

    expect(formatAnnualSupplyVolumeText('1', suffixAtLimit)).toBe(textAtLimit);
    expect(truncatedText).toHaveLength(ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH);
    expect(truncatedText).toBe(`${textAtLimit.slice(0, -3)}...`);
  });

  it('applies the annual supply limit independently and consistently to each language', () => {
    const values = buildAnnualSupplyVolumeMultiLang(
      '1',
      (lang) => (lang === 'zh' ? '中'.repeat(600) : 'e'.repeat(600)),
      ['en', 'zh'],
    );

    expect(values).toHaveLength(2);
    expect(values.map((item) => item['#text'].length)).toEqual([
      ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH,
      ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH,
    ]);
    expect(values.every((item) => item['#text'].endsWith('...'))).toBe(true);
  });

  it('leaves a language within the limit unchanged when another language is truncated', () => {
    expect(
      buildAnnualSupplyVolumeMultiLang(
        '1',
        (lang) => (lang === 'zh' ? '短文本' : 'e'.repeat(600)),
        ['en', 'zh'],
      ),
    ).toEqual([
      {
        '@xml:lang': 'en',
        '#text': `${`1 ${'e'.repeat(600)}`.slice(0, 497)}...`,
      },
      { '@xml:lang': 'zh', '#text': '1 短文本' },
    ]);
  });

  it('does not split a Unicode surrogate pair at the annual supply truncation boundary', () => {
    const suffix = `${'中'.repeat(494)}😀tail`;
    const truncatedText = formatAnnualSupplyVolumeText('1', suffix);

    expect(truncatedText).toBe(`1 ${'中'.repeat(494)}...`);
    expect(truncatedText.length).toBeLessThanOrEqual(ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH);
  });

  it('sanitizes editable numeric input while keeping real-number partial states', () => {
    expect(sanitizeAnnualSupplyVolumeNumericInput('abc')).toBe('');
    expect(sanitizeAnnualSupplyVolumeNumericInput('abc123')).toBe('123');
    expect(sanitizeAnnualSupplyVolumeNumericInput('12abc')).toBe('12');
    expect(sanitizeAnnualSupplyVolumeNumericInput('1.2.3')).toBe('1.23');
    expect(sanitizeAnnualSupplyVolumeNumericInput('--1.2E++3')).toBe('-1.2E+3');
    expect(sanitizeAnnualSupplyVolumeNumericInput('.')).toBe('.');
    expect(sanitizeAnnualSupplyVolumeNumericInput('1E-')).toBe('1E-');
    expect(sanitizeAnnualSupplyVolumeNumericInput(123)).toBe('');
  });

  it('normalizes localized values with a suffix per language', () => {
    const normalized = normalizeAnnualSupplyVolumeMultiLang(
      [
        { '@xml:lang': 'en', '#text': '100 old suffix' },
        { '@xml:lang': 'zh', '#text': '200 旧后缀' },
      ],
      (item) => (item['@xml:lang'] === 'zh' ? '千克/年' : 'kg/year'),
    );

    expect(normalized).toEqual([
      { '@xml:lang': 'en', '#text': '100 kg/year' },
      { '@xml:lang': 'zh', '#text': '200 千克/年' },
    ]);
  });

  it('builds multilingual values from one numeric input and reads the displayed numeric value', () => {
    expect(
      buildAnnualSupplyVolumeMultiLang(
        'abc123',
        (lang) => (lang === 'zh' ? '千克 钢材' : 'kg Steel'),
        ['en', 'zh', 'en', ''],
      ),
    ).toEqual([
      { '@xml:lang': 'en', '#text': '123 kg Steel' },
      { '@xml:lang': 'zh', '#text': '123 千克 钢材' },
    ]);
    expect(buildAnnualSupplyVolumeMultiLang('', 'kg Steel')).toEqual([]);
    expect(buildAnnualSupplyVolumeMultiLang('500', 'kg Steel')).toEqual([
      { '@xml:lang': 'en', '#text': '500 kg Steel' },
    ]);
    expect(buildAnnualSupplyVolumeMultiLang('500', '')).toEqual([
      { '@xml:lang': 'en', '#text': '500' },
    ]);
    expect(
      getAnnualSupplyVolumeDisplayNumericText(
        [
          { '@xml:lang': 'en', '#text': '100 kg Steel' },
          { '@xml:lang': 'zh', '#text': '200 千克 钢材' },
        ],
        'zh',
      ),
    ).toBe('200');
    expect(
      getAnnualSupplyVolumeDisplayNumericText(
        [
          { '@xml:lang': 'en', '#text': '100 kg Steel' },
          { '@xml:lang': 'zh', '#text': '200 千克 钢材' },
        ],
        'de',
      ),
    ).toBe('100');
    expect(
      getAnnualSupplyVolumeDisplayNumericText([null, { '#text': '600 kg Steel' }] as never, 'de'),
    ).toBe('');
    expect(getAnnualSupplyVolumeDisplayNumericText([], 'en')).toBe('');
    expect(getAnnualSupplyVolumeDisplayNumericText({ '#text': '300 kg Steel' }, 'en')).toBe('300');
    expect(getAnnualSupplyVolumeDisplayNumericText('400 kg Steel', 'en')).toBe('400');
  });

  it('derives generated languages from required, existing, and current content only', () => {
    expect(getAnnualSupplyVolumeLanguages(undefined, 'de-DE')).toEqual(['en', 'de']);
    expect(
      getAnnualSupplyVolumeLanguages(
        [
          { '@xml:lang': 'zh', '#text': '100 千克' },
          { '@xml:lang': 'ja', '#text': '100 kg' },
        ],
        'fr-FR',
      ),
    ).toEqual(['en', 'zh', 'ja', 'fr']);
  });

  it('preserves the stored annual unit when lookup provides no annual unit', () => {
    expect(normalizeAnnualSupplyVolumeText('100 kg/year', 'Steel')).toBe('100 kg/year');
    expect(normalizeAnnualSupplyVolumeText('100 old suffix', 'Steel')).toBe('100 Steel');
    expect(normalizeAnnualSupplyVolumeText('100 old suffix', '', { useDefaultSuffix: false })).toBe(
      '100',
    );
  });

  it('normalizes object values with a shared suffix and leaves malformed values unchanged', () => {
    expect(
      normalizeAnnualSupplyVolumeMultiLang({ '@xml:lang': 'en', '#text': '50 old' }, 'kg'),
    ).toEqual({
      '@xml:lang': 'en',
      '#text': '50 kg',
    });
    expect(normalizeAnnualSupplyVolumeMultiLang(null, 'kg')).toBeNull();
    expect(normalizeAnnualSupplyVolumeMultiLang('100 old', 'kg')).toBe('100 old');
  });

  it.each([
    ['40900 t/year', 'kg/year', '40900000 kg/year'],
    ['40900 吨/年', 'kg/年', '40900000 kg/年'],
    ['40900000 kg/year', 'kg/year', '40900000 kg/year'],
    ['1e-9 kg/year', 't/year', '1e-12 t/year'],
    ['2 吨/年', 't/year', '2 t/year'],
    ['2 千克/年', 'kg/year', '2 kg/year'],
    ['3.6 electricity', 'MJ/年', '3.6 MJ/年'],
    ['19 m3/year', 'kg/year', '19 m3/year'],
    ['40900 t/year', '', '40900 t/year'],
  ])('serializes %s to a scientifically equivalent value with %s', (input, target, expected) => {
    expect(normalizeAnnualSupplyVolumeText(input, target, { useDefaultSuffix: false })).toBe(
      expected,
    );
  });

  it('derives a localized annual period from an exact unit and a supported language', () => {
    expect(annualSupplyVolumeSuffix('kg', 'de-DE')).toBe('kg/Jahr');
    expect(annualSupplyVolumeSuffix('kg', 'fr-FR')).toBe('kg/an');
    expect(annualSupplyVolumeSuffix('kg', 'unknown')).toBe('');
    expect(annualSupplyVolumeSuffix(undefined, 'en')).toBe('');
  });

  it('builds exact unit lookup rows', () => {
    const exchangeRows = [
      {
        '@dataSetInternalID': 'output-1',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-1',
          '@version': '01.00.000',
        },
      },
      {
        '@dataSetInternalID': 'output-2',
        referenceToFlowDataSet: [
          {
            '@refObjectId': 'flow-2',
            '@version': '01.00.000',
          },
        ],
      },
    ];

    expect(buildAnnualSupplyVolumeUnitLookupRows(exchangeRows)).toEqual([
      {
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '01.00.000',
      },
      {
        referenceToFlowDataSetId: 'flow-2',
        referenceToFlowDataSetVersion: '01.00.000',
      },
    ]);

    expect(buildAnnualSupplyVolumeUnitLookupRows(null as never)).toEqual([]);
  });
});
