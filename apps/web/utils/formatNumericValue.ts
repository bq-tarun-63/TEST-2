export interface FormatNumericValueOptions {
    locale?: string;
    numberFormat?: "number" | "percent" | "currency" | string;
    decimalPlaces?: number;
}

export const formatNumericValue = (
    value: any,
    options?: FormatNumericValueOptions
): string => {
    let num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) {
        return String(value);
    }

    // Handle decimal places
    if (typeof options?.decimalPlaces === "number") {
        const multiplier = Math.pow(10, options.decimalPlaces);
        num = Math.round(num * multiplier) / multiplier;
    }

    // Format as string with locale and precise decimal places
    let formatted = options?.locale
        ? num.toLocaleString(options.locale, {
            minimumFractionDigits: options?.decimalPlaces,
            maximumFractionDigits: options?.decimalPlaces,
        })
        : num.toLocaleString(undefined, {
            minimumFractionDigits: options?.decimalPlaces,
            maximumFractionDigits: options?.decimalPlaces,
        });

    // Apply number format
    if (options?.numberFormat === "percent") {
        formatted = `${formatted}%`;
    } else if (options?.numberFormat === "currency") {
        formatted = `$${formatted}`;
    }

    return formatted;
};
