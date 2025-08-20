/**
 * Copyright © 2025 650 Industries.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Convert a route pathname to a loader module path.
 *
 * Examples:
 * - `/` becomes `/_expo/loaders/index.js`
 * - `/posts/1` becomes `/_expo/loaders/posts/1.js`
 * - `/about` becomes `/_expo/loaders/about.js`
 */
export function getLoaderModulePath(pathname: string): string {
  const cleanPath = new URL(pathname, 'http://localhost').pathname;
  const normalizedPath = cleanPath === '/' ? '/' : cleanPath.replace(/\/$/, '');
  const pathSegment = normalizedPath === '/' ? '/index' : normalizedPath;

  return `/_expo/loaders${pathSegment}.js`;
}

/**
 * Convert a loader module path back to a route pathname.
 * This is the inverse operation of `getLoaderModulePath()`.
 *
 * Examples:
 * - `/_expo/loaders/index.js` becomes `/`
 * - `/_expo/loaders/posts/1.js` becomes `/posts/1`
 * - `/_expo/loaders/about.js` becomes `/about`
 */
export function getRoutePathFromLoaderPath(loaderPath: string): string {
  return (
    loaderPath.replace('/_expo/loaders', '').replace(/\.js$/, '').replace('/index', '/') || '/'
  );
}

/**
 * Attempts to construct a fallback loader path using route segments from `useSegments()`.
 * Only works with dynamic segments.
 */
function constructFallbackLoaderPath(routePath: string, segments?: string[]): string | null {
  if (segments && segments.length > 0) {
    // If we have segments with bracket notation, use them directly
    const hasAnyDynamicSegments = segments.some(
      (segment) => segment.includes('[') && segment.includes(']')
    );
    if (hasAnyDynamicSegments) {
      const fallbackPath = '/' + segments.join('/');
      return fallbackPath !== routePath ? fallbackPath : null;
    }
  }

  return null;
}

/**
 * Fetches and parses a single loader module from the given path.
 */
async function fetchAndParseLoaderModule(loaderPath: string): Promise<any> {
  const response = await fetch(loaderPath);
  if (response.ok) {
    const text = await response.text();

    // Modules are generated as: export default {json}
    const match = text.match(/export default (.+)$/m);
    if (match) {
      return JSON.parse(match[1]);
    }

    throw new Error('Invalid loader module format');
  }
  throw new Error(`Failed to fetch loader data: ${response.status}`);
}

/**
 * Attempts to fetch fallback loader data if the original request fails.
 */
async function tryFallbackLoader(routePath: string, segments?: string[]): Promise<any | null> {
  const fallbackRoutePath = constructFallbackLoaderPath(routePath, segments);
  if (!fallbackRoutePath) return null;

  const fallbackLoaderPath = getLoaderModulePath(fallbackRoutePath);
  try {
    return await fetchAndParseLoaderModule(fallbackLoaderPath);
  } catch {
    return null;
  }
}

/**
 * Fetches and parses a loader module from the given route path.
 * This works in all environments including:
 * 1. Development with Metro dev server (see `LoaderModuleMiddleware`)
 * 2. Production with static files (SSG)
 * 3. SSR environments
 *
 * Optimizes for dynamic routes by detecting them upfront and loading a
 * fallback directly, avoiding unnecessary 404 requests.
 */
export async function fetchLoaderModule(routePath: string, segments?: string[]): Promise<any> {
  const loaderPath = getLoaderModulePath(routePath);

  // TODO(@hassankhan): Consider racing promises for potential dynamic routes
  try {
    return await fetchAndParseLoaderModule(loaderPath);
  } catch (error) {
    const fallbackData = await tryFallbackLoader(routePath, segments);
    if (fallbackData) return fallbackData;

    throw error;
  }
}
