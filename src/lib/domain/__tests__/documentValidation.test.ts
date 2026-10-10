import { describe, expect, it } from 'vitest';
import {
  DesignDocumentValidationError,
  parseDesignDocumentV1
} from '../documentValidation';

function validV1Parameters(mode: 'cutter' | 'stamp') {
  return {
    wallThickness: 1,
    cuttingHeight: 10,
    totalHeight: 10,
    taperAngle: 0,
    targetSize: 100,
    sizeMode: 'longest',
    handleStyle: 'none',
    handleHeight: 0,
    enableHandle: false,
    enableEmbossing: false,
    embossDepth: 0,
    buildPlateSize: 200,
    mode,
    stampDepth: 1,
    stampBase: mode === 'stamp'
  };
}

function validCutterDocument() {
  return {
    schemaVersion: 1,
    id: 'design-1',
    name: 'Étoile',
    kind: 'cutter',
    source: {
      type: 'svg',
      fileName: 'etoile.svg',
      svg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>'
    },
    sketch: { svg: '<svg><path d="M0 0h1v1z" /></svg>', revision: 0 },
    parameters: validV1Parameters('cutter'),
    viewport: { showGrid: true, showAxes: false, showWallThickness: true },
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z'
  };
}

function validStampDocument() {
  return {
    ...validCutterDocument(),
    id: 'design-2',
    kind: 'stamp',
    source: {
      type: 'raster',
      fileName: 'logo.webp',
      mimeType: 'image/webp',
      vectorizedSvg: '<svg><path d="M0 0h1v1z" /></svg>'
    },
    parameters: validV1Parameters('stamp')
  };
}

function expectValidationPath(
  value: unknown,
  path: string,
  messageFragment?: string
): void {
  try {
    parseDesignDocumentV1(value);
    throw new Error('La validation aurait dû échouer.');
  } catch (error) {
    expect(error).toBeInstanceOf(DesignDocumentValidationError);
    if (!(error instanceof DesignDocumentValidationError)) {
      throw error;
    }
    expect(error.path).toBe(path);
    expect(error.message).toContain(path);
    if (messageFragment !== undefined) {
      expect(error.message).toContain(messageFragment);
    }
  }
}

describe('parseDesignDocumentV1', () => {
  it('accepte un document Cutter valide et retourne une copie profonde distincte', () => {
    const input = validCutterDocument();
    const parsed = parseDesignDocumentV1(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.source).not.toBe(input.source);
    expect(parsed.sketch).not.toBe(input.sketch);
    expect(parsed.parameters).not.toBe(input.parameters);
    expect(parsed.viewport).not.toBe(input.viewport);
  });

  it('accepte un document Stamp valide', () => {
    const parsed = parseDesignDocumentV1(validStampDocument());

    expect(parsed).toMatchObject({ kind: 'stamp', parameters: { mode: 'stamp' } });
  });

  it('rejette une version de schéma future', () => {
    const input = validCutterDocument();
    input.schemaVersion = 2;

    expectValidationPath(input, 'schemaVersion');
  });

  it('rejette un kind inconnu', () => {
    const input = validCutterDocument();
    input.kind = 'laser-cutter';

    expectValidationPath(input, 'kind');
  });

  it.each(['imprint-cutter', 'cake-topper'] as const)(
    'rejette le kind connu mais non implémenté %s',
    (kind) => {
      const input = validCutterDocument();
      input.kind = kind;

      expectValidationPath(input, 'kind', 'reconnu mais pas encore implémenté');
    }
  );

  it('rejette un mode V1 incohérent avec le kind', () => {
    const input = validCutterDocument();
    input.parameters.mode = 'stamp';

    expectValidationPath(input, 'parameters.mode');
  });

  it('rejette les champs inconnus dans les objets persistants', () => {
    const input = validCutterDocument();
    Object.assign(input.source, { futureOption: true });

    expectValidationPath(input, 'source.futureOption');
  });

  it('rejette un timestamp invalide et des timestamps inversés', () => {
    const invalid = validCutterDocument();
    invalid.createdAt = '2026-02-30T10:00:00.000Z';
    expectValidationPath(invalid, 'createdAt');

    const reversed = validCutterDocument();
    reversed.updatedAt = '2025-12-31T23:59:59.000Z';
    expectValidationPath(reversed, 'updatedAt');
  });

  it('rejette un MIME raster non pris en charge', () => {
    const input = validStampDocument();
    input.source.mimeType = 'image/gif';

    expectValidationPath(input, 'source.mimeType');
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejette la révision invalide %s',
    (revision) => {
      const input = validCutterDocument();
      input.sketch.revision = revision;

      expectValidationPath(input, 'sketch.revision');
    }
  );

  it('accepte les bornes inclusives de tous les nombres du schéma V1', () => {
    const minimums = validCutterDocument();
    Object.assign(minimums.parameters, {
      wallThickness: 0.4,
      cuttingHeight: 1,
      totalHeight: 1,
      taperAngle: 0,
      targetSize: 10,
      handleHeight: 0,
      embossDepth: 0,
      buildPlateSize: 20,
      stampDepth: 0.1
    });

    const maximums = validCutterDocument();
    Object.assign(maximums.parameters, {
      wallThickness: 10,
      cuttingHeight: 100,
      totalHeight: 150,
      taperAngle: 30,
      targetSize: 1000,
      handleHeight: 100,
      embossDepth: 20,
      buildPlateSize: 1000,
      stampDepth: 50
    });

    expect(parseDesignDocumentV1(minimums).parameters).toEqual(
      minimums.parameters
    );
    expect(parseDesignDocumentV1(maximums).parameters).toEqual(
      maximums.parameters
    );
  });

  it.each([
    ['wallThickness', 0.39],
    ['wallThickness', 10.01],
    ['cuttingHeight', 0.99],
    ['cuttingHeight', 100.01],
    ['totalHeight', 0.99],
    ['totalHeight', 150.01],
    ['taperAngle', -0.01],
    ['taperAngle', 30.01],
    ['targetSize', 9.99],
    ['targetSize', 1000.01],
    ['handleHeight', -0.01],
    ['handleHeight', 100.01],
    ['embossDepth', -0.01],
    ['embossDepth', 20.01],
    ['buildPlateSize', 19.99],
    ['buildPlateSize', 1000.01],
    ['stampDepth', 0.09],
    ['stampDepth', 50.01]
  ] as const)(
    'rejette %s hors des bornes V1 avec le chemin du champ',
    (field, value) => {
      const input = validCutterDocument();
      Object.assign(input.parameters, { [field]: value });

      expectValidationPath(input, `parameters.${field}`);
    }
  );

  it('rejette les nombres non finis, les booléens invalides et les enums inconnues', () => {
    const nonFinite = validCutterDocument();
    nonFinite.parameters.wallThickness = Number.NaN;
    expectValidationPath(nonFinite, 'parameters.wallThickness');

    const invalidBoolean = validCutterDocument();
    Object.assign(invalidBoolean.parameters, { enableHandle: 1 });
    expectValidationPath(invalidBoolean, 'parameters.enableHandle');

    const invalidSizeMode = validCutterDocument();
    invalidSizeMode.parameters.sizeMode = 'diagonal';
    expectValidationPath(invalidSizeMode, 'parameters.sizeMode');

    const invalidHandleStyle = validCutterDocument();
    invalidHandleStyle.parameters.handleStyle = 'ergonomic';
    expectValidationPath(invalidHandleStyle, 'parameters.handleStyle');
  });

  it('rejette les clés de paramètres manquantes, inconnues ou symboles', () => {
    const missing = validCutterDocument();
    Reflect.deleteProperty(missing.parameters, 'stampDepth');
    expectValidationPath(missing, 'parameters.stampDepth');

    const unknown = validCutterDocument();
    Object.assign(unknown.parameters, { futureOption: true });
    expectValidationPath(unknown, 'parameters.futureOption');

    const symbol = validCutterDocument();
    Object.defineProperty(symbol.parameters, Symbol('futureOption'), {
      enumerable: true,
      value: true
    });
    expectValidationPath(symbol, 'parameters');
  });

  it('applique les invariants V1 avec des erreurs précisément pathées', () => {
    const tooShort = validCutterDocument();
    tooShort.parameters.totalHeight = 9;
    expectValidationPath(tooShort, 'parameters.totalHeight');

    const handleTooTall = validCutterDocument();
    Object.assign(handleTooTall.parameters, {
      enableHandle: true,
      handleStyle: 'round',
      handleHeight: 1,
      totalHeight: 10
    });
    expectValidationPath(handleTooTall, 'parameters.totalHeight');

    const stampWithoutBase = validStampDocument();
    stampWithoutBase.parameters.stampBase = false;
    expectValidationPath(stampWithoutBase, 'parameters.stampBase');
  });

  it('ne confond pas le schéma persistant V1 avec les capacités du générateur', () => {
    const input = validCutterDocument();
    Object.assign(input.parameters, {
      enableEmbossing: true,
      enableHandle: true,
      handleStyle: 'none',
      handleHeight: 0
    });

    expect(parseDesignDocumentV1(input).parameters).toEqual(input.parameters);
  });

  it('accepte un SVG géométrique avec namespace et références locales sans le modifier', () => {
    const input = validCutterDocument();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="gradient"><stop offset="0" stop-color="#fff" /></linearGradient><path id="shape" d="M0 0h10v10z" fill="url(#gradient)" marker-start=" URL ( #shape ) " /></defs><use href="#shape" xlink:href="#shape" /></svg>';
    input.source.svg = svg;

    const parsed = parseDesignDocumentV1(input);

    expect(parsed.source).toMatchObject({ type: 'svg', svg });
  });

  it.each([
    ['du texte brut', 'pas un svg'],
    ['une racine HTML', '<html><body /></html>'],
    ['du XML mal formé', '<svg><path></svg>'],
    [
      'une déclaration DOCTYPE/ENTITY',
      '<!DOCTYPE svg [<!ENTITY payload "texte">]><svg><text>&payload;</text></svg>'
    ],
    [
      'une instruction xml-stylesheet',
      '<?xml-stylesheet href="https://example.com/active.css"?><svg />'
    ],
    ['un script', '<svg><script>alert(1)</script></svg>'],
    [
      'un foreignObject',
      '<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">actif</div></foreignObject></svg>'
    ],
    ['un gestionnaire événementiel', '<svg><path onload="alert(1)" /></svg>'],
    ['un href javascript', '<svg><use href="javascript:alert(1)" /></svg>'],
    [
      'une URL de peinture externe',
      '<svg><path fill="url(https://example.com/paint.svg#gradient)" /></svg>'
    ],
    ['un élément style', '<svg><style>path { fill: red }</style><path /></svg>'],
    ['un attribut style bénin', '<svg><path style="fill: red" /></svg>'],
    ['un style inline actif', '<svg><path style="width: expression(alert(1))" /></svg>'],
    [
      'un commentaire CSS dans un attribut de présentation',
      '<svg><path fill="red/* contournement */" /></svg>'
    ],
    [
      'un backslash dans un attribut de présentation',
      '<svg><path fill="u\\72 l(#gradient)" /></svg>'
    ]
  ])('rejette source.svg contenant %s', (_label, svg) => {
    const input = validCutterDocument();
    input.source.svg = svg;

    expectValidationPath(input, 'source.svg');
  });

  it('rejette marker-start avec une URL externe dans source.svg', () => {
    const input = validCutterDocument();
    input.source.svg =
      '<svg><path marker-start="url(https://example.com/markers.svg#start)" /></svg>';

    expectValidationPath(input, 'source.svg');
  });

  it('rejette cursor avec une URL externe dans source.vectorizedSvg', () => {
    const input = validStampDocument();
    input.source.vectorizedSvg =
      '<svg><rect cursor="URL ( https://example.com/cursor.svg#pointer )" /></svg>';

    expectValidationPath(input, 'source.vectorizedSvg');
  });

  it('rejette xml:base même avec un href local dans sketch.svg', () => {
    const input = validCutterDocument();
    input.sketch.svg =
      '<svg xml:base="https://example.com/"><symbol id="shape"><path /></symbol><use href="#shape" /></svg>';

    expectValidationPath(input, 'sketch.svg');
  });

  it('rejette tout attribut style, y compris avec un échappement CSS', () => {
    const input = validCutterDocument();
    input.source.svg =
      '<svg><path style="fill: u\\72 l(https://example.com/paint.svg#gradient)" /></svg>';

    expectValidationPath(input, 'source.svg');
  });

  it('rejette animateColor dans source.vectorizedSvg', () => {
    const input = validStampDocument();
    input.source.vectorizedSvg =
      '<svg><path><animateColor attributeName="fill" values="red;blue" /></path></svg>';

    expectValidationPath(input, 'source.vectorizedSvg');
  });

  it('rejette discard dans sketch.svg', () => {
    const input = validCutterDocument();
    input.sketch.svg = '<svg><g><discard /></g></svg>';

    expectValidationPath(input, 'sketch.svg');
  });

  it('rejette un élément géométrique dans un namespace étranger', () => {
    const input = validCutterDocument();
    input.source.svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:evil="urn:evil"><evil:path d="M0 0h1v1z" /></svg>';

    expectValidationPath(input, 'source.svg');
  });

  it('rapporte le chemin persistant exact pour chacune des trois surfaces SVG', () => {
    const source = validCutterDocument();
    source.source.svg = '<svg><script /></svg>';
    expectValidationPath(source, 'source.svg');

    const vectorized = validStampDocument();
    vectorized.source.vectorizedSvg = '<svg><script /></svg>';
    expectValidationPath(vectorized, 'source.vectorizedSvg');

    const sketch = validCutterDocument();
    sketch.sketch.svg = '<svg><script /></svg>';
    expectValidationPath(sketch, 'sketch.svg');
  });
});
