const SVG_STYLE_PROPERTIES = new Set<PropertyKey>([
  'fill',
  'fill-opacity',
  'fill-rule',
  'opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linejoin',
  'stroke-linecap',
  'stroke-miterlimit',
  'visibility'
]);

type StyledElement = Element & { readonly style?: CSSStyleDeclaration };

function patchElementStyle(element: Element): void {
  const style = (element as StyledElement).style;

  if (style === undefined) {
    return;
  }

  const compatibleStyle = new Proxy(style, {
    get(target, key) {
      const value = Reflect.get(target, key, target) as unknown;

      if (typeof value === 'function') {
        return value.bind(target);
      }

      if (value === undefined && SVG_STYLE_PROPERTIES.has(key)) {
        return '';
      }

      return value;
    }
  });

  Object.defineProperty(element, 'style', {
    configurable: true,
    value: compatibleStyle
  });
}

/**
 * Bridges happy-dom's partial SVG style implementation for the real Three.js SVGLoader.
 * Production code must continue to use the platform DOMParser directly.
 */
export function installSvgLoaderDomParserAdapter(): () => void {
  const OriginalDOMParser = globalThis.DOMParser;

  class SvgLoaderCompatibleDOMParser {
    private readonly delegate = new OriginalDOMParser();

    parseFromString(input: string, mimeType: DOMParserSupportedType): Document {
      const parsed = this.delegate.parseFromString(input, mimeType);
      const elements = parsed.querySelectorAll('*');

      for (let index = 0; index < elements.length; index += 1) {
        patchElementStyle(elements[index]);
      }

      return parsed;
    }
  }

  const CompatibleDOMParser = SvgLoaderCompatibleDOMParser as unknown as typeof DOMParser;
  globalThis.DOMParser = CompatibleDOMParser;

  return () => {
    if (globalThis.DOMParser === CompatibleDOMParser) {
      globalThis.DOMParser = OriginalDOMParser;
    }
  };
}
