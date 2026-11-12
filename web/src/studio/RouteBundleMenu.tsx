import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, ArrowRight, ChevronDown } from "lucide-react";
import type { BranchData } from "../graph";

/** Portal keeps graph nodes from covering connection menus in React Flow's label layer. */
export function RouteBundleMenu({
  members,
}: {
  members: NonNullable<BranchData["members"]>;
}) {
  const [open, setOpen] = useState(false);
  const choosing = useRef(false);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        choosing.current = false;
        setOpen(value);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flow-condition nodrag nopan"
          aria-label={`View ${members.length} result connections`}
        >
          <span>{members.length} results</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="route-bundle-popover"
          aria-label="Result connections"
          sideOffset={8}
          collisionPadding={12}
          align="start"
          onCloseAutoFocus={(event) => {
            if (choosing.current) event.preventDefault();
          }}
        >
          <p>Choose a connection to edit</p>
          {members.map((member, index) => (
            <button
              type="button"
              key={index}
              className={
                member.tone === "unknown" ? "unknown-result" : undefined
              }
              onClick={() => {
                choosing.current = true;
                setOpen(false);
                member.inspect();
              }}
            >
              <span className="route-result-icon" aria-hidden="true">
                {member.tone === "unknown" && <AlertTriangle size={13} />}
              </span>
              <span>{member.label}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
