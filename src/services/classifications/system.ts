import {
  getReferenceResourceDefinition,
  type IlcdCanonicalDataType,
  type ReferenceResourceId,
} from '../referenceResources/manifest';

/** Stable dataset identities for the resources actually used by the taxonomy selector. */
export function getClassificationSource(dataType: string): {
  resourceId: ReferenceResourceId;
  dataType: IlcdCanonicalDataType;
  name: string;
  uri: string | null;
} {
  let resourceId: ReferenceResourceId = 'ilcd-classification';
  let canonicalDataType = dataType as IlcdCanonicalDataType;
  let name = 'ILCD';
  if (dataType === 'Process' || dataType === 'LifeCycleModel') {
    resourceId = 'isic';
    canonicalDataType = 'Process';
    name = 'ISIC Rev. 5';
  } else if (dataType === 'Flow') {
    resourceId = 'cpc';
    name = 'CPC Ver. 3.0';
  }
  const resource = getReferenceResourceDefinition(resourceId);
  const sourceUrl = resource.provenance.officialUrl;
  return {
    resourceId,
    dataType: canonicalDataType,
    name,
    // ILCD's reviewed source is a file inside the official reference package.
    uri:
      sourceUrl && resourceId === 'ilcd-classification'
        ? `${sourceUrl}#${resource.officialAvailability.sourceComponentScopes[0]}`
        : sourceUrl,
  };
}

export function isClassificationPath(classes: any): boolean {
  return Array.isArray(classes?.value);
}

export function usesBuiltInClassification(system: any, dataType: string): boolean {
  const source = getClassificationSource(dataType);
  // An explicit external source must never be silently rebound to our local resource.
  if (system?.['@classes'] && system['@classes'] !== source.uri) return false;
  if (!system?.['@name']) return true;
  if (system['@name'] !== source.name) return false;

  const classes = system['common:class'];
  if (!classes || isClassificationPath(classes)) return true;
  // Imported systems may share a name but contain levels or metadata the selector cannot retain.
  const entries = Array.isArray(classes) ? classes : Object.keys(classes).length ? [classes] : [];
  return entries.every(
    (entry, index) =>
      entry?.['@level'] === String(index) &&
      typeof entry['@classId'] === 'string' &&
      typeof entry['#text'] === 'string' &&
      Object.keys(entry).every((key) => ['@level', '@classId', '#text'].includes(key)),
  );
}
