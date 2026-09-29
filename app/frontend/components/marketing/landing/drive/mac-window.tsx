import type { ReactNode } from "react";

/** macOS window chrome: traffic lights, a title, a centred toolbar slot and a right aside. */
export function MacWindow({
  title,
  toolbar,
  aside,
  children,
}: {
  title: string;
  toolbar?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="zh-win corner-squircle">
      <div className="zh-win-bar">
        <span className="zh-lights" aria-hidden="true">
          <span className="zh-light zh-light-r">
            <svg viewBox="0 0 12 12">
              <path d="M3.8 3.8 8.2 8.2M8.2 3.8 3.8 8.2" />
            </svg>
          </span>
          <span className="zh-light zh-light-y">
            <svg viewBox="0 0 12 12">
              <path d="M3.2 6h5.6" />
            </svg>
          </span>
          <span className="zh-light zh-light-g">
            <svg viewBox="0 0 12 12">
              <path d="M6 3.2v5.6M3.2 6h5.6" />
            </svg>
          </span>
        </span>
        <span className="zh-win-title">{title}</span>
        {toolbar ? <div className="zh-win-tool">{toolbar}</div> : null}
        {aside ? <div className="zh-win-aside">{aside}</div> : null}
      </div>
      <div className="zh-win-body">{children}</div>
    </div>
  );
}
