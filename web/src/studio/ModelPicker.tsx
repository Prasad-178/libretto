import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";
import { modelChoices, priceLabel, type ModelCatalog } from "./model-catalog";
export function ModelPicker({
  role,
  value,
  catalog,
  loading,
  disabled,
  onChange,
  onRetry,
}: {
  role: "response" | "controller";
  value: string;
  catalog: ModelCatalog | null;
  loading: boolean;
  disabled: boolean;
  onChange: (id: string) => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(value),
    [custom, setCustom] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const current = catalog?.models.find((m) => m.id === value);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      search.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (disabled && open) close();
  }, [disabled, open]);
  const choices = modelChoices(catalog?.models || [], value, query);
  const valid = custom
    ? selected.trim().length > 0 &&
      selected.trim().length <= 200 &&
      !/\s/.test(selected.trim())
    : !!selected;
  return (
    <div className="model-selector">
      <span>{role === "response" ? "Response model" : "Controller model"}</span>
      <button
        ref={trigger}
        className="model-trigger"
        disabled={disabled}
        aria-label={`Choose ${role} model`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setSelected(value);
          setQuery("");
          setCustom(false);
          setOpen(true);
        }}
      >
        <ProviderLogo id={value} />
        <span>
          <strong>{current?.name || value}</strong>
          <small>{value}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      <dialog
        className="model-picker"
        ref={dialog}
        aria-label={`Choose ${role} model`}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
      >
        <header>
          <div>
            <h2>Choose {role} model</h2>
            <p>
              {role === "response"
                ? "Speaks to the caller using your instructions."
                : "Interprets caller information and proposes transitions."}
            </p>
          </div>
          <button aria-label="Close model picker" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div className="model-picker-search">
          <label>
            <Search size={17} />
            <input
              ref={search}
              aria-label={custom ? "Custom model ID" : "Search models"}
              placeholder={
                custom ? "provider/model-id" : "Search by model or provider"
              }
              value={custom ? selected : query}
              onChange={(e) =>
                custom ? setSelected(e.target.value) : setQuery(e.target.value)
              }
            />
          </label>
          <div className="model-picker-tabs">
            <button
              aria-pressed={!custom}
              onClick={() => {
                setCustom(false);
                setSelected(value);
              }}
            >
              All models
            </button>
            <button
              aria-pressed={custom}
              onClick={() => {
                setCustom(true);
                setSelected(value);
              }}
            >
              Custom ID
            </button>
          </div>
        </div>
        <div className="model-picker-results">
          {loading && <p role="status">Loading OpenRouter catalog…</p>}
          {!loading && (!catalog || catalog.status === "unavailable") && (
            <p role="status">
              Catalog unavailable. Your current model and custom IDs remain
              available. <button onClick={onRetry}>Retry</button>
            </p>
          )}
          {custom ? (
            <p>
              Use the exact OpenRouter model ID. Availability and effort support
              are checked by the provider when you run a test.
            </p>
          ) : (
            <>
              <div className="model-price-heading">
                USD per 1M tokens · Input / output
              </div>
              <div role="radiogroup" aria-label="Models">
                {choices.map((m) => (
                  <label
                    className={`model-option ${selected === m.id ? "selected" : ""}`}
                    key={m.id}
                  >
                    <input
                      type="radio"
                      name={`model-${role}`}
                      value={m.id}
                      checked={selected === m.id}
                      onChange={() => setSelected(m.id)}
                    />
                    <ProviderLogo id={m.id} />
                    <span className="model-name">
                      <strong>
                        {m.name}
                        {m.id === value && <em>Current</em>}
                      </strong>
                      <small>{m.id}</small>
                    </span>
                    <span className="model-price">
                      {priceLabel(m.pricing.inputPerMillion)} /{" "}
                      {priceLabel(m.pricing.outputPerMillion)}
                      {m.pricing.request !== null &&
                        Number(m.pricing.request) > 0 && (
                          <small>
                            + {priceLabel(m.pricing.request)} / request
                          </small>
                        )}
                    </span>
                  </label>
                ))}
              </div>
              {!choices.length && !loading && (
                <p>
                  No matching models. Use Custom ID to enter an exact model ID.
                </p>
              )}
            </>
          )}
        </div>
        <footer>
          <div>
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noreferrer"
            >
              OpenRouter
            </a>{" "}
            · USD base rates
            <br />
            {catalog?.status === "stale" ? "Stale catalog · " : ""}
            {catalog?.fetchedAt
              ? `Checked ${new Date(catalog.fetchedAt).toLocaleString()}`
              : "No current price data"}
            <small>{catalog?.priceBasis}</small>
          </div>
          <button className="button" onClick={close}>
            Cancel
          </button>
          <button
            className="button black"
            disabled={!valid || disabled}
            onClick={() => {
              onChange(selected.trim());
              close();
            }}
          >
            Use model
          </button>
        </footer>
      </dialog>
    </div>
  );
}
