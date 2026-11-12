import { RotateCcw } from "lucide-react";
import { effortName, effortOptions, type CatalogModel } from "./model-catalog";
export function ReasoningControl({
  model,
  value,
  onChange,
  disabled = false,
}: {
  model?: CatalogModel;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const efforts = effortOptions(model?.reasoning);
  const effective =
    value === "default" ? model?.reasoning?.default_effort : value;
  const index = efforts.indexOf(effective || "");
  const retained = value !== "default" && index < 0;
  const label =
    value === "default"
      ? effective
        ? `Default · ${effortName(effective)}`
        : "Model default"
      : `${effortName(value)}${retained ? " (retained override)" : ""}`;
  return (
    <section className="reasoning-section" aria-label="Reasoning effort">
      <h3>Reasoning effort</h3>
      <div className="reasoning-card">
        <div className="reasoning-heading">
          <div>
            <strong>{label}</strong>
            <span>{model?.name || "Selected response model"}</span>
          </div>
          <button
            className="button"
            disabled={disabled}
            onClick={() => onChange("default")}
            title="Use the model default without an effort override"
          >
            <RotateCcw size={14} />
            Default
          </button>
        </div>
        {efforts.length > 1 && (
          <>
            <input
              className={`effort-slider ${index < 0 ? "no-thumb" : ""}`}
              type="range"
              aria-label="Response reasoning"
              aria-valuetext={label}
              min={0}
              max={efforts.length - 1}
              step={1}
              value={Math.max(index, 0)}
              disabled={disabled}
              onChange={(e) => onChange(efforts[Number(e.target.value)])}
              onPointerUp={(e) =>
                onChange(efforts[Number(e.currentTarget.value)])
              }
              onKeyDown={(e) => {
                if (e.key === "Home" || e.key === "End") {
                  e.preventDefault();
                  onChange(
                    e.key === "Home" ? efforts[0] : efforts[efforts.length - 1],
                  );
                }
              }}
            />
            <div className="effort-labels">
              {efforts.map((e) => (
                <span key={e}>{effortName(e)}</span>
              ))}
            </div>
          </>
        )}
        {efforts.length === 1 && (
          <button
            className="button"
            disabled={disabled}
            onClick={() => onChange(efforts[0])}
          >
            {effortName(efforts[0])}
          </button>
        )}
      </div>
      <p>
        {!efforts.length
          ? "OpenRouter does not report selectable efforts for this model. Your saved setting is preserved."
          : retained
            ? "The saved override is not reported as supported. Choose a supported level or reset to Default."
            : "Moving the slider saves an explicit override. Default leaves the effort to the model."}
      </p>
    </section>
  );
}
