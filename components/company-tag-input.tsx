"use client";

import { useState, type ClipboardEvent, type KeyboardEvent } from "react";

export function parseCompanyTokens(existing: string[], raw: string, maximum = 5) {
  const companies = [...existing];
  const seen = new Set(existing.map((name) => name.toLocaleLowerCase()));
  let overflowCount = 0;

  for (const token of raw.split(/[,\n]/)) {
    const name = token.replace(/\s+/g, " ").trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    if (companies.length >= maximum) {
      overflowCount += 1;
      continue;
    }
    seen.add(key);
    companies.push(name);
  }

  return { companies, overflowCount };
}

type Props = {
  companies: string[];
  onChange: (companies: string[]) => void;
  disabled?: boolean;
};

export function CompanyTagInput({ companies, onChange, disabled = false }: Props) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  function addTokens(raw: string) {
    const parsed = parseCompanyTokens(companies, raw);
    onChange(parsed.companies);
    setMessage(parsed.overflowCount > 0 ? "You can research up to five companies at once." : "");
  }

  function commitDraft() {
    addTokens(draft);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && !draft && companies.length > 0) {
      onChange(companies.slice(0, -1));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!/[,\n]/.test(pasted)) return;
    event.preventDefault();
    addTokens(pasted);
    setDraft("");
  }

  return (
    <div className="tag-input-group">
      <label htmlFor="company-input">Companies to research</label>
      <div className={`tag-input ${disabled ? "is-disabled" : ""}`}>
        {companies.map((company) => (
          <span className="tag" key={company.toLocaleLowerCase()}>
            {company}
            <button
              type="button"
              aria-label={`Remove ${company}`}
              disabled={disabled}
              onClick={() => onChange(companies.filter((value) => value !== company))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="company-input"
          value={draft}
          disabled={disabled || companies.length >= 5}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={commitDraft}
          placeholder={companies.length === 0 ? "Company name or domain" : "Add another"}
          autoComplete="off"
        />
      </div>
      <div className="input-support">
        <span>{message || "Enter a company name or domain. Press Enter or comma to add."}</span>
        <span>{companies.length}/5</span>
      </div>
    </div>
  );
}
