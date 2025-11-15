import type { CookieCutterParams } from '../types/CookieCutter';

export interface OptimizationIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'strength' | 'printability' | 'quality' | 'efficiency';
  message: string;
  suggestion: string;
  autoFix?: Partial<CookieCutterParams>;
}

export interface OptimizationReport {
  issues: OptimizationIssue[];
  score: number; // 0-100
  canPrint: boolean;
}

/**
 * Analyze parameters and detect potential issues
 */
export function analyzeParameters(params: CookieCutterParams): OptimizationReport {
  const issues: OptimizationIssue[] = [];

  // Check wall thickness
  if (params.wallThickness < 0.8) {
    issues.push({
      severity: 'error',
      category: 'strength',
      message: 'Wall thickness is too thin',
      suggestion: 'Walls below 0.8mm may break easily or fail to print',
      autoFix: { wallThickness: 0.8 }
    });
  } else if (params.wallThickness < 1.0) {
    issues.push({
      severity: 'warning',
      category: 'strength',
      message: 'Wall thickness is on the thin side',
      suggestion: 'Consider increasing to 1.0-1.2mm for better durability',
      autoFix: { wallThickness: 1.0 }
    });
  } else if (params.wallThickness > 2.0) {
    issues.push({
      severity: 'warning',
      category: 'efficiency',
      message: 'Wall thickness is quite thick',
      suggestion: 'Thinner walls (1.0-1.5mm) use less material and print faster',
      autoFix: { wallThickness: 1.2 }
    });
  }

  // Check cutting height
  if (params.cuttingHeight < 8) {
    issues.push({
      severity: 'warning',
      category: 'printability',
      message: 'Cutting height is very short',
      suggestion: 'Short cutters may not cut through thick dough effectively',
      autoFix: { cuttingHeight: 12 }
    });
  } else if (params.cuttingHeight > 20) {
    issues.push({
      severity: 'info',
      category: 'efficiency',
      message: 'Cutting height is quite tall',
      suggestion: 'Taller cutters use more material and take longer to print',
      autoFix: { cuttingHeight: 15 }
    });
  }

  // Check taper angle
  if (params.taperAngle > 15) {
    issues.push({
      severity: 'warning',
      category: 'printability',
      message: 'Taper angle is too steep',
      suggestion: 'Steep angles may cause overhangs that need supports',
      autoFix: { taperAngle: 10 }
    });
  }

  // Check handle height vs cutting height
  if (params.enableHandle && params.handleHeight > params.cuttingHeight * 1.5) {
    issues.push({
      severity: 'warning',
      category: 'quality',
      message: 'Handle is disproportionately tall',
      suggestion: 'Handle should be proportional to cutter height',
      autoFix: { handleHeight: Math.round(params.cuttingHeight * 0.6) }
    });
  }

  // Check stamp-specific issues
  if (params.mode === 'stamp') {
    if (params.stampDepth < 1.5) {
      issues.push({
        severity: 'warning',
        category: 'quality',
        message: 'Stamp depth is very shallow',
        suggestion: 'Shallow relief may not show well on cookies',
        autoFix: { stampDepth: 2.5 }
      });
    } else if (params.stampDepth > 4.0) {
      issues.push({
        severity: 'warning',
        category: 'printability',
        message: 'Stamp depth is very deep',
        suggestion: 'Deep relief may be hard to remove from dough',
        autoFix: { stampDepth: 3.0 }
      });
    }
  }

  // Check build plate size vs scale
  const estimatedSize = 100 * params.scale; // Rough estimate
  if (estimatedSize > params.buildPlateSize) {
    issues.push({
      severity: 'error',
      category: 'printability',
      message: 'Design may not fit on build plate',
      suggestion: 'Reduce scale or increase build plate size',
      autoFix: { scale: params.buildPlateSize / 120 }
    });
  }

  // Calculate score (100 - 10 per error, -5 per warning, -2 per info)
  let score = 100;
  issues.forEach(issue => {
    if (issue.severity === 'error') score -= 10;
    else if (issue.severity === 'warning') score -= 5;
    else score -= 2;
  });
  score = Math.max(0, score);

  // Can print if no errors
  const canPrint = !issues.some(issue => issue.severity === 'error');

  return { issues, score, canPrint };
}

/**
 * Auto-fix all issues
 */
export function autoFixIssues(
  params: CookieCutterParams,
  issues: OptimizationIssue[]
): CookieCutterParams {
  let fixed = { ...params };

  // Apply all auto-fixes
  issues.forEach(issue => {
    if (issue.autoFix) {
      fixed = { ...fixed, ...issue.autoFix };
    }
  });

  return fixed;
}

/**
 * Get optimal parameters for printing
 */
export function getOptimalParameters(baseParams: CookieCutterParams): CookieCutterParams {
  return {
    ...baseParams,
    wallThickness: 1.0,
    cuttingHeight: 12,
    taperAngle: 7,
    handleHeight: 8,
    stampDepth: 2.5,
  };
}

/**
 * Detect overhang angles
 */
export function detectOverhangs(params: CookieCutterParams): boolean {
  // Simple check: taper angle creates overhangs if too steep
  return params.taperAngle > 45;
}

/**
 * Calculate print time estimate (in minutes)
 */
export function estimatePrintTime(params: CookieCutterParams): number {
  // Very rough estimation based on volume
  const wallVolume = params.wallThickness * params.cuttingHeight * 100; // Simplified
  const handleVolume = params.enableHandle ? params.handleHeight * 50 : 0;
  const totalVolume = (wallVolume + handleVolume) * params.scale;

  // Assume 10mm³/min print speed
  return Math.round(totalVolume / 10);
}

/**
 * Calculate filament usage estimate (in grams)
 */
export function estimateFilamentUsage(params: CookieCutterParams): number {
  // Very rough estimation
  // PLA density ≈ 1.24 g/cm³
  const wallVolume = params.wallThickness * params.cuttingHeight * 100; // mm³
  const handleVolume = params.enableHandle ? params.handleHeight * 50 : 0;
  const totalVolume = (wallVolume + handleVolume) * params.scale;

  // Convert mm³ to cm³ and multiply by density
  return Math.round((totalVolume / 1000) * 1.24);
}
