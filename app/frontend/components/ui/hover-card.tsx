"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

interface HoverCardProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof PopoverContent>["side"];
  align?: ComponentProps<typeof PopoverContent>["align"];
  className?: string;
}

const CLOSE_DELAY_MS = 120;

/**
 * Popover that opens on hover and keyboard focus as well as tap, for glanceable
 * detail behind a compact control. The trigger must be focusable (a button).
 */
export function HoverCard({ trigger, children, side, align, className }: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
          {trigger}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align={align}
        className={className}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={show}
        onPointerLeave={hide}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
