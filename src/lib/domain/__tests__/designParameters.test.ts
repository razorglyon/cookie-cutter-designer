import { describe, expect, expectTypeOf, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../types/CookieCutter';
import {
  DESIGN_KINDS,
  IMPLEMENTED_DESIGN_KINDS,
  isDesignKind,
  isImplementedDesignKind,
  type ImplementedDesignKind
} from '../designKind';
import {
  DEFAULT_CUTTER_PARAMETERS_V1,
  DEFAULT_STAMP_PARAMETERS_V1,
  createDefaultCutterParameters,
  createDefaultStampParameters,
  type CutterDesignParameters,
  type DesignHandleStyleV1,
  type DesignParametersByKind,
  type DesignSizeModeV1,
  type StampDesignParameters
} from '../designParameters';

const EXPECTED_DESIGN_KINDS = [
  'cutter',
  'imprint-cutter',
  'stamp',
  'cutter-and-stamp',
  'multi-cutter',
  'cutter-set',
  'stencil',
  'sandwich-cutter',
  'cake-topper',
  'cake-pop-mold',
  'practice-cookie'
] as const;

const EXPECTED_IMPLEMENTED_DESIGN_KINDS = ['cutter', 'stamp'] as const;

type ExpectedDesignSizeModeV1 = 'longest' | 'width' | 'height';
type ExpectedDesignHandleStyleV1 =
  | 'round'
  | 'chamfered'
  | 'rectangular'
  | 'flat'
  | 'none';

interface ExpectedDesignParametersV1<TMode extends 'cutter' | 'stamp'> {
  readonly wallThickness: number;
  readonly cuttingHeight: number;
  readonly totalHeight: number;
  readonly taperAngle: number;
  readonly targetSize: number;
  readonly sizeMode: ExpectedDesignSizeModeV1;
  readonly handleStyle: ExpectedDesignHandleStyleV1;
  readonly handleHeight: number;
  readonly enableHandle: boolean;
  readonly enableEmbossing: boolean;
  readonly embossDepth: number;
  readonly buildPlateSize: number;
  readonly mode: TMode;
  readonly stampDepth: number;
  readonly stampBase: boolean;
}

const EXPECTED_CUTTER_PARAMETERS_V1 = {
  wallThickness: 1,
  cuttingHeight: 12,
  totalHeight: 20,
  taperAngle: 7,
  targetSize: 75,
  sizeMode: 'longest',
  handleStyle: 'round',
  handleHeight: 8,
  enableHandle: true,
  enableEmbossing: false,
  embossDepth: 2.5,
  buildPlateSize: 200,
  mode: 'cutter',
  stampDepth: 3,
  stampBase: true
} as const satisfies ExpectedDesignParametersV1<'cutter'>;

const EXPECTED_STAMP_PARAMETERS_V1 = {
  wallThickness: 1,
  cuttingHeight: 12,
  totalHeight: 20,
  taperAngle: 7,
  targetSize: 75,
  sizeMode: 'longest',
  handleStyle: 'round',
  handleHeight: 8,
  enableHandle: true,
  enableEmbossing: false,
  embossDepth: 2.5,
  buildPlateSize: 200,
  mode: 'stamp',
  stampDepth: 3,
  stampBase: true
} as const satisfies ExpectedDesignParametersV1<'stamp'>;

describe('DesignKind', () => {
  it('expose toutes les recettes dans un ordre stable', () => {
    expect(DESIGN_KINDS).toEqual(EXPECTED_DESIGN_KINDS);
  });

  it('expose exactement Cutter et Stamp comme recettes implémentées', () => {
    expect(IMPLEMENTED_DESIGN_KINDS).toEqual(EXPECTED_IMPLEMENTED_DESIGN_KINDS);
    expectTypeOf<ImplementedDesignKind>().toEqualTypeOf<
      (typeof EXPECTED_IMPLEMENTED_DESIGN_KINDS)[number]
    >();
  });

  it('reconnaît toutes les recettes du catalogue', () => {
    for (const kind of EXPECTED_DESIGN_KINDS) {
      expect(isDesignKind(kind)).toBe(true);
    }

    expect(isDesignKind('unknown')).toBe(false);
    expect(isDesignKind(42)).toBe(false);
    expect(isDesignKind(null)).toBe(false);
  });

  it('reconnaît uniquement les recettes implémentées', () => {
    for (const kind of EXPECTED_IMPLEMENTED_DESIGN_KINDS) {
      expect(isImplementedDesignKind(kind)).toBe(true);
    }

    expect(isImplementedDesignKind('imprint-cutter')).toBe(false);
    expect(isImplementedDesignKind('unknown')).toBe(false);
    expect(isImplementedDesignKind(42)).toBe(false);
    expect(isImplementedDesignKind(null)).toBe(false);
  });
});

describe('paramètres de conception par défaut', () => {
  it('expose des snapshots V1 exacts et gelés', () => {
    expect(DEFAULT_CUTTER_PARAMETERS_V1).toEqual(EXPECTED_CUTTER_PARAMETERS_V1);
    expect(DEFAULT_STAMP_PARAMETERS_V1).toEqual(EXPECTED_STAMP_PARAMETERS_V1);
    expect(Object.isFrozen(DEFAULT_CUTTER_PARAMETERS_V1)).toBe(true);
    expect(Object.isFrozen(DEFAULT_STAMP_PARAMETERS_V1)).toBe(true);
  });

  it('verrouille volontairement le snapshot Cutter V1 sur le défaut legacy actuel', () => {
    // Toute dérive du legacy doit casser ce test et déclencher une migration explicite du schéma.
    expect(DEFAULT_PARAMS).toEqual(EXPECTED_CUTTER_PARAMETERS_V1);
  });

  it('crée des copies Cutter fraîches du snapshot V1', () => {
    const first = createDefaultCutterParameters();
    const second = createDefaultCutterParameters();

    expect(first).toEqual(DEFAULT_CUTTER_PARAMETERS_V1);
    expect(first).not.toBe(DEFAULT_CUTTER_PARAMETERS_V1);
    expect(first).not.toBe(second);
  });

  it('crée des copies Stamp fraîches du snapshot V1', () => {
    const first = createDefaultStampParameters();
    const second = createDefaultStampParameters();

    expect(first).toEqual(DEFAULT_STAMP_PARAMETERS_V1);
    expect(first).not.toBe(DEFAULT_STAMP_PARAMETERS_V1);
    expect(first).not.toBe(second);
  });

  it('expose des types V1 explicites, readonly et à modes littéraux', () => {
    expectTypeOf<DesignSizeModeV1>().toEqualTypeOf<ExpectedDesignSizeModeV1>();
    expectTypeOf<DesignHandleStyleV1>().toEqualTypeOf<ExpectedDesignHandleStyleV1>();
    expectTypeOf<CutterDesignParameters>().toEqualTypeOf<
      ExpectedDesignParametersV1<'cutter'>
    >();
    expectTypeOf<StampDesignParameters>().toEqualTypeOf<
      ExpectedDesignParametersV1<'stamp'>
    >();
    expectTypeOf<CutterDesignParameters['mode']>().toEqualTypeOf<'cutter'>();
    expectTypeOf<StampDesignParameters['mode']>().toEqualTypeOf<'stamp'>();
  });

  it('maintient une map exhaustive dont toutes les recettes futures valent never', () => {
    expectTypeOf<DesignParametersByKind>().toEqualTypeOf<{
      cutter: CutterDesignParameters;
      'imprint-cutter': never;
      stamp: StampDesignParameters;
      'cutter-and-stamp': never;
      'multi-cutter': never;
      'cutter-set': never;
      stencil: never;
      'sandwich-cutter': never;
      'cake-topper': never;
      'cake-pop-mold': never;
      'practice-cookie': never;
    }>();
  });
});
