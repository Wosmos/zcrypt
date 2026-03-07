import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-400 transition-colors">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full h-10 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all duration-200 focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10 focus:bg-zinc-900/80",
            icon && "pl-10",
            className
          )}
          {...props}
        />
      </div>
    </div>
  )
);

Input.displayName = "Input";
