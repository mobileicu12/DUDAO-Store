"use client";

import { useState } from "react";
import { COUNTRIES, dialFor, splitPhone } from "@/lib/countries";
import { Input, Select } from "./primitives";

/**
 * Phone entry with a country dial-code picker. Stores the combined value
 * ("+44 7700 900000") through `onChange`, and best-effort splits an existing
 * value back into flag + number on mount so editing a saved customer shows the
 * right country.
 *
 * The number is kept local so the combined string is rebuilt on every keystroke
 * — the parent only ever sees the finished value.
 */
export function PhoneField({
  value,
  onChange,
  id,
  placeholder = "7700 900000",
}: {
  value: string;
  onChange: (combined: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const [init] = useState(() => splitPhone(value));
  const [iso, setIso] = useState(init.iso);
  const [number, setNumber] = useState(init.number);

  function emit(nextIso: string, nextNumber: string) {
    const n = nextNumber.trim();
    onChange(n ? `${dialFor(nextIso)} ${n}`.trim() : "");
  }

  return (
    <div className="flex gap-2">
      <Select
        aria-label="Country dial code"
        value={iso}
        onChange={(e) => {
          setIso(e.target.value);
          emit(e.target.value, number);
        }}
        className="w-28 shrink-0"
      >
        {COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.flag} {c.dial}
          </option>
        ))}
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        value={number}
        placeholder={placeholder}
        onChange={(e) => {
          setNumber(e.target.value);
          emit(iso, e.target.value);
        }}
      />
    </div>
  );
}
