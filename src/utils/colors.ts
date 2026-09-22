/**
 * Color palette for console output using chalk
 * Professional Azure-themed color scheme
 */
import chalk from 'chalk';

/**
 * Azure FinOps Color Palette
 * - Cyan/Blue: Professional Azure theme for headers and sections
 * - Green: Success, positive trends, cost decreases
 * - Yellow: Warnings, medium severity, moderate changes
 * - Red: Critical issues, high costs, significant increases
 * - Magenta: Recommendations and actionable insights
 * - Gray: Secondary information (metadata, dates)
 * - White/Bright: Emphasis on important numbers and values
 */
export const colors = {
    // Sections and Headers
    header: chalk.cyan.bold,
    subheader: chalk.cyan,
    separator: chalk.gray,
    
    // Data emphasis
    value: chalk.white.bold,
    currency: chalk.white,
    label: chalk.gray,
    
    // Severity levels
    critical: chalk.red.bold,
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.blue,
    
    // Trends and changes
    positive: chalk.green,      // Cost decrease, good performance
    negative: chalk.red,        // Cost increase, concerning
    neutral: chalk.gray,        // No significant change
    
    // Special highlights
    recommendation: chalk.magenta,
    savings: chalk.green.bold,
    warning: chalk.yellow.bold,
    success: chalk.green,
    
    // Metadata
    dim: chalk.gray,
    info: chalk.cyan,
    
    // Service categories
    compute: chalk.blue,
    storage: chalk.yellow,
    networking: chalk.magenta,
    database: chalk.green,
    other: chalk.gray,
};

/**
 * Helper function to colorize severity levels
 */
export function getSeverityColor(severity: string): chalk.Chalk {
    switch (severity.toLowerCase()) {
        case 'critical':
            return colors.critical;
        case 'high':
            return colors.high;
        case 'medium':
            return colors.medium;
        case 'low':
            return colors.low;
        default:
            return colors.dim;
    }
}

/**
 * Helper function to colorize trend directions
 */
export function getTrendColor(direction: string): chalk.Chalk {
    switch (direction.toLowerCase()) {
        case 'increasing':
            return colors.negative;
        case 'decreasing':
            return colors.positive;
        default:
            return colors.neutral;
    }
}

/**
 * Helper function to colorize percentage changes
 * Negative percentages (decreases) are good for costs
 */
export function getChangeColor(changePercent: number | null): chalk.Chalk {
    if (changePercent === null) return colors.neutral;
    if (changePercent < -5) {
        return colors.positive;  // Significant decrease - good!
    } else if (changePercent > 5) {
        return colors.negative;  // Significant increase - concerning
    } else {
        return colors.neutral;   // Minor change
    }
}

/**
 * Format currency with color
 */
export function formatCurrency(amount: number | null, currency: string = 'USD'): string {
    if (amount === null || !Number.isFinite(amount)) return colors.dim('Unavailable');
    return `${colors.value(amount.toFixed(2))} ${colors.currency(currency)}`;
}

/**
 * Format percentage with appropriate color based on context (costs)
 */
export function formatPercentChange(percent: number | null, isGoodWhenNegative: boolean = true): string {
    if (percent === null || !Number.isFinite(percent)) return colors.dim('N/A (non-positive baseline)');
    const sign = percent > 0 ? '+' : '';
    const formatted = `${sign}${percent.toFixed(1)}%`;
    
    if (isGoodWhenNegative) {
        // For costs: negative is good, positive is bad
        return getChangeColor(percent)(formatted);
    } else {
        // For revenue/usage: positive is good, negative is bad
        return getChangeColor(-percent)(formatted);
    }
}
