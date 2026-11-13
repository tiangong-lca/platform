import { classificationToJsonList, classificationToStringList } from '../general/util';
import { mapTidasRepeated } from '../general/tidasRepeatedFields';
import { isClassificationPath, usesBuiltInClassification } from './system';

/** A flow-type change clears selected paths in every system, retaining source identities. */
export function clearClassificationSelection(systems: any, classKey: string) {
  return mapTidasRepeated(systems, (system) =>
    system === null || system === undefined ? system : { ...system, [classKey]: null },
  );
}

export function classificationClassesToForm(system: any, dataType: string) {
  const classes = system?.['common:class'];
  return usesBuiltInClassification(system, dataType) && !isClassificationPath(classes)
    ? classificationToStringList(classes)
    : classes;
}

export function classificationClassesToJson(system: any) {
  const classes = system?.['common:class'];
  return isClassificationPath(classes) || (!system?.['@name'] && !system?.['@classes'])
    ? classificationToJsonList(classes)
    : classes;
}

export function classificationSystemsToJson(systems: any) {
  return mapTidasRepeated(systems, (system) => {
    const classes = classificationClassesToJson(system);
    return {
      ...system,
      // The SDK's repeated-system branch requires class arrays, including a single level.
      'common:class':
        Array.isArray(systems) && classes && typeof classes === 'object' && !Array.isArray(classes)
          ? [classes]
          : classes,
    };
  });
}
