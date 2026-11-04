import type { MethodReportSummary } from './viewModel.js';
import { escapeHtml as e, evidenceDisclosure } from './content.js';

/** Supplied structured evidence is text, including booleans, nulls and all identity fields. */
function evidence(value: unknown): string {
  if (value === null) return '<span class="unavailable">Not supplied (null)</span>';
  if (Array.isArray(value))
    return value.length
      ? `<ol>${value.map((entry) => `<li>${evidence(entry)}</li>`).join('')}</ol>`
      : '<span>None supplied (empty list)</span>';
  if (typeof value === 'object')
    return `<dl class="method-evidence">${Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `<dt>${e(key)}</dt><dd>${evidence(entry)}</dd>`)
      .join('')}</dl>`;
  return e(String(value));
}

function tableRegion(title: string, columns: string[], rows: string, id: string): string {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${e(title)}"><table><caption>${e(title)}</caption><thead><tr>${columns.map((column) => `<th scope="col">${e(column)}</th>`).join('')}</tr></thead><tbody id="${e(id)}">${rows}</tbody></table></div>`;
}

/** Mandatory sections have no dependency on author sections, claim selection or table limits. */
export function renderMethodAssessment(summary: MethodReportSummary): string {
  const { requirements, categories, factCatalog, ...sourceEvidence } = summary;
  const requirementRows = requirements
    .map(
      (requirement) =>
        `<tr data-requirement-id="${e(requirement.requirementId)}"><th scope="row">${e(requirement.requirementId)}</th><td data-print-label="Machine state and scope">${e(requirement.machine.status)}<br>${e(requirement.machine.scope)}<ul class="machine-checks">${requirement.machine.checks.map((check) => `<li><strong>${e(check.predicateId)}</strong><br>${e(check.status)}<br>${evidence(check.reasonCodes)}</li>`).join('')}</ul></td><td data-print-label="Professional and declaration state">${e(requirement.professional.status)}<br>${e(requirement.declarationState)}<br>${evidence(requirement.professional.reasonCodes)}</td><td data-print-label="Source and professional evidence">${evidenceDisclosure('Source and professional evidence', evidence(requirement))}</td></tr>`,
    )
    .join('');
  const categoryRows = categories
    .map(
      (category) =>
        `<tr data-category-id="${e(category.methodRef.id)}"><th scope="row">${e(category.name)}<br>${e(category.methodRef.id)} @ ${e(category.methodRef.version)}</th><td data-print-label="Role and parent">${e(category.role)}<br>Parent: ${category.parentMethodId === null ? 'None (null)' : e(category.parentMethodId)}</td><td data-print-label="Supplied value, unit and coverage">${category.canonicalCharacterisedValue === null ? 'No numeric value (null)' : e(category.canonicalCharacterisedValue)}<br>${e(category.unit)}<br>${e(category.coverage)}</td><td data-print-label="Category evidence">Selected: ${String(category.selected)}<br>Source compatible: ${String(category.sourceCompatible)}<br>N/W included: ${String(category.normalisationWeightingIncluded)}${evidenceDisclosure('Category evidence', evidence(category))}</td></tr>`,
    )
    .join('');
  const catalogRows = factCatalog
    .map(
      (fact) =>
        `<tr data-label="${e(fact.factId)}" data-catalog-id="${e(fact.factId)}"><th scope="row">${e(fact.factId)}</th><td class="value" data-print-label="Exact value and unit">${fact.canonicalValue === null ? 'No numeric value (null)' : e(fact.canonicalValue)}<br>${e(fact.unit)}</td><td data-print-label="Coverage and reasons">${e(fact.coverage)}<br>Reason codes: ${fact.reasonCodes.length ? fact.reasonCodes.map(e).join(', ') : 'None supplied'}</td><td data-print-label="Provenance and unit identity">${evidenceDisclosure('Evidence', `${evidence(fact)}<p>Source ${e(summary.factsRef.type)} ${e(summary.factsRef.id)}<br>SHA-256 ${e(summary.factsRef.contentHash)}<br>Source fact ${e(fact.factId)}</p>`)}</td></tr>`,
    )
    .join('');
  const selected = summary.methodSourceEvidence.selectedFactorEvidence;
  return `<section id="method-assessment"><h2>Method assessment and qualification boundaries</h2><p class="warning">This is a supplied candidate method assessment. Machine predicate checks, recorded evidence, source adoption, software qualification and internal report review are separate from professional approval. Rendering performs no LCA or normalisation/weighting calculation and grants no source permission.</p><dl><dt>PEF conformity qualified</dt><dd>${String(summary.pefConformityQualified)}</dd><dt>Scientific ranking qualified</dt><dd>${String(summary.scientificRankingQualified)}</dd><dt>Business pilot qualified</dt><dd>${String(summary.businessPilotQualified)}</dd><dt>Outcome</dt><dd>${e(summary.outcome)}</dd></dl></section><section id="method-requirements"><h2>All 20 method requirements</h2><p>Every supplied machine state, predicate check, declaration, source citation and professional state is disclosed below. Pending or recorded evidence is not an approval.</p>${tableRegion('Method requirements: machine and professional states', ['Requirement', 'Machine state and scope', 'Professional and declaration state', 'All supplied checks and evidence'], requirementRows, 'method-requirement-rows')}</section><section id="method-categories"><h2>All 25 category roles</h2><p>Sixteen primary categories and nine decomposition subcategories retain their supplied roles. A subcategory is not an additional primary category. Missing values and coverage are preserved.</p>${tableRegion('Method category roles and characterised values', ['Method category', 'Role and parent', 'Supplied value, unit and coverage', 'All supplied category evidence'], categoryRows, 'method-category-rows')}</section><section id="method-catalog" data-report-table><h2>All 58 supplied method facts</h2><p>The mandatory catalog is independent of author-selected claims. Values, units, coverage, reasons and unit identities are supplied by the facts producer without browser recomputation.</p><div class="controls"><label>Filter method facts<input type="search" aria-controls="method-catalog-rows" placeholder="Fact, value, unit or evidence"></label><label>Method fact order<select aria-label="Method fact order" aria-controls="method-catalog-rows"><option value="original">Report order</option><option value="ascending">Label A to Z</option><option value="descending">Label Z to A</option></select></label><span role="status" aria-live="polite">${factCatalog.length} of ${factCatalog.length} facts shown</span></div>${tableRegion('Complete supplied method fact catalog', ['Source fact', 'Exact value and unit', 'Coverage and reasons', 'Provenance and unit identity'], catalogRows, 'method-catalog-rows')}</section><section id="method-sources"><h2>Exact method sources, configuration and frozen evidence</h2><p>Selected factor records: ${String(selected.selectedFactorRecordCount)}. Full selected-factor records are not embedded (embedded: false). They remain in the exact authorized method facts artifact referenced below; this summary does not claim to include that full artifact.</p>${evidence(sourceEvidence)}</section>`;
}
