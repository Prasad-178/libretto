import { voiceCredentialFields } from "./voice-config";
import type { Workflow } from "./workflow";

export type VoiceKeys = Record<string, string>;

export function VoiceCredentials({
  speech,
  values,
  statuses,
  onChange,
}: {
  speech: Workflow["speech"];
  values: VoiceKeys;
  statuses: Record<string, string>;
  onChange: (values: VoiceKeys) => void;
}) {
  const fields = voiceCredentialFields(speech);
  return (
    <>
      <p className="field-help">
        {fields[0]?.status === "livekit_api_key"
          ? "LiveKit Inference handles speech. Separate AssemblyAI and Cartesia keys are not needed. Usage is billed by LiveKit."
          : "These providers use their own credentials. Keys remain in this session."}
      </p>
      {fields.map(({ field, status, label }) => (
        <label className="input-label" key={field}>
          {label}
          <span className="field-help">
            {statuses[status] === "hosted"
              ? "Configured on this server"
              : statuses[status] === "visitor"
                ? "Using your session credential"
                : "Required for this voice configuration"}
          </span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={values[field] || ""}
            onChange={(event) =>
              onChange({ ...values, [field]: event.target.value })
            }
            placeholder={`Your ${label}`}
            maxLength={1024}
          />
        </label>
      ))}
    </>
  );
}
