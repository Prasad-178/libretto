import {
  Children,
  Fragment,
  isValidElement,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type ChangeEvent,
} from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size">;
type Option = { value: string; label: ReactNode; disabled?: boolean };
function options(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string | number;
        disabled?: boolean;
      }>(child)
    )
      return [];
    if (child.type === Fragment || child.type === "optgroup")
      return options(child.props.children);
    if (child.type !== "option") return [];
    return [
      {
        value: String(
          child.props.value ?? Children.toArray(child.props.children).join(""),
        ),
        label: child.props.children,
        disabled: child.props.disabled,
      },
    ];
  });
}
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  onBlur,
  className = "",
  disabled,
  id,
  name,
  title,
  ...aria
}: Props) {
  const items = options(children);
  const [fallback, setFallback] = useState(
    String(defaultValue ?? items[0]?.value ?? ""),
  );
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const current = String(value ?? fallback);
  const encode = (v: string) => "option:" + v;
  return (
    <SelectPrimitive.Root
      value={encode(current)}
      onValueChange={(encoded) => {
        const next = encoded.slice(7);
        setFallback(next);
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as ChangeEvent<HTMLSelectElement>);
      }}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        ref={setTrigger}
        id={id}
        title={title}
        onBlur={onBlur as never}
        className={"studio-select-trigger " + className}
      >
        <span className="studio-select-body">
        <SelectPrimitive.Value placeholder="Choose…" />
        <SelectPrimitive.Icon className="studio-select-chevron">
          <ChevronDown size={15} />
        </SelectPrimitive.Icon>
        </span>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal
        container={trigger?.closest("dialog") ?? undefined}
      >
        <SelectPrimitive.Content
          className="studio-select-menu"
          position="popper"
          sideOffset={5}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="studio-select-scroll">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="studio-select-options">
            {!items.some((item) => item.value === current) && current && (
              <SelectPrimitive.Item
                value={encode(current)}
                className="studio-select-option"
              >
                <SelectPrimitive.ItemText>{current}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            )}
            {items.map((item) => (
              <SelectPrimitive.Item
                key={item.value}
                value={encode(item.value)}
                disabled={item.disabled}
                className="studio-select-option"
              >
                <SelectPrimitive.ItemText>
                  {item.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="studio-select-check">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="studio-select-scroll">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
