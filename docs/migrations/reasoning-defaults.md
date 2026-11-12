# Response reasoning defaults

`models.reasoning: default` now leaves the effort choice to the selected OpenRouter model/provider. Libretto omits `reasoning.effort` and does not force `reasoning.enabled`; it continues excluding reasoning text from the spoken reply. Resetting to Default must save this explicit value, rather than copying the model's currently advertised effort.

Existing YAML that omits `models.reasoning` continues sending `minimal`. Existing explicit `minimal`, `low`, `medium` and `high` values keep their behavior. `none`, `xhigh` and `max` are also accepted; use only efforts supported by the selected model. `none` is an explicit request to disable reasoning, distinct from Default.

The stage controller continues using its separate minimal-effort configuration. This change does not replace controller instructions or execution rules.

Studio now offers the shared searchable OpenRouter catalog for response and controller model IDs. The response slider shows advertised effort levels; reset writes `default`. A saved unsupported override is retained and flagged rather than silently migrated. If OpenRouter does not report effort selection, Studio preserves the setting and offers Default without inventing levels. Unknown defaults have no positioned thumb. Model support and reported defaults must come from the public [OpenRouter catalog and reasoning metadata](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#discovering-per-model-reasoning-options); missing metadata must not be guessed.
