import React from "react";
import { formatNumericValue, FormatNumericValueOptions } from "./formatNumericValue";

export type { FormatNumericValueOptions };

export type FormulaReturnType = "text" | "number" | "boolean" | "date" | "id" | undefined;

type BooleanLabels = {
  trueLabel?: string;
  falseLabel?: string;
};

export interface FormatFormulaValueOptions extends FormatNumericValueOptions {
  fallback?: string;
  locale?: string;
  booleanLabels?: BooleanLabels;
}

export const isFormulaValueEmpty = (value: any): boolean =>
  value === null || value === undefined || value === "";

export const formatFormulaValue = (
  value: any,
  returnType?: FormulaReturnType,
  options?: FormatFormulaValueOptions,
): any => {
  const fallback = options?.fallback ?? "—";

  if (isFormulaValueEmpty(value)) {
    return fallback;
  }

  switch (returnType) {
    case "number": {
      return formatNumericValue(value, options);
    }

    case "boolean": {
      const trueLabel = options?.booleanLabels?.trueLabel ?? "True";
      const falseLabel = options?.booleanLabels?.falseLabel ?? "False";

      if (typeof value === "boolean") {
        return value ? trueLabel : falseLabel;
      }

      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "true") return trueLabel;
        if (lower === "false") return falseLabel;
      }

      return value ? trueLabel : falseLabel;
    }

    case "id":
    case "text": {
      return String(value);
    }

    case "date": {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleString(options?.locale);
    }

    default: {
      if (typeof value === "string" && value.startsWith('{"__styled__":true')) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.__styled__) {
            const styles = parsed.styles || [];
            const text = parsed.text;

            const styleObj: React.CSSProperties = {};
            const classes: string[] = [];

            styles.forEach((s: string) => {
              const lower = s.toLowerCase();
              if (lower === "b") styleObj.fontWeight = "bold";
              else if (lower === "i") styleObj.fontStyle = "italic";
              else if (lower === "u") styleObj.textDecoration = "underline";
              else if (lower === "s") styleObj.textDecoration = (styleObj.textDecoration ? styleObj.textDecoration + " " : "") + "line-through";
              else if (lower === "c") {
                styleObj.fontFamily = "monospace";
                styleObj.backgroundColor = "rgba(135,131,120,0.15)";
                styleObj.padding = "0.2em 0.4em";
                styleObj.borderRadius = "3px";
              }
              // Basic colors
              else if (lower === "red") styleObj.color = "rgb(224, 94, 91)";
              else if (lower === "blue") styleObj.color = "rgb(51, 126, 169)";
              else if (lower === "green") styleObj.color = "rgb(68, 131, 97)";
              else if (lower === "orange") styleObj.color = "rgb(217, 115, 13)";
              else if (lower === "yellow") styleObj.color = "rgb(203, 145, 47)";
              else if (lower === "purple") styleObj.color = "rgb(144, 101, 176)";
              else if (lower === "pink") styleObj.color = "rgb(193, 76, 138)";
              else if (lower === "brown") styleObj.color = "rgb(159, 107, 83)";
              else if (lower === "gray") styleObj.color = "rgb(151, 149, 146)";

              // Background colors
              else if (lower === "red_background") styleObj.backgroundColor = "rgba(255, 226, 221, 0.5)";
              else if (lower === "blue_background") styleObj.backgroundColor = "rgba(211, 229, 239, 0.5)";
              else if (lower === "green_background") styleObj.backgroundColor = "rgba(219, 237, 219, 0.5)";
              else if (lower === "orange_background") styleObj.backgroundColor = "rgba(250, 222, 201, 0.5)";
              else if (lower === "yellow_background") styleObj.backgroundColor = "rgba(251, 243, 219, 0.5)";
              else if (lower === "purple_background") styleObj.backgroundColor = "rgba(232, 222, 238, 0.5)";
              else if (lower === "pink_background") styleObj.backgroundColor = "rgba(245, 224, 233, 0.5)";
              else if (lower === "brown_background") styleObj.backgroundColor = "rgba(238, 224, 218, 0.5)";
              else if (lower === "gray_background") styleObj.backgroundColor = "rgba(227, 226, 224, 0.5)";
            });

            return React.createElement("span", { style: styleObj }, text);
          }
        } catch {
          // ignore
        }
      }
      return String(value);
    }
  }
};
