import { BoardProperty } from "@/types/board";
import React, { useMemo } from "react";
import { formatFormulaValue } from "@/utils/formatFormulaValue";
import { getColorStyles } from "@/utils/colorStyles";

interface Props {
    value: any;
    property: BoardProperty;
    errorMessage?: string;
    className?: string; // Allow overriding base container styles if needed
}

export const FormulaPropertyInput: React.FC<Props> = ({
    value,
    property,
    errorMessage,
    className,
}) => {
    const displayContent = useMemo(() => {
        const formatOptions = {
            numberFormat: (property as any)?.numberFormat,
            decimalPlaces: (property as any)?.decimalPlaces,
        };
        console.log("value ++", value, property.formulaReturnType, formatOptions);
        const formattedValue = formatFormulaValue(
            value,
            property.formulaReturnType,
            formatOptions
        );
        console.log("formattedValue ++", formattedValue);

        const showAs = (property as any).showAs || "number";
        const numValue = typeof value === "number" ? value : Number(value) || 0;

        // Check if we should render progress bar/ring
        // Uses the relaxed condition: valid numeric returnType OR actual numeric value
        const parsedNum = typeof value === "number" ? value : Number(value);
        const isValidNumeric = Number.isFinite(parsedNum);

        // Check if we should render progress bar/ring
        if (
            !errorMessage &&
            isValidNumeric &&
            (showAs === "bar" || showAs === "ring")
        ) {
            const progressColor = (property as any).progressColor || "blue";
            const progressDivideByRaw = (property as any).progressDivideBy;
            const showNumberText = (property as any).showNumberText !== false;
            const divideBy =
                progressDivideByRaw && progressDivideByRaw !== 0
                    ? progressDivideByRaw
                    : 100;
            const colorStyles = getColorStyles(progressColor);
            const percentage = Math.min(
                100,
                Math.max(0, (numValue / divideBy) * 100)
            );

            const numberNode = showNumberText ? (
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formattedValue}</span>
            ) : null;

            if (showAs === "bar") {
                return (
                    <div className="flex items-center gap-2 w-full">
                        {numberNode}
                        <div className="flex-1">
                            <div
                                className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
                                style={{ height: "4px" }}
                            >
                                <div
                                    className="absolute rounded-full h-full transition-all"
                                    style={{
                                        width: `${percentage}%`,
                                        backgroundColor: colorStyles.dot,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                );
            }

            if (showAs === "ring") {
                const circumference = 2 * Math.PI * 6;
                const offset = circumference - (percentage / 100) * circumference;
                return (
                    <div className="flex items-center gap-2">
                        {numberNode}
                        <svg
                            viewBox="0 0 14 14"
                            width="20"
                            height="20"
                            className="flex-shrink-0"
                        >
                            <circle
                                cx="7"
                                cy="7"
                                r="6"
                                fill="none"
                                strokeWidth="2"
                                className="stroke-gray-200 dark:stroke-gray-700"
                            />
                            <g transform="rotate(-90 7 7)">
                                <circle
                                    cx="7"
                                    cy="7"
                                    r="6"
                                    fill="none"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
                                    style={{
                                        stroke: colorStyles.dot,
                                        transition: "stroke-dashoffset 0.5s ease-out",
                                    }}
                                />
                            </g>
                        </svg>
                    </div>
                );
            }
        }

        // Default rendering (text/number/date/etc)
        return (
            <div className="flex flex-col max-w-full">
                <span
                    className={`text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis ${errorMessage ? "text-red-600" : "text-gray-900 dark:text-gray-100"
                        }`}
                    title={typeof formattedValue === "string" ? formattedValue : undefined}
                >
                    {formattedValue}
                </span>
                {errorMessage && (
                    <span
                        className="text-xs text-red-500 mt-1 whitespace-nowrap overflow-hidden text-ellipsis"
                        title={errorMessage}
                    >
                        {errorMessage}
                    </span>
                )}
            </div>
        );
    }, [value, property, errorMessage]);

    return (
        <div className={className ?? "w-full h-full flex items-center"}>
            {displayContent}
        </div>
    );
};
