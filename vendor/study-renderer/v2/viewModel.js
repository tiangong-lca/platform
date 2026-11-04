/** Platform-owned view protocol. It is not a numerical or authorization protocol. */
export const VIEW_SCHEMA = 'lca.study-report-view.v2';
export const RENDERER_VERSION = '2.0.0';
export class ReportViewError extends Error {
    path;
    constructor(path) {
        super(`Invalid report view at ${path}`);
        this.path = path;
        this.name = 'ReportViewError';
    }
}
function requireValue(condition, path) {
    if (!condition)
        throw new ReportViewError(path);
}
function record(value, keys, path) {
    requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path);
    const result = value;
    requireValue(Object.keys(result).length === keys.length &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(result, key)), path);
    return result;
}
function text(value, path, max = 2048) {
    requireValue(typeof value === 'string' &&
        value.length > 0 &&
        value.length <= max &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), path);
}
function id(value, path) {
    requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value), path);
}
function hash(value, path) {
    requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), path);
}
function timestamp(value, path) {
    requireValue(typeof value === 'string', path);
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
    requireValue(parts, path);
    const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
    const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    requireValue(month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= days[month - 1] &&
        hour <= 23 &&
        minute <= 59 &&
        second <= 59 &&
        (!parts[7] || (Number(parts[8]) <= 23 && Number(parts[9]) <= 59)), path);
}
function choice(value, choices, path) {
    requireValue(typeof value === 'string' && choices.includes(value), path);
}
function array(value, path, max, min = 0) {
    requireValue(Array.isArray(value) && value.length >= min && value.length <= max, path);
    return value;
}
function texts(value, path, max = 64) {
    array(value, path, max).forEach((item, i) => text(item, `${path}/${i}`));
}
function ids(value, path, max, min = 0) {
    const values = array(value, path, max, min);
    values.forEach((item, i) => id(item, `${path}/${i}`));
    requireValue(new Set(values).size === values.length, path);
    return values;
}
function method(value, path, expanded = false) {
    const item = record(value, expanded ? ['id', 'version', 'name', 'unit'] : ['id', 'version'], path);
    id(item.id, `${path}/id`);
    requireValue(typeof item.version === 'string' && /^\d{2}\.\d{2}\.\d{3}$/u.test(item.version), path);
    if (expanded) {
        text(item.name, `${path}/name`, 256);
        text(item.unit, `${path}/unit`, 128);
    }
    return item;
}
/** A bounded decimal spelling, never converted through Number for validation or display. */
export function isCanonicalDecimal(value) {
    return (typeof value === 'string' &&
        value.length <= 64 &&
        /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?(?:e-?[1-9]\d{0,2})?$/u.test(value) &&
        (!value.includes('e') || Math.abs(Number(value.split('e')[1])) <= 324) &&
        (!/^-?0(?:e.*)?$/u.test(value) || value === '0'));
}
export function validateReportView(input, expectedRendererVersion = RENDERER_VERSION) {
    const v = record(input, [
        'schemaVersion',
        'rendererVersion',
        'report',
        'definition',
        'runs',
        'facts',
        'sections',
        'tables',
        'charts',
        'citations',
        'assumptions',
        'cutoffs',
        'limitations',
        'snapshot',
    ], '/');
    requireValue((expectedRendererVersion === RENDERER_VERSION || expectedRendererVersion === '1.0.0') &&
        v.schemaVersion ===
            (expectedRendererVersion === '1.0.0' ? 'lca.study-report-view.v1' : VIEW_SCHEMA) &&
        v.rendererVersion === expectedRendererVersion, '/version');
    const report = record(v.report, ['studyId', 'reportRevisionId', 'contentHash', 'title', 'generatedAt'], '/report');
    id(report.studyId, '/report/studyId');
    id(report.reportRevisionId, '/report/reportRevisionId');
    hash(report.contentHash, '/report/contentHash');
    text(report.title, '/report/title', 256);
    timestamp(report.generatedAt, '/report/generatedAt');
    const definition = record(v.definition, ['goal', 'functionalUnit', 'boundary', 'methodRefs'], '/definition');
    text(definition.goal, '/definition/goal', 4096);
    text(definition.boundary, '/definition/boundary', 4096);
    const fu = record(definition.functionalUnit, ['amount', 'unit', 'referenceFlowId'], '/definition/functionalUnit');
    requireValue(typeof fu.amount === 'string' &&
        fu.amount.length <= 64 &&
        /^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/u.test(fu.amount), '/definition/functionalUnit/amount');
    text(fu.unit, '/definition/functionalUnit/unit', 128);
    id(fu.referenceFlowId, '/definition/functionalUnit/referenceFlowId');
    const methods = array(definition.methodRefs, '/definition/methodRefs', 32, 1).map((m, i) => method(m, `/definition/methodRefs/${i}`, true));
    requireValue(new Set(methods.map((m) => m.id)).size === methods.length, '/definition/methodRefs');
    const runs = array(v.runs, '/runs', 32, 1).map((item, i) => {
        const p = `/runs/${i}`;
        const run = record(item, ['runId', 'scenarioRevisionId', 'label', 'inputHash', 'profileId', 'calculationContractRef'], p);
        ['runId', 'scenarioRevisionId', 'profileId'].forEach((key) => id(run[key], `${p}/${key}`));
        text(run.label, `${p}/label`, 256);
        hash(run.inputHash, `${p}/inputHash`);
        const calculation = record(run.calculationContractRef, ['kind', 'schema', 'sha256'], `${p}/calculationContractRef`);
        requireValue(calculation.kind === 'calculation_contract' &&
            calculation.schema === 'lca.calculation-contract.v1', `${p}/calculationContractRef`);
        hash(calculation.sha256, `${p}/calculationContractRef/sha256`);
        return run;
    });
    const runIds = runs.map((r) => r.runId);
    requireValue(new Set(runIds).size === runs.length, '/runs');
    const facts = array(v.facts, '/facts', 2048, 1).map((item, i) => {
        const p = `/facts/${i}`;
        const fact = record(item, [
            'factId',
            'label',
            'runIds',
            'methodRef',
            'canonicalValue',
            'unit',
            'coverage',
            ...(expectedRendererVersion === '1.0.0' ? [] : ['reasonCodes']),
            'provenance',
        ], p);
        id(fact.factId, `${p}/factId`);
        text(fact.label, `${p}/label`, 1024);
        requireValue(ids(fact.runIds, `${p}/runIds`, 32, 1).every((r) => runIds.includes(r)), `${p}/runIds`);
        text(fact.unit, `${p}/unit`, 128);
        if (fact.methodRef !== null) {
            const selected = method(fact.methodRef, `${p}/methodRef`);
            const defined = methods.find((m) => m.id === selected.id && m.version === selected.version);
            // The reference identifies category provenance. Relative deltas can have unit "1";
            // the producer/claim verifier owns quantity semantics, never this view-only layer.
            requireValue(defined, `${p}/methodRef`);
        }
        requireValue(fact.canonicalValue === null || isCanonicalDecimal(fact.canonicalValue), `${p}/canonicalValue`);
        choice(fact.coverage, ['complete', 'partial', 'unknown'], `${p}/coverage`);
        requireValue(expectedRendererVersion === '1.0.0'
            ? (fact.canonicalValue === null) === (fact.coverage === 'unknown')
            : fact.coverage !== 'unknown' || fact.canonicalValue === null, `${p}/coverage`);
        if (expectedRendererVersion !== '1.0.0') {
            array(fact.reasonCodes, `${p}/reasonCodes`, 32).forEach((code, index) => text(code, `${p}/reasonCodes/${index}`, 128));
        }
        const source = record(fact.provenance, ['type', 'id', 'contentHash'], `${p}/provenance`);
        choice(source.type, ['runResult', 'analysisFacts'], `${p}/provenance/type`);
        id(source.id, `${p}/provenance/id`);
        hash(source.contentHash, `${p}/provenance/contentHash`);
        return fact;
    });
    const factIds = facts.map((f) => f.factId);
    requireValue(new Set(factIds).size === facts.length, '/facts');
    const citations = array(v.citations, '/citations', 2048).map((item, i) => {
        const p = `/citations/${i}`;
        const citation = record(item, ['citationId', 'label', 'sourceType', 'identity', 'version', 'contentHash'], p);
        id(citation.citationId, `${p}/citationId`);
        text(citation.label, `${p}/label`, 256);
        choice(citation.sourceType, ['datasetRevision', 'releaseFinalResult', 'document'], `${p}/sourceType`);
        id(citation.identity, `${p}/identity`);
        text(citation.version, `${p}/version`, 128);
        if (citation.sourceType === 'datasetRevision') {
            requireValue(typeof citation.version === 'string' && /^\d{2}\.\d{2}\.\d{3}$/u.test(citation.version), `${p}/version`);
        }
        if (citation.contentHash !== null)
            hash(citation.contentHash, `${p}/contentHash`);
        return citation;
    });
    const citationIds = citations.map((c) => c.citationId);
    requireValue(new Set(citationIds).size === citations.length, '/citations');
    const sections = array(v.sections, '/sections', 32).map((item, i) => {
        const p = `/sections/${i}`;
        const section = record(item, ['sectionId', 'title', 'paragraphs', 'factIds', 'citationIds'], p);
        id(section.sectionId, `${p}/sectionId`);
        text(section.title, `${p}/title`, 256);
        texts(section.paragraphs, `${p}/paragraphs`, 32);
        requireValue(ids(section.factIds, `${p}/factIds`, 256).every((f) => factIds.includes(f)), `${p}/factIds`);
        requireValue(ids(section.citationIds, `${p}/citationIds`, 64).every((c) => citationIds.includes(c)), `${p}/citationIds`);
        return section.sectionId;
    });
    requireValue(new Set(sections).size === sections.length, '/sections');
    for (const kind of ['tables', 'charts']) {
        const key = kind === 'tables' ? 'tableId' : 'chartId';
        const entries = array(v[kind], `/${kind}`, 32).map((item, i) => {
            const p = `/${kind}/${i}`;
            const entry = record(item, [key, 'title', 'factIds'], p);
            id(entry[key], `${p}/${key}`);
            text(entry.title, `${p}/title`, 256);
            const selected = ids(entry.factIds, `${p}/factIds`, kind === 'charts' ? 64 : 2048, 1);
            requireValue(selected.every((f) => factIds.includes(f)), `${p}/factIds`);
            if (kind === 'charts') {
                const chartFacts = selected.map((f) => facts.find((fact) => fact.factId === f));
                requireValue(chartFacts.every((f) => {
                    const ref = f.methodRef;
                    const first = chartFacts[0].methodRef;
                    return (f.unit === chartFacts[0].unit &&
                        (ref === null || first === null
                            ? ref === first
                            : ref.id === first.id && ref.version === first.version));
                }), `${p}/methodRef`);
            }
            return entry[key];
        });
        requireValue(new Set(entries).size === entries.length, `/${kind}`);
    }
    array(v.assumptions, '/assumptions', 128).forEach((item, i) => text(item, `/assumptions/${i}`, 8192));
    texts(v.cutoffs, '/cutoffs', 512);
    texts(v.limitations, '/limitations');
    requireValue(v.limitations.length > 0, '/limitations');
    const snapshot = record(v.snapshot, ['validity', 'checkedAt', 'review', 'reviewIds', 'finalization'], '/snapshot');
    choice(snapshot.validity, ['current', 'superseded', 'withdrawn', 'unknown'], '/snapshot/validity');
    timestamp(snapshot.checkedAt, '/snapshot/checkedAt');
    choice(snapshot.review, ['unreviewed', 'reviewed'], '/snapshot/review');
    const reviews = ids(snapshot.reviewIds, '/snapshot/reviewIds', 64);
    requireValue((snapshot.review === 'reviewed') === reviews.length > 0, '/snapshot/reviewIds');
    choice(snapshot.finalization, ['not_finalized', 'finalized'], '/snapshot/finalization');
    // Bound total serialized disclosure as well as individual fields.
    requireValue(new TextEncoder().encode(JSON.stringify(input)).length <= 2_000_000, '/size');
    return input;
}
export function validateRenderContext(input) {
    const v = record(input, ['exportId', 'projectionHash', 'verificationAtGeneration'], '/context');
    id(v.exportId, '/context/exportId');
    hash(v.projectionHash, '/context/projectionHash');
    choice(v.verificationAtGeneration, ['unverified', 'verified_by_trusted_exporter'], '/context/verificationAtGeneration');
    return input;
}
