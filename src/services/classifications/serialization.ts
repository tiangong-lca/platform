import { classificationToJsonList, classificationToStringList } from '../general/util';
import { mapTidasRepeated } from '../general/tidasRepeatedFields';
import { isClassificationPath, usesBuiltInClassification } from './system';

const singletonClassArrayTypes = new Set(['Flow', 'LifeCycleModel', 'Process']);

/** A flow-type change clears selected paths in every system, retaining source identities. */
export function clearClassificationSelection(systems: any, classKey: string) {
  return mapTidasRepeated(systems, (system) =>
    system === null || system === undefined ? system : { ...system, [classKey]: null },
  );
}

export function classificationClassesToForm(system: any, dataType: string) {
  const classes = system?.['common:class'];
  if (!usesBuiltInClassification(system, dataType) || !classes || isClassificationPath(classes)) {
    return classes;
  }
  const path = classificationToStringList(classes);
  const supportsSingletonArray = dataType === 'Contact' || singletonClassArrayTypes.has(dataType);
  return supportsSingletonArray && Array.isArray(classes) && classes.length === 1
    ? { ...path, singleLevelArray: true }
    : path;
}

export function classificationClassesToJson(system: any) {
  const classes = system?.['common:class'];
  if (!isClassificationPath(classes)) return classes;
  const serialized = classificationToJsonList(classes);
  return classes.singleLevelArray && classes.value.length === 1 ? [serialized] : serialized;
}

export function classificationSystemsToJson(systems: any, dataType: string) {
  const repeated = Array.isArray(systems);
  const singletonRequiresArray = singletonClassArrayTypes.has(dataType);
  return mapTidasRepeated(systems, (system) => {
    const classes = classificationClassesToJson(system);
    const requiresClassArray =
      repeated || (singletonRequiresArray && isClassificationPath(system?.['common:class']));
    return {
      ...system,
      // Some singleton schemas also require class arrays for a single level.
      'common:class':
        requiresClassArray && classes && typeof classes === 'object' && !Array.isArray(classes)
          ? [classes]
          : classes,
    };
  });
}
