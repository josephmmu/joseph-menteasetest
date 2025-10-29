import React, { useEffect, useRef } from "react";

/**
 * AutoGrowTextarea
 * - Grows to fit content height (no internal scroll)
 * - You can pass className to apply your styles (e.g., snx-textarea)
 */
export default function AutoGrowTextarea({
  value,
  onChange,
  className = "",
  placeholder = "",
  ...props
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset, then set to scrollHeight to shrink/grow accurately
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
      style={{
        overflow: "hidden",
        resize: "none", // user resizes the popup, not the field
      }}
      {...props}
    />
  );
}
