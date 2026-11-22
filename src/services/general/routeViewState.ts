import rawRegistry from './routeViewStateRegistry.json';

export type RouteViewStateRegistryId =
  | 'welcome-view'
  | 'dataset-drawer-mode'
  | 'dataset-required'
  | 'team-action'
  | 'data-processing-tab'
  | 'national-carbon-screen'
  | 'national-carbon-autoplay';

type RouteViewStateVariant = {
  id: string;
  queryValue: string | null;
};

type RouteViewStateRegistry = {
  id: RouteViewStateRegistryId;
  parameter: string;
  defaultVariantId: string;
  variants: RouteViewStateVariant[];
};

const registries = rawRegistry.registries as RouteViewStateRegistry[];

function getRegistry(registryId: RouteViewStateRegistryId): RouteViewStateRegistry {
  const registry = registries.find(({ id }) => id === registryId);
  if (!registry) {
    throw new Error(`Unknown route-view state registry: ${registryId}`);
  }
  return registry;
}

export function resolveRouteViewState(
  registryId: RouteViewStateRegistryId,
  queryValue: string | null,
): string {
  const registry = getRegistry(registryId);
  return (
    registry.variants.find((variant) => variant.queryValue === queryValue)?.id ??
    registry.defaultVariantId
  );
}

export function getRouteViewStateQueryValue(
  registryId: RouteViewStateRegistryId,
  variantId: string,
): string | null {
  const registry = getRegistry(registryId);
  const variant = registry.variants.find(({ id }) => id === variantId);
  if (!variant) {
    throw new Error(`Unknown ${registryId} route-view variant: ${variantId}`);
  }
  return variant.queryValue;
}

export function getRouteViewStateVariantIds(
  registryId: RouteViewStateRegistryId,
): readonly string[] {
  return getRegistry(registryId).variants.map(({ id }) => id);
}
