export const DESIGN_KINDS = [
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

export type DesignKind = (typeof DESIGN_KINDS)[number];

export const IMPLEMENTED_DESIGN_KINDS = ['cutter', 'stamp', 'multi-cutter'] as const;

export type ImplementedDesignKind = (typeof IMPLEMENTED_DESIGN_KINDS)[number];

export function isDesignKind(value: unknown): value is DesignKind {
  return (
    typeof value === 'string' &&
    DESIGN_KINDS.some((designKind) => designKind === value)
  );
}

export function isImplementedDesignKind(
  value: unknown
): value is ImplementedDesignKind {
  return (
    typeof value === 'string' &&
    IMPLEMENTED_DESIGN_KINDS.some((designKind) => designKind === value)
  );
}
