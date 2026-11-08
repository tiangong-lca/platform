import {
  getLifeCycleModelGraphProcessReferences,
  normalizeLifeCycleModelGraphForDisplay,
} from '@/services/lifeCycleModels/viewCompatibility';

const createExchange = ({
  direction,
  flowId,
  version = '01.01.000',
  quantitativeReference = false,
}: {
  direction: 'INPUT' | 'OUTPUT';
  flowId: string;
  version?: string;
  quantitativeReference?: boolean;
}) => ({
  exchangeDirection: direction,
  quantitativeReference,
  allocations: {
    allocation: {
      '@allocatedFraction': quantitativeReference ? '100%' : '0%',
    },
  },
  referenceToFlowDataSet: {
    '@refObjectId': flowId,
    '@version': version,
    'common:shortDescription': [
      {
        '@xml:lang': 'en',
        '#text': `${direction} ${flowId}`,
      },
    ],
  },
});

const createProcessDetail = ({
  id,
  version,
  exchanges,
}: {
  id: string;
  version: string;
  exchanges: unknown[];
}) => ({
  id,
  version,
  json: {
    processDataSet: {
      processInformation: {
        dataSetInformation: {
          name: {
            baseName: [{ '@xml:lang': 'en', '#text': id }],
          },
        },
      },
      exchanges: {
        exchange: exchanges,
      },
    },
  },
});

describe('getLifeCycleModelGraphProcessReferences', () => {
  it('returns unique complete process references and ignores sparse nodes', () => {
    expect(
      getLifeCycleModelGraphProcessReferences({
        xflow: {
          nodes: [
            { data: { id: 'process-a', version: '01.01.000' } },
            { data: { id: 'process-a', version: '01.01.000' } },
            { data: { id: 'process-b' } },
            { data: { version: '01.01.000' } },
            { data: { id: ' ', version: '01.01.000' } },
          ],
        },
      }),
    ).toEqual([{ id: 'process-a', version: '01.01.000' }]);
  });

  it('returns an empty list when graph data is absent', () => {
    expect(getLifeCycleModelGraphProcessReferences(undefined)).toEqual([]);
  });
});

describe('normalizeLifeCycleModelGraphForDisplay', () => {
  it('hydrates lightweight ports, reference semantics, and deterministic edge endpoints', () => {
    const jsonTg = {
      submodels: [{ id: 'process-b', version: '01.01.000', type: 'secondary' }],
      xflow: {
        nodes: [
          {
            id: '0',
            x: 0,
            y: 0,
            width: 350,
            height: 120,
            data: {
              id: 'process-a',
              version: '01.01.000',
              label: [{ '@xml:lang': 'en', '#text': 'Process A label' }],
            },
          },
          {
            id: '1',
            x: 420,
            y: 0,
            width: 350,
            height: 120,
            data: {
              id: 'process-b',
              version: '01.01.000',
            },
          },
        ],
        edges: [
          {
            id: '0:1:flow-linked',
            source: { cell: '0' },
            target: { cell: '1' },
            data: {
              connection: {
                outputExchange: {
                  '@flowUUID': 'flow-linked',
                  downstreamProcess: {
                    '@flowUUID': 'flow-linked',
                    '@id': '1',
                  },
                },
              },
            },
          },
        ],
      },
    };
    const original = JSON.parse(JSON.stringify(jsonTg));

    const result = normalizeLifeCycleModelGraphForDisplay({
      jsonTg,
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          quantitativeReference: {
            referenceToReferenceProcess: 1,
          },
        },
      },
      processDetails: [
        createProcessDetail({
          id: 'process-a',
          version: '01.01.000',
          exchanges: [
            createExchange({
              direction: 'OUTPUT',
              flowId: 'flow-linked',
              quantitativeReference: true,
            }),
            createExchange({
              direction: 'INPUT',
              flowId: 'flow-unrelated',
            }),
          ],
        }),
        createProcessDetail({
          id: 'process-b',
          version: '01.01.000',
          exchanges: [
            createExchange({
              direction: 'INPUT',
              flowId: 'flow-linked',
            }),
            createExchange({
              direction: 'OUTPUT',
              flowId: 'flow-reference',
              quantitativeReference: true,
            }),
          ],
        }),
      ],
    });

    expect(result.xflow?.nodes?.[0].data).toEqual(
      expect.objectContaining({
        index: '0',
        label: [{ '@xml:lang': 'en', '#text': 'Process A label' }],
        quantitativeReference: '0',
      }),
    );
    expect(result.xflow?.nodes?.[0].ports?.items).toEqual([
      expect.objectContaining({
        id: 'OUTPUT:flow-linked',
        group: 'groupOutput',
        data: expect.objectContaining({
          flowId: 'flow-linked',
          flowVersion: '01.01.000',
          quantitativeReference: true,
        }),
      }),
    ]);
    expect(result.xflow?.nodes?.[1].data).toEqual(
      expect.objectContaining({
        index: '1',
        label: {
          baseName: [{ '@xml:lang': 'en', '#text': 'process-b' }],
        },
        quantitativeReference: '1',
      }),
    );
    expect(result.xflow?.nodes?.[1].ports?.items?.map((item) => item.id)).toEqual([
      'INPUT:flow-linked',
      'OUTPUT:flow-reference',
    ]);
    expect(result.xflow?.nodes?.[1].ports?.items?.map((item) => item.args)).toEqual([
      { x: 0, y: 65 },
      { x: '100%', y: 85 },
    ]);
    expect(result.xflow?.edges?.[0]).toEqual(
      expect.objectContaining({
        source: {
          cell: '0',
          port: 'OUTPUT:flow-linked',
        },
        target: {
          cell: '1',
          port: 'INPUT:flow-linked',
        },
      }),
    );
    expect(jsonTg).toEqual(original);
    expect(result).not.toBe(jsonTg);
  });

  it('preserves complete graph ports and existing endpoint bindings', () => {
    const existingPort = {
      id: 'OUTPUT:flow-existing',
      group: 'groupOutput',
      data: {
        flowId: 'flow-existing',
      },
    };
    const jsonTg = {
      xflow: {
        nodes: [
          {
            id: 'node-a',
            size: { width: 350, height: 100 },
            data: {
              id: 'process-a',
              version: '01.01.000',
              quantitativeReference: '1' as const,
            },
            ports: {
              items: [existingPort],
            },
          },
        ],
        edges: [
          {
            id: 'edge-a',
            source: { cell: 'node-a', port: 'OUTPUT:flow-existing' },
            target: { cell: 'node-a', port: 'OUTPUT:flow-existing' },
          },
        ],
      },
    };

    const result = normalizeLifeCycleModelGraphForDisplay({
      jsonTg,
      processDetails: [
        createProcessDetail({
          id: 'process-a',
          version: '01.01.000',
          exchanges: [
            createExchange({
              direction: 'OUTPUT',
              flowId: 'flow-other',
              quantitativeReference: true,
            }),
          ],
        }),
      ],
    });

    expect(result.xflow?.nodes?.[0].ports?.items).toEqual([existingPort]);
    expect(result.xflow?.nodes?.[0].data?.quantitativeReference).toBe('1');
    expect(result.xflow?.edges?.[0].source?.port).toBe('OUTPUT:flow-existing');
    expect(result.xflow?.edges?.[0].target?.port).toBe('OUTPUT:flow-existing');
  });

  it('fails soft when process details are missing or a Flow match is ambiguous', () => {
    const jsonTg = {
      xflow: {
        nodes: [
          {
            id: 'source',
            data: {
              id: 'process-source',
              version: '01.01.000',
            },
          },
          {
            id: 'target',
            data: {
              id: 'process-target',
              version: '01.01.000',
            },
          },
        ],
        edges: [
          {
            id: 'edge-ambiguous',
            source: { cell: 'source' },
            target: { cell: 'target' },
            data: {
              connection: {
                outputExchange: {
                  '@flowUUID': 'flow-ambiguous',
                  downstreamProcess: {
                    '@flowUUID': 'flow-ambiguous',
                  },
                },
              },
            },
          },
        ],
      },
    };

    const result = normalizeLifeCycleModelGraphForDisplay({
      jsonTg,
      processDetails: [
        createProcessDetail({
          id: 'process-target',
          version: '01.01.000',
          exchanges: [
            createExchange({
              direction: 'INPUT',
              flowId: 'flow-ambiguous',
            }),
            createExchange({
              direction: 'INPUT',
              flowId: 'flow-ambiguous',
            }),
          ],
        }),
      ],
    });

    expect(result.xflow?.nodes?.[0].ports?.items).toEqual([]);
    expect(result.xflow?.nodes?.[1].ports?.items).toEqual([]);
    expect(result.xflow?.edges?.[0].source).toEqual({ cell: 'source' });
    expect(result.xflow?.edges?.[0].target).toEqual({ cell: 'target' });
  });

  it('fails soft for malformed optional graph and exchange fields', () => {
    const result = normalizeLifeCycleModelGraphForDisplay({
      jsonTg: {
        xflow: {
          nodes: [
            {
              id: 'shared',
              size: { width: 350, height: undefined as unknown as number },
              data: {
                id: 'process-shared',
                version: '01.01.000',
                index: 'shared',
              },
            },
            {
              id: 'heightless',
              data: {
                id: 'process-heightless',
                version: '01.01.000',
              },
            },
            {
              id: '',
              data: {
                id: '',
                version: ' ',
              },
            },
          ],
          edges: [
            {
              id: 'self-edge',
              source: { cell: 'shared' },
              target: { cell: 'shared' },
              data: {
                connection: {
                  outputExchange: {
                    '@flowUUID': 'flow-array',
                  },
                },
              },
            },
            {
              id: 'missing-cells',
              source: {},
              target: {},
              data: {
                connection: {
                  outputExchange: {
                    '@flowUUID': 'flow-array',
                  },
                },
              },
            },
            {
              id: 'missing-flow',
              source: { cell: 'shared' },
              target: { cell: 'shared' },
            },
          ],
        },
      },
      processDetails: [
        {
          id: 'process-shared',
          version: '01.01.000',
          json: {
            processDataSet: {
              exchanges: {
                exchange: [
                  {
                    exchangeDirection: 'OUTPUT',
                    quantitativeReference: true,
                    referenceToFlowDataSet: [
                      {
                        '@refObjectId': 'flow-array',
                        '@version': '01.01.000',
                      },
                    ],
                  },
                  {
                    exchangeDirection: 'INPUT',
                    referenceToFlowDataSet: [
                      {
                        '@refObjectId': 'flow-array',
                        '@version': '01.01.000',
                      },
                    ],
                  },
                  {
                    exchangeDirection: undefined,
                    referenceToFlowDataSet: {
                      '@refObjectId': 'flow-no-direction',
                    },
                  },
                  {
                    exchangeDirection: 'sideways',
                    referenceToFlowDataSet: {
                      '@refObjectId': 'flow-invalid-direction',
                    },
                  },
                  {
                    exchangeDirection: 'INPUT',
                    referenceToFlowDataSet: 'invalid-reference',
                  },
                ],
              },
            },
          },
        },
        {
          id: 'process-heightless',
          version: '01.01.000',
          json: {
            processDataSet: {
              exchanges: {
                exchange: {
                  exchangeDirection: 'OUTPUT',
                  quantitativeReference: 'true',
                  referenceToFlowDataSet: {
                    '@refObjectId': 'flow-heightless',
                  },
                },
              },
            },
          },
        },
        {
          id: '',
          version: ' ',
        },
      ],
    });

    expect(result.xflow?.nodes?.[0].size?.height).toBe(100);
    expect(result.xflow?.nodes?.[0].ports?.items?.map((item) => item.id)).toEqual([
      'INPUT:flow-array',
      'OUTPUT:flow-array',
    ]);
    expect(result.xflow?.nodes?.[1].height).toBe(80);
    expect(result.xflow?.nodes?.[2].ports?.items).toEqual([]);
    expect(result.xflow?.edges?.[0].source?.port).toBe('OUTPUT:flow-array');
    expect(result.xflow?.edges?.[0].target?.port).toBe('INPUT:flow-array');
    expect(result.xflow?.edges?.[1].source).toEqual({});
    expect(result.xflow?.edges?.[1].target).toEqual({});
    expect(result.xflow?.edges?.[2].source).toEqual({ cell: 'shared' });
    expect(result.xflow?.edges?.[2].target).toEqual({ cell: 'shared' });
  });

  it('returns an empty display graph when all inputs are absent', () => {
    expect(normalizeLifeCycleModelGraphForDisplay({ jsonTg: undefined })).toEqual({
      xflow: {
        nodes: [],
        edges: [],
      },
    });
  });
});

describe('canonical reference quantity hydration', () => {
  const hydrate = (
    factor: unknown = '2',
    amount: unknown = '1000',
    target?: unknown,
    options: {
      version?: string;
      duplicate?: boolean;
      reference?: unknown;
      exchangeId?: unknown;
      factorMissing?: boolean;
    } = {},
  ) => {
    const instance = {
      '@dataSetInternalID': '1',
      '@multiplicationFactor': options.factorMissing ? undefined : factor,
      referenceToProcess: { '@refObjectId': 'source', '@version': options.version ?? '04.00.000' },
    };
    const jsonTg = {
      xflow: {
        nodes: [
          {
            id: '1',
            data: {
              id: 'source',
              version: '04.00.000',
              ...(target === undefined ? {} : { targetAmount: target }),
            },
          },
        ],
      },
    };
    const model = {
      lifeCycleModelInformation: {
        quantitativeReference: { referenceToReferenceProcess: 1 },
        technology: {
          processes: { processInstance: options.duplicate ? [instance, instance] : instance },
        },
      },
    };
    const detail = {
      id: 'source',
      version: '04.00.000',
      json: {
        processDataSet: {
          processInformation: {
            quantitativeReference: { referenceToReferenceFlow: options.reference ?? 0 },
          },
          exchanges: {
            exchange: { '@dataSetInternalID': options.exchangeId ?? '0', meanAmount: amount },
          },
        },
      },
    };
    const snapshot = JSON.stringify({ jsonTg, model, detail });
    const result = normalizeLifeCycleModelGraphForDisplay({
      jsonTg: jsonTg as any,
      lifeCycleModelDataSet: model,
      processDetails: [detail],
    });
    expect(JSON.stringify({ jsonTg, model, detail })).toBe(snapshot);
    return result.xflow!.nodes![0].data!;
  };

  it.each([
    ['2', '1000', 2000],
    ['0.25', '4e2', 100],
    [3, 0.5, 1.5],
  ])('restores target from multiplier %s and reference quantity %s', (factor, amount, expected) => {
    expect(hydrate(factor, amount)).toMatchObject({
      originalAmount: Number(amount),
      scalingFactor: Number(factor),
      targetAmount: expected,
    });
  });
  it.each([7, 0, '', 'invalid', null])(
    'preserves explicit target %s for validation/editor intent',
    (target) => {
      expect(hydrate('2', '1000', target).targetAmount).toBe(target);
    },
  );
  it.each([undefined, null, '', 'bad', '0', '-2', '1e999', '0x10', true])(
    'does not invent a target from invalid factor %s',
    (factor) => {
      expect(
        hydrate(factor, '1000', undefined, { factorMissing: factor === undefined }).targetAmount,
      ).toBeUndefined();
    },
  );
  it.each(['', 'bad', '0', '-1', '1e999', null])(
    'rejects invalid reference amount %s',
    (amount) => {
      expect(hydrate('2', amount).targetAmount).toBeUndefined();
    },
  );
  it.each([{ version: '05.00.000' }, { duplicate: true }, { reference: 9 }, { exchangeId: '' }])(
    'requires exact unique instance and reference exchange %o',
    (options) => {
      expect(hydrate('2', '1000', undefined, options).targetAmount).toBeUndefined();
    },
  );
  it('does not overflow or underflow a valid pair', () => {
    expect(hydrate('1e308', '1e308').targetAmount).toBeUndefined();
    expect(hydrate('1e-300', '1e-300').targetAmount).toBeUndefined();
  });
});
