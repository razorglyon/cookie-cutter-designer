import { DesignDocumentValidationError } from './validationError';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const FORBIDDEN_DECLARATION_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
const XML_STYLESHEET_PATTERN = /<\?\s*xml-stylesheet\b/i;
const LOCAL_FRAGMENT_PATTERN = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;
const LOCAL_URL_REFERENCE_PATTERN =
  /^\s*url\s*\(\s*#[A-Za-z_][A-Za-z0-9_.:-]*\s*\)\s*$/i;
const CSS_URL_PATTERN = /url\s*\(/i;

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'title',
  'desc'
]);

function invalid(path: string, message: string): never {
  throw new DesignDocumentValidationError(path, message);
}

function containsJavascriptProtocol(value: string): boolean {
  return value
    .replace(/[\u0000-\u0020\u007f]+/g, '')
    .toLowerCase()
    .includes('javascript:');
}

function isParserError(document: Document): boolean {
  const elements = [
    document.documentElement,
    ...Array.from(document.getElementsByTagName('*'))
  ];

  return elements.some(
    (element) => element !== null && element.localName.toLowerCase() === 'parsererror'
  );
}

function hasAllowedElementNamespace(element: Element): boolean {
  return (
    element.namespaceURI === null ||
    element.namespaceURI === '' ||
    element.namespaceURI === SVG_NAMESPACE
  );
}

function isXmlBaseAttribute(attribute: Attr): boolean {
  const localName = attribute.localName.toLowerCase();
  const qualifiedName = attribute.name.toLowerCase();
  const prefix = attribute.prefix?.toLowerCase();
  const namespace = attribute.namespaceURI?.toLowerCase();

  return (
    qualifiedName === 'xml:base' ||
    (localName === 'base' &&
      (prefix === 'xml' || namespace === XML_NAMESPACE.toLowerCase()))
  );
}

function validateAttribute(attribute: Attr, path: string): void {
  const name = attribute.localName.toLowerCase();
  const qualifiedName = attribute.name.toLowerCase();
  const value = attribute.value;

  if (name.startsWith('on') || qualifiedName.startsWith('on')) {
    invalid(path, `contient l'attribut événementiel interdit ${attribute.name}.`);
  }

  if (name === 'style') {
    invalid(path, `contient l'attribut interdit ${attribute.name}.`);
  }

  if (isXmlBaseAttribute(attribute)) {
    invalid(path, `contient l'attribut interdit ${attribute.name}.`);
  }

  if (name === 'src') {
    invalid(path, `contient l'attribut interdit ${attribute.name}.`);
  }

  if (value.includes('/*') || value.includes('*/') || value.includes('\\')) {
    invalid(
      path,
      `contient une séquence CSS interdite dans ${attribute.name}.`
    );
  }

  if (containsJavascriptProtocol(value)) {
    invalid(path, `contient une valeur javascript: interdite dans ${attribute.name}.`);
  }

  if (name === 'href' && !LOCAL_FRAGMENT_PATTERN.test(value)) {
    invalid(path, `${attribute.name} doit être un fragment local de la forme #id.`);
  }

  if (
    CSS_URL_PATTERN.test(value) &&
    !LOCAL_URL_REFERENCE_PATTERN.test(value)
  ) {
    invalid(path, `${attribute.name} doit référencer uniquement url(#id).`);
  }
}

export function validateSafeSvg(value: string, path: string): string {
  if (FORBIDDEN_DECLARATION_PATTERN.test(value)) {
    invalid(path, 'contient une déclaration DOCTYPE ou ENTITY interdite.');
  }

  if (XML_STYLESHEET_PATTERN.test(value)) {
    invalid(path, "contient une instruction xml-stylesheet interdite.");
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(value, 'image/svg+xml');
  } catch {
    invalid(path, "n'est pas un document XML SVG bien formé.");
  }

  if (isParserError(document)) {
    invalid(path, "n'est pas un document XML SVG bien formé.");
  }

  const root = document.documentElement;
  if (
    root === null ||
    root.localName.toLowerCase() !== 'svg' ||
    !hasAllowedElementNamespace(root)
  ) {
    invalid(path, 'doit avoir un élément <svg> comme racine.');
  }

  const elements = [root, ...Array.from(root.getElementsByTagName('*'))];
  for (const element of elements) {
    const elementName = element.localName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(elementName)) {
      invalid(path, `contient l'élément non autorisé <${element.localName}>.`);
    }

    if (!hasAllowedElementNamespace(element)) {
      invalid(
        path,
        `contient l'élément <${element.localName}> dans un namespace non autorisé.`
      );
    }

    for (const attribute of Array.from(element.attributes)) {
      validateAttribute(attribute, path);
    }
  }

  return value;
}