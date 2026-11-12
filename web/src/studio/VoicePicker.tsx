import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { Select } from "../ui/Select";
import { createStudioApi } from "./runtime-api";
import type { VoiceCatalog, VoiceChoice, VoiceQuery } from "./voice-catalog";

/** Catalog responses and authenticated caches stay in this mounted session view. */
export function VoicePicker({
  scope,
  value,
  sessionKey = "",
  disabled,
  onChange,
}: {
  scope: Omit<VoiceQuery, "query" | "cursor">;
  value: string;
  sessionKey?: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [language, setLanguage] = useState("all"),
    [custom, setCustom] = useState(false),
    [customId, setCustomId] = useState(value),
    [catalog, setCatalog] = useState<VoiceCatalog | null>(null),
    [voices, setVoices] = useState<VoiceChoice[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState(""),
    [revision, setRevision] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const cache = useRef(new Map<string, VoiceCatalog>()),
    names = useRef(new Map<string, string>()),
    search = useRef<HTMLInputElement>(null);
  const identity = JSON.stringify(scope);
  useEffect(() => {
    cache.current.clear();
    names.current.clear();
    setCatalog(null);
    setVoices([]);
    setCursor("");
    setQuery("");
    setLanguage("all");
    setCustom(false);
  }, [identity, sessionKey]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (custom) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const cacheKey = JSON.stringify([query, cursor]);
      const pending = cache.current.has(cacheKey)
        ? Promise.resolve(cache.current.get(cacheKey)!)
        : createStudioApi("").voices(
            { ...scope, query, cursor },
            sessionKey,
            controller.signal,
          );
      pending
        .then((result) => {
          if (controller.signal.aborted) return;
          cache.current.set(cacheKey, result);
          for (const voice of result.voices)
            names.current.set(voice.id, voice.name);
          setCatalog(result);
          setVoices((previous) =>
            cursor
              ? [
                  ...previous,
                  ...result.voices.filter(
                    (v) => !previous.some((old) => old.id === v.id),
                  ),
                ]
              : result.voices,
          );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "Voice discovery failed. Your configured voice is preserved. Check Connection or retry.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, custom, identity, sessionKey, query, cursor, revision]);
  const shown = voices.filter(
    (v) => language === "all" || v.language === language,
  );
  return (
    <div className="voice-picker-field">
      <span>Voice</span>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            const box = trigger.current?.getBoundingClientRect();
            setSide(
              box && window.innerHeight - box.bottom < 360 && box.top > 360
                ? "top"
                : "bottom",
            );
            setCustom(false);
            setQuery("");
            setCursor("");
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            className="voice-trigger"
            ref={trigger}
            aria-label="Choose voice"
            disabled={disabled}
          >
            <span>{names.current.get(value) || value || "Choose a voice"}</span>
            <ChevronDown size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="voice-popover"
            aria-label="Choose voice"
            sideOffset={6}
            side={side}
            align="start"
            collisionPadding={12}
            hideWhenDetached
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              search.current?.focus();
            }}
          >
            <header>
              <input
                ref={search}
                aria-label={custom ? "Custom voice ID" : "Search voices"}
                placeholder={custom ? "Paste voice ID" : "Search voices…"}
                value={custom ? customId : query}
                maxLength={custom ? 100 : 200}
                onChange={(e) => {
                  if (custom) setCustomId(e.target.value);
                  else {
                    setQuery(e.target.value);
                    setCursor("");
                    setVoices([]);
                  }
                }}
              />
              {!custom && (
                <Select
                  aria-label="Voice language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="all">All languages</option>
                  {[...new Set(voices.map((v) => v.language))].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
              )}
              <Popover.Close aria-label="Close voice picker">
                <X size={17} />
              </Popover.Close>
            </header>
            <div className="voice-popover-list">
              {custom ? (
                <>
                  <p>
                    Use a voice supported by the selected provider and
                    credential route. Inference cannot use pre-existing Cartesia
                    custom/community voices.
                  </p>
                  <button
                    className="button black"
                    disabled={disabled || !customId.trim()}
                    onClick={() => {
                      onChange(customId.trim());
                      setOpen(false);
                    }}
                  >
                    Use voice ID
                  </button>
                </>
              ) : (
                <>
                  {loading && <p role="status">Loading voices…</p>}
                  {error && (
                    <p role="alert">
                      {error}{" "}
                      <button
                        onClick={() => {
                          cache.current.clear();
                          setRevision((n) => n + 1);
                        }}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  {shown.map((v) => (
                    <button
                      className={`voice-option ${value === v.id ? "selected" : ""}`}
                      key={v.id}
                      disabled={disabled}
                      aria-label={`${v.name} · ${v.language}`}
                      onClick={() => {
                        onChange(v.id);
                        setOpen(false);
                      }}
                    >
                      <span aria-hidden="true" className="voice-selection" />
                      <strong>{v.name}</strong>
                      <small>{v.language}</small>
                    </button>
                  ))}
                  {!shown.length && !loading && !error && (
                    <p>
                      No voices match this search. Your current voice remains
                      configured.
                    </p>
                  )}
                  {catalog?.nextCursor && (
                    <button
                      className="voice-load-more"
                      disabled={loading}
                      onClick={() => setCursor(catalog.nextCursor!)}
                    >
                      Load more voices
                    </button>
                  )}
                </>
              )}
            </div>
            <footer>
              <div>
                {catalog?.kind === "account"
                  ? "Cartesia account voices"
                  : "Compatible suggestions"}
                <small>
                  {scope.credentialMode === "inference" &&
                  scope.provider === "cartesia"
                    ? "Default voices only; no pre-existing custom/community voices."
                    : catalog?.kind === "suggested" &&
                        scope.provider === "cartesia"
                      ? "Add a Cartesia session key in Connection to browse account voices."
                      : "Current/custom IDs are preserved."}
                </small>
              </div>
              <button
                onClick={() => {
                  setCustom(!custom);
                  setCustomId(value);
                }}
              >
                {custom ? "Browse voices" : "Enter voice ID"}
              </button>
            </footer>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
