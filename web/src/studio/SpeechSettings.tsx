import type { Workflow } from "../workflow";
import { voiceEngine, voicePresets } from "../voice-config";
import { Select } from "../ui/Select";
import type { DocumentTransaction, EditOperation } from "./types";
import type { StudioCapabilities } from "./runtime-api";
import { RecognitionTerms } from "./RecognitionTerms";
import { PronunciationRows } from "./PronunciationRows";
import { VoicePicker } from "./VoicePicker";

type Change = (
  path: (string | number)[],
  value: unknown,
  group?: string,
) => void;
const providerNames: Record<string, string> = {
  assemblyai: "AssemblyAI",
  cartesia: "Cartesia",
  deepgram: "Deepgram",
};
export function SpeechSettings({
  workflow,
  capabilities,
  disabled,
  change,
  onTransaction,
  onConnection,
  onHistoryEnd,
  cartesiaKey,
}: {
  workflow: Workflow;
  capabilities: StudioCapabilities | null;
  disabled: boolean;
  change: Change;
  onTransaction: (tx: DocumentTransaction) => void;
  onConnection: () => void;
  onHistoryEnd: () => void;
  cartesiaKey: string;
}) {
  const engine = voiceEngine(workflow.speech),
    preset = voicePresets[engine],
    mode =
      workflow.speech?.credential_mode ||
      (engine === "direct" ? "providers" : "inference");
  // An explicitly provided endpoint uses SpeechEndpoint's provider default.
  const stt: { provider: string; model: string; voice?: string | null } =
    workflow.speech?.stt
      ? {
          ...workflow.speech.stt,
          provider: workflow.speech.stt.provider ?? "deepgram",
        }
      : preset.stt;
  const tts: { provider: string; model: string; voice?: string | null } =
    workflow.speech?.tts
      ? {
          ...workflow.speech.tts,
          provider: workflow.speech.tts.provider ?? "deepgram",
        }
      : preset.tts;
  const choices = (role: "stt" | "tts", current: typeof stt) => [
    ...new Map(
      [
        { role, ...current },
        ...(capabilities?.speechChoices || []).filter(
          (c) => c.role === role && (c.engine || "direct") === engine,
        ),
      ].map((c) => [`${c.provider}/${c.model}`, c]),
    ).values(),
  ];
  const chooseModel = (role: "stt" | "tts", id: string) => {
    const [provider, model] = id.split("/");
    const operations: EditOperation[] = [
      { op: "set", path: ["speech", role, "provider"], value: provider },
      { op: "set", path: ["speech", role, "model"], value: model },
    ];
    if (role === "tts" && provider !== tts.provider)
      operations.push({
        op: "set",
        path: ["speech", "tts", "voice"],
        value:
          provider === "cartesia"
            ? voicePresets.livekit.tts.voice
            : provider === "deepgram" && engine === "livekit"
              ? "athena"
              : null,
      });
    onTransaction({ label: `Change ${role.toUpperCase()} model`, operations });
  };
  return (
    <div className="speech-settings">
      <div className="speech-connection-controls">
        <label>
          Voice integration
          <Select
            value={engine}
            onChange={(event) => {
              const next =
                voicePresets[event.target.value as "livekit" | "direct"];
              onTransaction({
                label: "Change voice integration",
                operations: Object.entries(next).map(([key, value]) => ({
                  op: "set",
                  path: ["speech", key],
                  value,
                })),
              });
            }}
          >
            <option value="livekit">LiveKit</option>
            <option value="direct">Direct Deepgram</option>
          </Select>
        </label>
        {engine === "livekit" && (
          <label>
            Speech credentials
            <Select
              value={mode}
              onChange={(e) =>
                change(["speech", "credential_mode"], e.target.value)
              }
            >
              <option value="inference">
                LiveKit Inference · LiveKit credentials
              </option>
              <option value="providers">
                Direct plugins · individual provider keys
              </option>
            </Select>
          </label>
        )}
        <button
          className="button"
          aria-label="Configure test connection"
          onClick={onConnection}
        >
          Connection settings
        </button>
      </div>
      <div className="speech-panes">
        <section
          className="speech-pane stt-pane"
          role="region"
          aria-label="Speech recognition settings"
        >
          <h3>
            Speech recognition <span>STT</span>
          </h3>
          <p>Turn the caller’s speech into text.</p>
          <label>
            Recognition model
            <Select
              value={`${stt.provider}/${stt.model}`}
              onChange={(e) => chooseModel("stt", e.target.value)}
            >
              {choices("stt", stt).map((c) => (
                <option
                  key={`${c.provider}/${c.model}`}
                  value={`${c.provider}/${c.model}`}
                >
                  {Object.hasOwn(providerNames, c.provider)
                    ? providerNames[c.provider]
                    : c.provider}{" "}
                  · {c.model}
                </option>
              ))}
            </Select>
          </label>
          <div className="recognition-vocabulary">
            <h4>Recognition vocabulary</h4>
            <p>Names, places and terms the recognizer should listen for.</p>
            {engine === "livekit" && (
              <p className="speech-capability-note">
                Saved in YAML; inactive in this LiveKit adapter. Direct Deepgram
                uses these recognition hints.
              </p>
            )}
            <RecognitionTerms
              value={workflow.speech?.hints || []}
              disabled={disabled}
              onChange={(terms) => change(["speech", "hints"], terms)}
            />
          </div>
          <details className="speech-advanced">
            <summary>Advanced recognition settings</summary>
            {engine === "direct" && (
              <label>
                Stored credential mode · inactive
                <Select
                  value={mode}
                  onChange={(e) =>
                    change(["speech", "credential_mode"], e.target.value)
                  }
                >
                  <option value="providers">Provider credentials</option>
                  <option value="inference">Inference</option>
                </Select>
                <span>
                  Direct Deepgram always uses its provider key; this retained
                  value is inactive.
                </span>
              </label>
            )}
            <label>
              STT provider ID
              <input
                value={stt.provider}
                disabled={disabled}
                onChange={(e) =>
                  change(["speech", "stt", "provider"], e.target.value)
                }
              />
            </label>
            <label>
              STT model ID
              <input
                value={stt.model}
                disabled={disabled}
                onChange={(e) =>
                  change(["speech", "stt", "model"], e.target.value)
                }
              />
            </label>
            <label>
              STT voice ID · inactive
              <input
                value={stt.voice || ""}
                disabled={disabled}
                onChange={(e) =>
                  change(["speech", "stt", "voice"], e.target.value || null)
                }
              />
            </label>
            <p>
              Voice IDs are not used by recognition. A value imported in YAML is
              preserved.
            </p>
          </details>
        </section>
        <section
          className="speech-pane tts-pane"
          role="region"
          aria-label="Voice output settings"
        >
          <h3>
            Voice output <span>TTS</span>
          </h3>
          <p>Turn the agent’s replies into speech.</p>
          <label>
            Speech model
            <Select
              value={`${tts.provider}/${tts.model}`}
              onChange={(e) => chooseModel("tts", e.target.value)}
            >
              {choices("tts", tts).map((c) => (
                <option
                  key={`${c.provider}/${c.model}`}
                  value={`${c.provider}/${c.model}`}
                >
                  {Object.hasOwn(providerNames, c.provider)
                    ? providerNames[c.provider]
                    : c.provider}{" "}
                  · {c.model}
                </option>
              ))}
            </Select>
          </label>
          {engine === "direct" ? (
            <div className="speech-fixed-voice">
              <h4>Voice</h4>
              <p>Haley · included in the Direct Deepgram speech model.</p>
            </div>
          ) : (
            <VoicePicker
              key={`${engine}:${mode}:${tts.provider}:${tts.model}`}
              scope={{
                engine,
                credentialMode: mode,
                provider: tts.provider,
                model: tts.model,
              }}
              sessionKey={mode === "providers" ? cartesiaKey : ""}
              value={tts.voice || ""}
              disabled={disabled}
              onChange={(id) => change(["speech", "tts", "voice"], id)}
            />
          )}
          <PronunciationRows
            value={workflow.speech?.pronunciations || []}
            disabled={disabled}
            onChange={(rows, group) =>
              change(["speech", "pronunciations"], rows, group)
            }
            onHistoryEnd={onHistoryEnd}
          />
          <details className="speech-advanced">
            <summary>Advanced synthesis settings</summary>
            <label>
              TTS provider ID
              <input
                value={tts.provider}
                disabled={disabled}
                onChange={(e) =>
                  change(["speech", "tts", "provider"], e.target.value)
                }
              />
            </label>
            <label>
              TTS model ID
              <input
                value={tts.model}
                disabled={disabled}
                onChange={(e) =>
                  change(["speech", "tts", "model"], e.target.value)
                }
              />
            </label>
            <label>
              Voice ID{engine === "direct" ? " · inactive for this model" : ""}
              <input
                value={tts.voice || ""}
                disabled={disabled}
                onChange={(e) =>
                  change(["speech", "tts", "voice"], e.target.value || null)
                }
              />
            </label>
            <p>
              Provider and model availability are checked before a test.
              Existing custom IDs remain editable.
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}
